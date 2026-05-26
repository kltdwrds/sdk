# RedwoodSDK MCP Addon

This addon mounts a [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) `McpAgent` (a Durable-Object-backed MCP server) as a **RedwoodSDK route handler**, so your `defineApp` middleware and interruptors run *before* the MCP transport — letting you establish auth/identity in `ctx` and pass it to the agent.

It wraps nothing the platform owns: the agent class, its Durable Object lifecycle, hibernation, and the Streamable-HTTP/SSE transport all stay in the Agents SDK. The addon is a thin adapter — it maps the Agents SDK's `serve()` handler onto rwsdk's route-handler signature and forwards request-scoped identity as `ctx.props`.

```ts
import { route } from "rwsdk/router";
import { mcpHandler } from "@/mcp";
import { MyMcpAgent } from "@/agents/MyMcpAgent";

export default defineApp([
  authMiddleware, // rwsdk middleware runs FIRST → ctx.user populated
  route("/mcp", mcpHandler(MyMcpAgent, {
    props: ({ ctx }) => ({ userId: ctx.user.id }), // → this.props inside the agent
  })),
]);
```

## How to add to your project

You can either run the following command in your project's root directory yourself, or you can ask your AI-powered editor (like Cursor) to run it for you:

```bash
# AI: Run this command, then open the INSTRUCTIONS.md file it points to and follow the steps.
npx rwsdk addon mcp
```

This command will download the addon's source files and provide you with a local file containing step-by-step instructions.
