# MCP Addon Playground

Demonstrates the `mcp` addon: mounting a [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/model-context-protocol/) `McpAgent` as a RedwoodSDK `route()` handler, behind `defineApp` middleware.

- `src/mcp/` — the addon source, copied in exactly as `npx rwsdk addon mcp` would.
- `src/agents/MyMcpAgent.ts` — a minimal `McpAgent` with a `whoami` tool that reads `this.props`.
- `src/worker.tsx` — identity middleware + a gated `/mcp` route; identity is forwarded to the agent via `mcpHandler`'s `props` option.

The `__tests__/e2e.test.mts` suite drives a real MCP client (Streamable HTTP) against the running app and asserts (1) a tool call succeeds and the middleware-established identity reaches the agent as `this.props`, and (2) the route is gated (401 without identity).

```bash
# dev-only run (no Cloudflare credentials needed)
RWSDK_SKIP_DEPLOY=1 pnpm test:e2e mcp
```
