import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { MyMcpAgent } from "@/agents/MyMcpAgent";
import { Document } from "@/app/Document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/Home";
import { mcpHandler } from "@/mcp";

export { MyMcpAgent };

export type AppContext = {
  userId: string | null;
};

export default defineApp([
  setCommonHeaders(),
  // Identity middleware: establishes who the caller is BEFORE the MCP transport.
  // A real app would load a session here; the demo reads a header so the e2e can drive it.
  ({ ctx, request }) => {
    ctx.userId = request.headers.get("x-user-id");
  },
  render(Document, [route("/", Home)]),
  route("/mcp", [
    // Interruptor: the MCP endpoint is gated by the same identity the web app uses.
    ({ ctx }) => {
      if (!ctx.userId) {
        return new Response("Unauthorized", { status: 401 });
      }
    },
    // mcpHandler runs last, with ctx fully populated; identity rides on `this.props`.
    mcpHandler(MyMcpAgent, {
      props: ({ ctx }) => ({ userId: ctx.userId }),
    }),
  ]),
]);
