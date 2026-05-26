# RedwoodSDK MCP Addon Setup

These instructions integrate the MCP addon into your RedwoodSDK project. The addon lets you mount a [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/model-context-protocol/) `McpAgent` as a normal `route()` handler, so rwsdk middleware/interruptors run before the MCP transport.

### 1. Copy addon files

Copy the `src` directory from this addon into your project's `src` directory. This adds:

- `src/mcp`: the `mcpHandler` route adapter.

### 2. Install dependencies

The addon's `mcpHandler` itself has no extra dependencies, but **your `McpAgent` subclass** needs the Cloudflare Agents SDK and the MCP SDK. Add them to your app:

```bash
pnpm add agents @modelcontextprotocol/sdk zod
```

(`@modelcontextprotocol/sdk` is bundled by `agents`, but install it explicitly since you import `McpServer` from it. `zod` is used to declare tool input schemas.)

### 3. Define your `McpAgent`

Create your agent. Tools are registered in `init()`; per-user identity arrives on `this.props` (see step 6).

```ts title="src/agents/MyMcpAgent.ts"
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Props = { userId: string };

export class MyMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "my-agent", version: "1.0.0" });

  async init() {
    this.server.tool("whoami", {}, async () => ({
      content: [{ type: "text", text: `You are ${this.props.userId}` }],
    }));
  }
}
```

### 4. Export the Durable Object from your worker

```ts title="src/worker.tsx"
export { MyMcpAgent } from "@/agents/MyMcpAgent";
```

### 5. Update `wrangler.jsonc`

`McpAgent` requires a **SQLite-backed** Durable Object. Add the binding and migration:

```jsonc
{
  // ... existing configuration ...

  "durable_objects": {
    "bindings": [
      {
        "name": "MCP_OBJECT",
        "class_name": "MyMcpAgent"
      }
    ]
  },

  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["MyMcpAgent"]
    }
  ]
}
```

The binding name must match the `binding` option (`mcpHandler` defaults to `"MCP_OBJECT"`). After updating `wrangler.jsonc`, run `pnpm generate` to update the generated types.

### 6. Mount the route in `src/worker.tsx`

Place the route **after** any middleware that establishes identity. The `props` callback runs once `ctx` is populated and is forwarded to the agent as `this.props`:

```ts title="src/worker.tsx"
import { defineApp } from "rwsdk/worker";
import { route } from "rwsdk/router";
import { mcpHandler } from "@/mcp";
import { MyMcpAgent } from "@/agents/MyMcpAgent";

export { MyMcpAgent } from "@/agents/MyMcpAgent";

const app = defineApp([
  authMiddleware, // your own middleware → sets ctx.user
  route("/mcp", mcpHandler(MyMcpAgent, {
    props: ({ ctx }) => ({ userId: ctx.user.id }),
  })),
]);

export default { fetch: app.fetch };
```

A bare-function route handler matches every HTTP method, so the single `route("/mcp", ...)` serves the Streamable-HTTP transport's `POST`/`GET`/`DELETE`. (For the legacy SSE transport, pass `transport: "sse"` and mount the SSE paths the Agents SDK expects.)

### 7. Run the dev server

```bash
pnpm dev
```

Your MCP endpoint is now served at `/mcp`, gated by your rwsdk middleware, with per-request identity available to the agent as `this.props`.

## Caveats

- **`path` must equal the full request path.** The Agents SDK's `serve()` matches internally on `url.pathname`. If you mount the route under a `prefix(...)` (e.g. `prefix("/api", [route("/mcp", …)])`), the real path is `/api/mcp`, so pass `mcpHandler(MyMcpAgent, { path: "/api/mcp" })` to match.
- **Don't consume the request body before this route.** MCP `POST` messages carry a body. A global middleware that reads `request.body`/`request.json()` (e.g. for logging) will empty the stream before the MCP transport sees it. Keep body-reading middleware off the MCP path, or `clone()` the request.
- **SSE transport needs both endpoints.** `transport: "streamable-http"` (default) is a single endpoint. The legacy `transport: "sse"` expects the SSE paths the Agents SDK serves (`/sse` and `/sse/message`); mount both.

## Options

`mcpHandler(agent, options)`:

| Option | Default | Purpose |
| --- | --- | --- |
| `path` | `"/mcp"` | Mount path; must match the `route()` path. |
| `binding` | `"MCP_OBJECT"` | Env var naming the McpAgent Durable Object namespace. |
| `transport` | `"streamable-http"` | `"streamable-http"` or `"sse"`. |
| `jurisdiction` | — | Durable Object jurisdiction, forwarded to the Agents SDK. |
| `corsOptions` | — | CORS options, forwarded to the Agents SDK. |
| `props` | — | `(requestInfo) => props` — request-scoped identity exposed to the agent as `this.props`. |
