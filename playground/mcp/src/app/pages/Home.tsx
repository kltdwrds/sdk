export function Home() {
  return (
    <div>
      <h1>MCP Addon Playground</h1>
      <p>
        This app mounts a Cloudflare Agents SDK <code>McpAgent</code> at{" "}
        <code>/mcp</code> behind <code>defineApp</code> middleware. The MCP
        endpoint is gated by the same identity the web app uses, and that
        identity is forwarded to the agent as <code>this.props</code>.
      </p>
    </div>
  );
}
