import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";

type Props = { userId: string };

export class MyMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "mcp-playground", version: "1.0.0" });

  async init() {
    // Reads the per-request identity forwarded by mcpHandler via `ctx.props`.
    this.server.tool("whoami", async () => ({
      content: [{ type: "text", text: `You are ${this.props.userId}` }],
    }));
  }
}
