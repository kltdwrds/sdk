import { env } from "cloudflare:workers";
import type { RequestInfo } from "rwsdk/worker";

/**
 * The single static method this addon needs from a Cloudflare Agents SDK
 * `McpAgent` subclass (`import { McpAgent } from "agents/mcp"`).
 *
 * Declared structurally so this addon has no build-time dependency on the
 * `agents` package — the agent class lives in the userland app, not here.
 */
export interface McpServeable {
  serve(
    path: string,
    options?: {
      binding?: string;
      transport?: "streamable-http" | "sse";
      jurisdiction?: string;
      corsOptions?: unknown;
    },
  ): {
    fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
  };
}

export interface McpHandlerOptions<T extends RequestInfo = RequestInfo> {
  /** Path the MCP endpoint is mounted at. MUST match the full request path. Default: `"/mcp"`. */
  path?: string;
  /** Env var naming the McpAgent Durable Object namespace. Default: `"MCP_OBJECT"`. */
  binding?: string;
  /** MCP transport. Default: `"streamable-http"`; use `"sse"` for the legacy SSE transport. */
  transport?: "streamable-http" | "sse";
  /** Durable Object jurisdiction, forwarded verbatim to the Agents SDK. */
  jurisdiction?: string;
  /** CORS options, forwarded verbatim to the Agents SDK. */
  corsOptions?: unknown;
  /**
   * Derive the auth context the McpAgent reads as `this.props`. Runs AFTER rwsdk
   * middleware/interruptors, so `requestInfo.ctx` is fully populated (e.g. `ctx.user`).
   * The Agents SDK forwards the returned value to the Durable Object as its props.
   */
  props?: (requestInfo: T) => unknown | Promise<unknown>;
}

/**
 * Mount a Cloudflare Agents SDK `McpAgent` as a RedwoodSDK route handler, so that
 * `defineApp` middleware/interruptors run BEFORE the MCP transport and can establish
 * identity in `ctx`.
 *
 * This wraps nothing the platform owns: the agent class, its Durable Object lifecycle,
 * hibernation, and the Streamable-HTTP/SSE transport all stay in the Agents SDK. The
 * addon only adapts the Agents SDK's `serve()` handler to rwsdk's route-handler
 * signature and forwards request-scoped identity as `ctx.props`.
 *
 * @example
 * import { route } from "rwsdk/router";
 * import { mcpHandler } from "@/mcp";
 * import { MyMcpAgent } from "@/agents/MyMcpAgent";
 *
 * export default defineApp([
 *   authMiddleware, // populates ctx.user
 *   route("/mcp", mcpHandler(MyMcpAgent, {
 *     props: ({ ctx }) => ({ userId: ctx.user.id }),
 *   })),
 * ]);
 */
export function mcpHandler<T extends RequestInfo = RequestInfo>(
  agent: McpServeable,
  options: McpHandlerOptions<T> = {},
) {
  const {
    path = "/mcp",
    binding = "MCP_OBJECT",
    transport = "streamable-http",
    jurisdiction,
    corsOptions,
    props,
  } = options;

  // Built once: the Agents SDK handler is stateless and reads env/ctx per request.
  const handler = agent.serve(path, {
    binding,
    transport,
    jurisdiction,
    corsOptions,
  });

  return async (requestInfo: T): Promise<Response> => {
    const { request, cf } = requestInfo;

    if (props) {
      // The Agents SDK reads `ctx.props` and forwards them to the Durable Object via
      // `getAgentByName(ns, name, { props })`, where the agent reads `this.props`.
      (cf as ExecutionContext & { props?: unknown }).props = await props(requestInfo);
    }

    return handler.fetch(request, env, cf);
  };
}
