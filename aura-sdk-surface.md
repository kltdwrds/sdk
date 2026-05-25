# aura-sdk — public surface design

**Status:** proposal for human approval. This is a *contract*, not an implementation.
No function bodies, no package stood up. Types/signatures only, where they sharpen the proposal.

**Inputs honored:** `rwsdk-primitive-audit.md` (boundary map — what's already native, the
rwsdk↔Agents-SDK seam, what's keep-in-aura). No `aura-monorepo-init-roadmap.md` / aura design
docs present in this repo; designed from the audit + the concept summaries supplied with the task.

**Thesis (confirmed, not assumed):** after applying the cut test to all six maximal candidates,
**exactly one survives — the identity client.** Everything else collapses into "use rwsdk/Agents-SDK
directly" or "template/app owns it." The surface fits on an index card.

---

## 1. The surface, in one screen

Agents import only this. The runtime surface is **one function** (`createIdentityClient`) plus the
`IdentityClient` it returns; the rest are types the builder generates against and the harness asserts on.

```ts
// ── aura-sdk ───────────────────────────────────────────────────────────────
// The whole agent-facing contract. Adding members/fields = minor. Reshaping = breaking.

/** Closed set of declared access purposes. Minimization & scoping are keyed to this. */
export type Purpose =
  | "reading.recommendation"
  | "reading.progress"
  | "profile.greeting";
  // …domain purposes added additively, one release per addition.

/** Who is asking, for whom, and under what grant. Verified by identity-core, not the agent. */
export interface Caller {
  agent: string;       // stable agent id (the calling agent)
  userId: string;      // subject whose identity is being accessed
  capability: string;  // grant/scope token the caller holds
}

/** Purpose-indexed *read* shapes — the minimized slice returned per purpose. One entry per Purpose. */
export interface IdentitySlices {
  "reading.recommendation": { genres: string[]; recentTitles: string[] };
  "reading.progress": { bookId: string; position: number } | null;
  "profile.greeting": { displayName: string };
}

/** Purpose-indexed *write* shapes — the minimized facets writable per purpose. */
export interface IdentityWrites {
  "reading.progress": { bookId: string; position: number };
  "profile.greeting": { displayName: string };
  // read-only purposes simply have no write entry → write is a type error.
}

/** Required provenance on every write — makes the ledger auditable & eval-assertable. */
export interface Provenance { agent: string; reason: string; observedAt: string /* ISO */ }
export interface WriteReceipt { ledgerId: string; accepted: boolean }

/** Typed failure surface so agents & the harness can branch on contract violations. */
export type IdentityErrorCode = "purpose_denied" | "over_scoped" | "unauthorized";
export interface IdentityError extends Error { code: IdentityErrorCode }

/** THE aura seam: purpose-scoped, minimized, transport-agnostic identity access.
 *  Async by contract so the transport (in-process → RPC/MCP) can change without a break. */
export interface IdentityClient {
  read<P extends Purpose>(args: { caller: Caller; purpose: P }): Promise<IdentitySlices[P]>;
  write<P extends keyof IdentityWrites>(
    args: { caller: Caller; purpose: P; facets: IdentityWrites[P]; provenance: Provenance },
  ): Promise<WriteReceipt>;
}

// ── aura-sdk/transport (separate subpath — the TEMPLATE wires this; agents never import it) ──
export interface IdentityTransport { request(op: "read" | "write", payload: unknown): Promise<unknown> }
export function createIdentityClient(transport: IdentityTransport): IdentityClient;
```

Two export subpaths, mirroring rwsdk's `rwsdk/worker` vs `rwsdk/client` idiom:
`aura-sdk` (what an **agent** imports: the client interface + data types + error) and
`aura-sdk/transport` (what the **template** imports once, to construct the client). This keeps the
*agent-facing* surface to "call `read`/`write` against typed purposes" — nothing else.

---

## 2. Per-export spec

| Export | Signature (idiom) | Purpose | Delegates to | Cut-test answers (1 app / 2 rwsdk / 3 Agents-SDK / 4 identity-core-internal) | Stability |
|---|---|---|---|---|---|
| `IdentityClient.read` | `read<P>({caller, purpose:P}) → Promise<IdentitySlices[P]>` | Purpose-scoped, minimized read of the subject's durable identity | identity-core store (behind transport) | 1 **No** — uniform minimization can't be re-derived per app; 2 **No** — rwsdk/db is an unopinionated query builder; 3 **No**; 4 **No** — the *signature* is the public seam (the store is private) | frozen-v1 |
| `IdentityClient.write` | `write<P>({caller, purpose:P, facets, provenance}) → Promise<WriteReceipt>` | Minimized, provenance-stamped upsert into durable identity | identity-core store | 1 **No** — minimization-on-write + ledger is the contract; 2/3 **No**; 4 **No** — agent-facing | frozen-v1 *(or additive-later — see Decision 1)* |
| `createIdentityClient` | `(transport) → IdentityClient` | Bind the contract to a concrete transport (in-process MVP → RPC/MCP) | pure (wires transport) | 1 **No** — agents must obtain a client without importing identity-core; 2/3 **No**; 4 **No** — must be public for the template | frozen-v1 |
| `Purpose` | string-literal union | The closed vocabulary scoping every read/write | pure (type) | 1 **No** — must be shared across agents for the harness to assert; 2/3/4 **No** | additive-later (members) |
| `IdentitySlices` / `IdentityWrites` | purpose-indexed interfaces | The minimized read/write shapes per purpose | pure (types) | 1 **No** — uniform shapes are the minimization contract; rest **No** | additive-later (entries/optional fields) |
| `Caller` | interface | Identifies asker + subject + grant | pure (type) | 1 **No** — uniform across agents; 2/3/4 **No** | frozen-v1 |
| `Provenance` / `WriteReceipt` | interfaces | Audit trail in/out of `write` | pure (types) | 1 **No** — ledger contract; rest **No** | additive-later (optional fields) |
| `IdentityError` / `IdentityErrorCode` | interface + union | Lets agents & harness branch on contract violations | pure (type) | 1 **No** — uniform codes for eval; rest **No** | additive-later (codes) |
| `IdentityTransport` | interface | The swap point for transport evolution | pure (type) | 1 **No** — template needs it; 2/3 **No**; 4 **No** — it's the boundary, not the store | frozen-v1 |

Everything above is the *identity client and its vocabulary*. There is no second feature.

---

## 3. The cut list — every rejected candidate and its real home

| Cut candidate | Verdict | Real home (one line) |
|---|---|---|
| **Per-agent state handle** (name/address an agent's own DO) | CUT | **rwsdk-direct / Agents-SDK-direct** — `createDb(ns, key)` / `SqliteDurableObject`, or Agents-SDK DO-per-name; the **template** declares the binding. `idFromName(userId)` is a one-liner; a helper would be policy (audit §3). |
| **Trigger declaration** (unified cron/email/webhook) | CUT | **rwsdk/CF-native + template** — native `scheduled`/`email`/`queue` + `route()`; the **template** ships the handler shells, the **app** fills them. A declarative layer violates Zero-Magic + Web-First (audit §4). |
| **Tool / sub-agent calls** (composability) | CUT (defer v1) | **Agents-SDK / MCP-direct** — `McpAgent` / MCP client / `getAgentByName`; identity injected via the **identity client**. Not a new aura surface (audit §2 boundary). |
| **Context-assembly scaffold** (layered system/grounded/identity/task) | CUT | **app** (optionally a **template** recipe) — assembling messages is plain TS; the *identity layer* is just `identity.read(...)`. rwsdk has no model-call concept (audit §5). |
| **Eval signals emit-API** (specificity / remember-beat / spine / conformance) | CUT | **harness-derived, no export** — the harness computes these from the **identity ledger** (caller+purpose+provenance on every read/write) + agent outputs vs golden tasks. Agents emit normal Responses, not signals. |
| **Model-call / LLM helper** | CUT | **app** — any LLM SDK directly; `rwsdk/llms` is AI-assistant *rules*, not a runtime (audit §1, 8a). |
| **Capability/grant verification, purpose registry** | CUT | **identity-core-internal** — enforcement lives behind the transport; the agent only passes `Caller.capability`. No runtime registry; `Purpose` is a static type. |
| **Session/auth** | CUT | **rwsdk-direct** — `rwsdk/auth` `defineSessionStore` / passkey addon (audit §4 stop-reinventing). |

The cuts *are* the boundary: aura-sdk earns its keep at exactly one seam.

---

## 4. Who owns what

| Responsibility | rwsdk-native | Agents-SDK-native | **aura-sdk** | template (`templates/agent-rwsdk`) | app (the agent) |
|---|---|---|---|---|---|
| Trigger (cron/email/webhook) | `scheduled`/`email`/`queue` + `route` | — | — | handler **shells** | fills logic |
| Serve UI (RSC) | `render`/`route`/RSC | — | — | `Document` + route wiring | components |
| Model call | — | — | — | — | uses any LLM SDK |
| Per-agent working state (ephemeral) | `createDb`/`SqliteDurableObject` | DO-per-name / McpAgent | — | DO **binding** + class export | reads/writes its DO |
| **Identity read/write (durable, cross-agent)** | — | — | **`IdentityClient`** | **constructs** client (transport) | calls `identity.read/write` |
| Tool / sub-agent calls | — | McpAgent / MCP / `getAgentByName` | — *(deferred)* | (later) mounts MCP | (later) calls tools |
| Async write-back | Queue / `ctx.waitUntil` | — | (`write` is async via client) | wires queue if used | enqueues |
| Eval signals | — | — | — *(derived from ledger)* | — | emits normal outputs |
| Deploy | wrangler / create-rwsdk | — | — | `wrangler.jsonc` | — |

Every row has one primary owner; the **aura-sdk column has a single non-empty cell.** That's the test passing.

---

## 5. aura-sdk vs template — the no-duplication boundary

- **aura-sdk owns the *contract*:** the `IdentityClient` interface, the `Purpose`/slice/write/provenance/error
  **types**, and the `createIdentityClient` **factory + transport interface**. Pure types + one binding function.
- **`templates/agent-rwsdk` owns the *wiring*, and re-declares none of it:**
  - `defineApp([...])` boot + the trigger handler **shells** (`scheduled`/`email`/`route`),
  - the agent's own-state **DO binding** in `wrangler.jsonc` + the exported DO class,
  - **one** identity-client construction site: `export const identity = createIdentityClient(inProcessTransport)`
    (MVP transport is in-process; swapping to RPC/MCP is a template-only edit, invisible to the agent).
- **The agent (app)** imports `identity` from its own module and the **types** from `aura-sdk`, then writes logic.

Rule: if it's a *type or the read/write signature*, it's aura-sdk. If it's a *binding, a handler shell, or a
construction call*, it's the template. Neither restates the other.

---

## 6. Stability + versioning

- **Semver, pinned per deployment.** Every standalone agent imports a pinned `aura-sdk`; a breaking change
  breaks all deployed agents at once → treat the surface as a protocol.
- **Additive-only (minor):** adding a `Purpose` member; adding an entry to `IdentitySlices`/`IdentityWrites`;
  adding an **optional** field to a slice/`Provenance`; adding an `IdentityErrorCode`; adding a method.
- **Breaking (major, avoid):** removing/renaming a `Purpose`; narrowing or reshaping a slice; making a
  field required; changing `read`/`write` arity or return; making the transport **synchronous**.
- **The two places most likely to tempt a break — design right once:**
  1. **`Purpose` + slice shapes.** Every new agent wants new purposes. Model as an *additive map*, never
     renumber/reshuffle existing entries; deprecate by leaving in place. (Drives Decision 2.)
  2. **Async transport.** `read`/`write` return `Promise` *now*, even though MVP is in-process, so the later
     move to RPC/MCP is non-breaking. Locking this today is the single highest-leverage stability choice.

---

## 7. Generatability check

- **Reliable to emit:** the builder writes `const slice = await identity.read({ caller, purpose: "reading.recommendation" })`
  — `purpose` autocompletes from the closed union and the return type is fixed, so there's one correct shape
  to generate against. `write` is symmetric, with `facets` constrained by `IdentityWrites[P]`. A tiny surface
  with closed vocabularies is exactly what makes generation reliable.
- **Eval-assertable:** because every `read`/`write` carries `caller + purpose + provenance`, the harness reads
  the **identity ledger** to assert: *contract conformance* (was the requested purpose allowed for that
  capability?), *minimization* (did only the purpose's fields appear?), and *remember-beat* (did a prior
  `write` surface in a later `read`?). *Specificity* and *spine-faithfulness* are computed from outputs vs
  golden tasks — no agent API needed.
- **Smell flags:**
  - If `IdentitySlices` were an open `Record<string, unknown>`, both generation and eval would be unreliable
    — that's the reason the slices are a **closed, purpose-indexed** map. (Resolved.)
  - `write` minimization is harder to assert than `read` (must catch over-writes). Mitigation kept in the
    design: closed `IdentityWrites` shapes + required `Provenance` make over-writes detectable in the ledger.
    Watch this one if write shapes ever loosen.

---

## 8. Decisions needing the human

1. **Identity `write` at v1, or read-only first?**
   - *Fork:* ship `read`+`write` now **vs.** ship `read` only, add `write` additively later.
   - *Recommendation:* **include `write` at v1.** The reading-app graduate records progress and the
     *remember-beat* eval requires a write→read round-trip. Safety net: adding `write` later is non-breaking,
     so fall back to read-only **only if** every MVP agent is useful without writing.

2. **Is `Purpose` a closed union or an open string?**
   - *Fork:* frozen, additive closed union **vs.** open `string`.
   - *Recommendation:* **closed union.** Reliability + eval-assertability dominate; widening is additive, and
     the per-purpose release cost is the price of the contract being checkable.

3. **Per-agent working state: confirm rwsdk/Agents-SDK-direct (not aura-sdk)?**
   - *Fork:* leave DO naming entirely to template/app **vs.** bless a key-builder in aura-sdk.
   - *Recommendation:* **direct, no helper.** Accept that two agents may name DOs differently — that's app
     freedom, not a contract. A blessed key-builder is policy the audit (§3) rejects.

4. **Composability (tool / sub-agent calls): deferred entirely from v1?**
   - *Fork:* defer **vs.** include a thin call surface now.
   - *Recommendation:* **defer.** When added it's MCP/Agents-SDK-direct with identity injected via the
     existing client — not a new aura-sdk export. Confirm the MVP has no agent→agent call.

---

### Bottom line
One runtime export (`createIdentityClient`) and one interface (`IdentityClient`) over a closed purpose
vocabulary. Five of six maximal candidates were cut to rwsdk-direct, Agents-SDK-direct, template, or
identity-core-internal. Widening this later is cheap; the surface is deliberately the narrowest thing that
could work.
