# RedwoodSDK Primitive Audit — for the aura project

## 1. Source provenance

| Field | Value |
|---|---|
| Source read | `/home/user/sdk` — the rwsdk monorepo itself (not a vendored copy) |
| Package | `rwsdk` **v1.2.9** (`sdk/package.json`) |
| Monorepo | `rw-sdk-monorepo`, workspaces: `sdk/`, `addons/`, `community/`, `starter/`, `docs/`, `playground/` |
| Commit | `cae86ee` (`chore(release): 1.2.9`); latest stable on npm at audit time = 1.2.9, canary `1.3.0` (Vite 8 / Rolldown) |
| Philosophy source | `docs/src/content/docs/index.mdx` (Design Principles), `docs/src/content/docs/core/overview.mdx`, `README.md` |

### rwsdk's stated philosophy (verbatim from `index.mdx`)
- **Zero Magic** — no code generation, no transpilation side effects, *no special treatment of file names or exports*, only explicit import/export.
- **Composability Over Configuration** — "primitives, not policy"; no opinionated wrappers; no rigid folder structure.
- **Web-First** — native Web APIs; "No abstraction over fetch, Request, Response, or URL"; "If the platform already gives you a tool, we do not wrap it."

### The real extension surfaces (condensed map from `sdk/package.json` exports + source)

**Request pipeline (the core seam):**
- `rwsdk/worker` → `defineApp([...])`, `ErrorResponse`, `requestInfo` singleton (`request`, `response`, `ctx`, `rw`, `cf`). (`docs/reference/sdk-worker.mdx`)
- `rwsdk/router` → `route(path, handler | MethodHandlers)`, `prefix(path, routes)`, `render(Document, routes, opts)`, `except(handler)`. Middleware = plain functions `({ request, ctx, response }) => …` placed in the `defineApp` array or in route-level arrays ("interruptors"); they mutate `ctx` and can short-circuit by returning a `Response`. (`docs/reference/sdk-router.mdx`)
- `rwsdk/client`, `rwsdk/realtime/{worker,client,durableObject}`, `rwsdk/use-synced-state/{client,worker}`.

**Native Cloudflare handlers — deliberately NOT wrapped by rwsdk.** Cron, Email, and Queues are declared as `scheduled` / `email` / `queue` methods on the worker's default export (or a `WorkerEntrypoint` subclass). The router only owns `fetch`. (`docs/core/cron.mdx`, `core/email.mdx`, `core/queues.mdx`)

**Data / state primitives:**
- `rwsdk/db` → `createDb<T>(namespace, key)` returns a Kysely instance; `SqliteDurableObject` base class; `Migrations` type with inferred types. Kysely-on-a-Durable-Object, one isolated SQLite DO per `key`. (`sdk/src/runtime/lib/db/`, `docs/experimental/database.mdx`)
- `rwsdk/auth` → `defineSessionStore()`, `defineDurableSession()`; HMAC-SHA256-signed session cookie + a DO-backed session store; `DurableObjectMethods` interface (`getSession`/`saveSession`/`revokeSession`). (`sdk/src/runtime/lib/auth/{index,session}.ts`)
- `rwsdk/realtime` → `RealtimeDurableObject` (WebSocket fan-out + `render()`), `renderRealtimeClients`. `rwsdk/use-synced-state` → `useSyncedState<T>(initial, key, roomId?)` hook backed by `SyncedStateServer` DO; server-side `registerKeyHandler` / `registerRoomHandler` hooks allow per-user key/room rewriting. (`sdk/src/runtime/lib/realtime/`, `sdk/src/use-synced-state/`)
- `rwsdk/turnstile`, `rwsdk/e2e` + `rwsdk/e2e/setup`, `rwsdk/debug`, `rwsdk/constants`.

