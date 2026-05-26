import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setupPlaygroundEnvironment, testDevAndDeploy } from "rwsdk/e2e";
import { expect } from "vitest";

setupPlaygroundEnvironment(import.meta.url);

function mcpClient(url: string, userId?: string) {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", url), {
    requestInit: userId ? { headers: { "x-user-id": userId } } : undefined,
  });
  const client = new Client({ name: "e2e-client", version: "1.0.0" });
  return { client, transport };
}

testDevAndDeploy(
  "MCP endpoint is reachable through rwsdk routing and a tool can be called",
  async ({ url }) => {
    const { client } = mcpClient(url, "alice");
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", url), {
        requestInit: { headers: { "x-user-id": "alice" } },
      }),
    );

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("whoami");

      const result = await client.callTool({ name: "whoami", arguments: {} });
      // Identity established in rwsdk middleware reaches the agent as `this.props`.
      expect(JSON.stringify(result.content)).toContain("alice");
    } finally {
      await client.close();
    }
  },
);

testDevAndDeploy(
  "middleware gates the MCP endpoint (401 without identity)",
  async ({ url }) => {
    const { client, transport } = mcpClient(url); // no x-user-id header
    // The route interruptor returns 401 before the MCP transport runs, so the
    // client's initialize request fails to establish a session.
    await expect(client.connect(transport)).rejects.toThrow();
    await client.close().catch(() => {});
  },
);
