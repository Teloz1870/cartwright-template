# MCP endpoint architecture

Cartwright ships a public **Model Context Protocol** endpoint at `POST /api/mcp`.
MCP is the open standard for connecting AI clients (Claude Desktop, etc.) to real
systems; this endpoint hands a connected client the shop's full, scoped tool
surface so an AI can operate the store — browse catalog, manage orders, run
campaigns — under the exact same authorization as the REST API.

Source of truth: [`app/api/mcp/route.ts`](../app/api/mcp/route.ts).

---

## Transport — stateless Streamable HTTP

The endpoint uses `WebStandardStreamableHTTPServerTransport` (the modern MCP
transport that supersedes SSE — a single HTTP route handling both request/response
and the server-sent stream over POST).

It runs **stateless**:

```ts
new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,   // ← stateless
  enableJsonResponse: true,
});
```

`sessionIdGenerator: undefined` means **every request is self-contained**: no
`initialize`-first handshake requirement, no server-side session tracking. This
is the right model for Next.js serverless/Fluid runtime, where cross-request
in-memory state is not guaranteed to survive on the same instance anyway. MCP
clients like Claude Desktop handle both stateful and stateless transports.

`runtime = "nodejs"` and `dynamic = "force-dynamic"` — the route needs Node
(crypto, Prisma) and must never be statically cached.

The handler is wired to all three verbs: `GET` (after the intro check below),
`POST`, and `DELETE` all route to `handle()`.

## Auth & per-invocation scope enforcement

`handle()` calls `authenticateApiKey(request)` first (see
[api-keys.md](api-keys.md)). No/invalid key → the same `401/403` JSON the REST
API returns. On success, the authenticated **actor** (with its scopes) is bound
into the MCP server for that request.

Every registered tool's MCP handler delegates to the shared
`invokeTool(name, args, ctx, actor.scopes)` — the **same chokepoint** the REST
endpoint uses (see [scopes-and-tools.md](scopes-and-tools.md)). Consequences:

- Scope checks, Zod validation, audit logging and `confirm: true` gating behave
  **identically** over MCP and REST. There is no second, weaker path.
- The MCP-layer `inputSchema` is intentionally a pass-through (`{ args: z.any() }`).
  The real, strict per-tool Zod validation happens inside `invokeTool`, so the
  MCP surface can't bypass it.
- Each invocation stamps `actor = apikey:<id>`, a fresh `requestId`, and the
  caller IP / user-agent into the audit context.

Tool results are returned as MCP `text` content (pretty-printed JSON); failures
come back as `isError: true` with `[error <status>] <message>`.

## Curated introspection — never the database

Two discovery surfaces, both **curated** — they describe the *tool contract*,
never raw DB schema, handler source, or data:

1. **`GET /api/mcp` without an `Authorization` header** returns a human/journalist
   intro (not a bare `401`): endpoint name, protocol, the `clientConfig` snippet
   to paste into an MCP client, where to get a key (`/admin/api-keys`), and links
   to `/manifest`, `/changelog` and the public catalog. If `Authorization` **is**
   present, the same `GET` falls through to normal MCP handling.

2. **`GET /api/v1/tools`** — the public, generated catalog (`name`,
   `description`, `scope`, `revertible`; `?schema=true` adds the input JSON
   Schema). This is what MCP clients read at discovery time. See
   [scopes-and-tools.md](scopes-and-tools.md#the-canonical-catalog).

The MCP server instance also carries `instructions` describing the tool surface
and reminding clients that **destructive operations require `confirm: true`** and
that each tool needs a scope on the API key.

## Connecting a client

```jsonc
// e.g. Claude Desktop MCP config
{
  "mcpServers": {
    "<store-slug>": {
      "url": "https://<your-shop>/api/mcp",
      "headers": { "Authorization": "Bearer sb_live_..." }
    }
  }
}
```

Mint the key in `/admin/api-keys` and grant it the **minimum** scopes the client
needs ([scopes-and-tools.md](scopes-and-tools.md)). The endpoint is exposed
publicly for AI-first shops via the `mcpPublic` flag (on by default). Turning
the flag off in `/admin/features` makes `/api/mcp` and `/api/v1/tools` return
404 — indistinguishable from a site without the surface. Note: `features.set`
is itself a REST tool, so after disabling over REST the only way back on is
the admin UI. Keys minted in `/admin/api-keys` can carry an expiry; expired
keys are rejected with 401.

## Design rationale

- **One enforcement path.** MCP and REST share `invokeTool`, so security
  invariants are proven once.
- **Stateless > stateful** on serverless — no session store to lose, no
  initialize handshake to coordinate across instances.
- **Curated catalog, not schema introspection.** Clients get a stable,
  intentional contract; the database shape stays private and free to evolve.