**`rwsdk/llms` — NOT an LLM runtime.** It exports a `PackageRuleItem[]` of [vibe-rules](https://vibe-rules.com) — coding-convention strings (`interruptors`, `middleware`, `react`, `request-response`) shipped for AI coding assistants. There is **no model-call / LLM helper anywhere in rwsdk**. (`sdk/src/llms/index.ts`, `sdk/src/llms/rules/`)

**Beyond the core package — the two lightweight surfaces:**
- **Addons** = shadcn-style *copy-the-code-into-your-app* templates, installed via `npx rwsdk addon <name>` (driven by an `addon.jsonc` manifest, prior art issue #492). They are **not** npm plugins and there is **no plugin registry**. Official addons: passkey, blog, changelog (`addons/passkey/` is in-repo; others live in `redwoodjs/{passkey,blog,changelog}-addon`).
- **Starter** = exactly **one** `create-rwsdk` starter, fetched as the latest GitHub-release `tar.gz`. The CLI has **no template/preset/archetype flag** — only `-f/--force`, `--release <version>`, `--pre` (`docs/reference/create-rwsdk.mdx`). (A `-t` flag may exist on a newer canary; not present in v1.2.9.)

**DO addressing & RPC — left raw.** rwsdk provides **no per-user / per-(user,name) DO naming helper**. Everywhere a DO is addressed it calls Cloudflare's raw API directly: `namespace.idFromName(key)` then `.get(id)` (`realtime/worker.ts:24-25`, `db/createDb.ts:12`, `use-synced-state/worker` room resolution). `capnweb` is an **optional** peer dependency used **only** for `use-synced-state` client↔server WebSocket RPC (`newWebSocketRpcSession`, `RpcTarget`, `newWorkersRpcResponse`); there is **no DO↔DO RPC helper** — DO-to-DO is native Workers RPC (`env.NS.get(id).method()`).

**No MCP, no Cloudflare Agents SDK.** Zero references to `mcp`, `McpAgent`, `modelcontextprotocol`, `agents`, or `routeAgentRequest` anywhere in `sdk/`, `docs/`, `addons/`, `starter/`, `playground/`, `community/`.

---

## 2. Verdict matrix

| # | aura concept | Bucket | Evidence (file / symbol) | Philosophy-fit note |
|---|---|---|---|---|
| 1 | Agent archetype (starter/preset) | **Keep in aura** (max: community addon/recipe) | `create-rwsdk.mdx` — one starter, no preset flag; addons = copy-in code, not archetypes | A bundled archetype = opinionated wrappers + folder structure → violates *Composability Over Configuration* |
| 2 | First-class MCP server hosting | **Candidate upstream** — as **addon / recipe**, not core | No `mcp`/`McpAgent` in source; POC only (issue #341); user-driven Agents SDK (#495, #283) | The only philosophy-fitting seam is a thin `route()`-composable transport mount; `McpAgent` itself stays in the Agents SDK (*Web-First*: don't re-wrap what the platform gives you) |
| 3 | Per-user/per-name DO + DO↔DO RPC | **Keep in aura** (DO-naming recipe at most) | `realtime/worker.ts:24`, `db/createDb.ts:12` use raw `idFromName`; capnweb only client↔server | `idFromName(userId)` is a one-liner; wrapping it is policy. DO↔DO RPC is native Workers RPC → *Web-First* says don't wrap it |
| 4 | Unified triggers surface | **Keep in aura** (reject upstream) | `cron.mdx`/`email.mdx`/`queues.mdx` — native `scheduled`/`email`/`queue` handlers; router owns only `fetch` | A declarative triggers layer = config + magic over explicit native handlers → violates *Zero Magic* **and** *Web-First* |
| 5 | Context-assembly middleware | **Keep in aura** (thin recipe at most) | `sdk-worker.mdx`/`sdk-router.mdx` middleware; `llms/rules/middleware.ts` | The middleware seam exists, but the *layering policy* + model call is LLM-app domain logic; rwsdk has no model-call concept |
| 6 | Typed, purpose-scoped, minimized data contract | **Keep in aura** | `db/createDb.ts`, `auth/session.ts` — unopinionated query builder + signed sessions, no capability/ledger layer | `{caller, purpose}` minimization + ledger is domain policy → "primitives, not policy" |
| 7 | Eval / test harness hooks | **Already native** (infra) + **Keep in aura** (eval logic) | `rwsdk/e2e`, `rwsdk/e2e/setup`, `sdk/src/lib/e2e/`, `docs/guides/vitest.mdx`, `architecture/endToEndTesting.md` | Adopt the e2e/Vitest harness; golden-task eval gating is domain-specific, no rwsdk seam |
| 8a | (discovered) `rwsdk/llms` AI-rules channel | **Already native** | `sdk/src/llms/index.ts` (vibe-rules) | Blessed way to ship AI coding rules with a package — adopt it; it is NOT an LLM runtime |
| 8b | (discovered) realtime / synced-state for live agent UI | **Already native** | `RealtimeDurableObject`, `useSyncedState` + `registerKeyHandler`/`registerRoomHandler` | Per-user live UI state already exists; adopt instead of rolling a custom DO |

---

## 3. The shortlist — strongest *Candidate upstream*

Only **one** concept survives as a genuine, philosophy-fitting candidate, and even
it belongs in the **addon/recipe** tier rather than core. One well-argued
primitive beats a wishlist.

### MCP endpoint that composes with `defineApp` middleware

**The gap.** Cloudflare's Agents SDK gives you `McpAgent` (a DO-backed MCP server)
and `routeAgentRequest`, but that helper wants to **own the `fetch` handler**.
That fights rwsdk's `defineApp` router and, more importantly, its
middleware/interruptor chain — which is exactly where aura's auth and per-user
identity get established (`requestInfo.ctx`). Today you either bypass rwsdk
routing for the MCP path or hand-roll the Streamable-HTTP/SSE transport plumbing.
Users have hit precisely this (issues #495, #283).

**Minimal API sketch (rwsdk idiom — a route handler, nothing more):**
```ts
import { route } from "rwsdk/router";
import { mcpHandler } from "@redwoodjs/mcp-addon"; // addon, not core
import { MyMcpAgent } from "@/agents/MyMcpAgent"; // user's McpAgent DO

export default defineApp([
  authMiddleware,          // rwsdk middleware runs FIRST → ctx.user populated
  route("/mcp", mcpHandler(env.MY_MCP_AGENT, {
    // resolve which DO instance from ctx — userland decides identity
    instance: ({ ctx }) => ctx.user.id,
  })),
]);
```
`mcpHandler` is pure transport glue: it adapts the incoming `Request` to the
McpAgent's Streamable-HTTP/SSE transport and forwards to the user-named DO stub.
It owns no policy — auth, identity, and DO naming stay in userland.

**Where it lives: addon or recipe, never core.**
- *Web-First* forbids re-wrapping `McpAgent`; the agent class stays in the Agents SDK.
- The glue is small and optional, so it fits the **addon** surface (`@redwoodjs/mcp-addon`, `addon.jsonc`) or, if even thinner, a **docs recipe** ("Mount an MCP server behind rwsdk middleware").

**rwsdk ↔ Agents-SDK boundary call:** the line sits at the transport. rwsdk
contributes the *router/middleware mount point*; the Agents SDK keeps `McpAgent`,
hibernation, and DO lifecycle. aura wires identity in between.

**Prior art (matters a lot):** Peter built an MCP-server POC (#341) but it was
never productized; the April-2026 "self-eating-snake" epic explored agent-shaped
primitives (whole-site **context** #1173, capability-scoped server functions
#1166, user/session primitive #1174, regression/eval #1175) and **closed them all
as `not_planned`**. Signal: the team has considered AI-agent primitives in core
and chosen to keep them out — so pitch this as an **addon/recipe**, not core.

**Draft one-paragraph pitch (for an rwsdk GitHub discussion):**
> *Mounting an MCP server inside a RedwoodSDK app means giving up `defineApp`
> routing, because `routeAgentRequest`/`McpAgent` want to own `fetch` — so auth
> and per-user identity established in rwsdk middleware can't gate the MCP
> endpoint. Could rwsdk bless a tiny, transport-only `mcpHandler()` (as an addon
> or a docs recipe, not core) that lets an existing Cloudflare `McpAgent` be
> mounted as a normal `route()` handler, so middleware/interruptors run first and
> the DO instance is chosen from `requestInfo.ctx`? It wraps nothing the platform
> owns — the agent class, hibernation, and transport stay in the Agents SDK; rwsdk
> only contributes the router mount point.*

*(Secondary, weaker candidate — a blessed **DO-naming recipe** for per-user/
per-(user,name) addressing — is intentionally left off the shortlist: it's a
one-line `idFromName(userId)` and codifying it as a primitive would be policy.)*

---

## 4. The "stop reinventing" list — *Already native*, adopt now

Flag these first: they change what aura builds **immediately**.

| Adopt this rwsdk API | Instead of building | Notes |
|---|---|---|
| **`rwsdk/db`** — `createDb<T>(ns, key)` + `SqliteDurableObject` + `Migrations` | a custom Kysely-on-DO / SQLite-DO layer | Per-`key` isolation is exactly aura's per-(user/agent) working-store need; types inferred from migrations, no codegen. (`docs/experimental/database.mdx`) |
| **`rwsdk/auth`** — `defineSessionStore()` / `defineDurableSession()` | a custom session store | DO-backed, HMAC-signed cookie sessions already exist. (`auth/session.ts`) |
| **`rwsdk/realtime`** (`RealtimeDurableObject`, `renderRealtimeClients`) + **`rwsdk/use-synced-state`** (`useSyncedState`, `registerKeyHandler`/`registerRoomHandler`) | a custom DO for live per-user agent UI state | `registerRoomHandler`/`registerKeyHandler` give per-user rooms/keys — the per-user working-state UI aura wanted. |
| **`rwsdk/e2e` + `rwsdk/e2e/setup`** and the **Vitest guide** | a bespoke test bootstrap | Real e2e harness against the Workers runtime. (`docs/guides/vitest.mdx`, `architecture/endToEndTesting.md`) |
| **`rwsdk/llms`** (vibe-rules channel) | a custom way to ship AI coding rules | The blessed mechanism to ship "how to build an aura agent" rules to AI assistants. **Not** an LLM runtime — don't expect model-call helpers here. |
| Native **`scheduled` / `email` / `queue`** handlers + `route()` for webhooks | a "triggers framework" | The trigger surfaces already exist as native pieces; wire them, don't abstract them (see §3 verdict #4). (`cron.mdx`, `email.mdx`, `queues.mdx`) |
| Official **passkey addon** | hand-rolled passkey auth | `npx rwsdk addon passkey`; uses `rwsdk/db` + `rwsdk/auth` under the hood. |

---

## 5. The "keep in aura" list — ours to own, with the philosophy reason

| Concept | Why it's not rwsdk's job |
|---|---|
| **Agent archetype / preset** | A bundled "agent" shape (trigger→model-call→RSC→per-user DO→identity-client) is opinionated wrappers + a rigid folder structure → violates *Composability Over Configuration*. rwsdk's archetype surface is one unopinionated starter. Aura can publish it as a *community addon* (copy-in code) or recipe, never core. |
| **Unified triggers abstraction** | Cron/email/queues are native CF default-export handlers; a declarative triggers layer adds config + magic over them and re-wraps platform features → violates *Zero Magic* and *Web-First*. (*Against* wins over *for*: the single-declaration convenience doesn't justify hiding three independent native handlers.) |
| **Layered context-assembly policy** | The middleware seam is rwsdk's; the *layering* (stable/grounded/identity/ephemeral) + the model call are LLM-app domain logic. rwsdk has no model-call concept (`rwsdk/llms` is rules, not runtime) and shouldn't grow one. |
| **Typed, `{caller, purpose}`-scoped, minimized, ledgered data contract** | "Primitives, not policy." rwsdk/db is a deliberately unopinionated query builder with explicit cross-component data control; capability/grant/minimization/ledger is aura domain policy. |
| **Per-user DO keying convention + DO↔DO RPC orchestration** | `idFromName(userId)` is a one-liner and DO↔DO is native Workers RPC; wrapping either is policy / re-wrapping the platform (*Web-First*). |
| **Golden-task eval gating** | Domain-specific CI policy. Adopt rwsdk's e2e/Vitest harness as the *runner*; the eval-as-gate logic is aura's. |

---

## 6. Open questions for the rwsdk maintainers

1. **Where should the rwsdk ↔ Cloudflare Agents-SDK line sit?** Would the team bless a transport-only `mcpHandler()`/MCP addon that mounts an `McpAgent` as a `route()` handler so middleware runs first — or do they consider any MCP/agent surface out of scope after the #1157/#1173/#1166/#1174 epic was closed `not_planned` and the #341 POC was shelved?
2. **Is there a roadmap for an official MCP / Agents-SDK transport adapter** that composes with `defineApp`, or is the intended answer "drop to a raw `WorkerEntrypoint` / separate Worker for the agent"?
3. **Addon manifest spec.** Is `addon.jsonc` (issue #492) a stable, documented contract we should target for publishing aura addons (e.g. an `agent` addon)? Is there a public addon index beyond the three official ones?
4. **DO conventions.** Any plan to bless a DO-naming convention or a DO↔DO RPC helper, or is raw `idFromName` + native Workers RPC the intended long-term story?
5. **`use-synced-state` per-user model.** Are `registerKeyHandler`/`registerRoomHandler` considered stable public API for per-user/per-tenant isolation, or internal hooks?

---

### Bias note
The highest-value outcome of this audit is the **stop-reinventing list (§4)** — `rwsdk/db`,
`rwsdk/auth`, realtime/synced-state, the e2e harness, and the `rwsdk/llms` rules channel
already cover most of aura's "platform plumbing," so that planned work can be deleted.
Net new upstream proposals are deliberately limited to the single MCP-mount item (§3),
framed as an addon/recipe to respect rwsdk's "primitives, not policy" line.
