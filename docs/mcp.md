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
`POST`, and `DELETE` all run the same `guard()` and then `serve()`.

## Origin validation (DNS-rebinding protection)

The transport specification requires an MCP server to validate the `Origin`
header on all incoming connections and to answer **`403 Forbidden`** when the
header is present and not allowed. `guard()` does that on `GET`, `POST` and
`DELETE`, including the unauthenticated intro branch that never reaches the
transport at all. (`OPTIONS` is answered by Next.js itself, ahead of any handler
this route exports, so it is not currently covered — it carries no body and the
route sets no CORS headers, but it is a gap against the "all connections"
wording.)

What is allowed:

| `Origin` on the request | Result |
|---|---|
| absent (Claude Desktop, curl, server-to-server) | allowed — the spec rejects only a *present* header |
| present but empty (an intermediary stripped the value) | allowed — no browser sends this |
| your shop's own URL — `brand.url` **or** the domain set in the setup wizard | allowed |
| anything listed in `MCP_ALLOWED_ORIGINS` (comma-separated) | allowed |
| `http://localhost:*` / `127.0.0.1` / `[::1]` | allowed **outside production only** |
| any other origin, or an opaque one (`null`, `file://…`) | `403` |

The wizard's domain matters because `getBrand()` derives the shop's public URL
from `BrandingSettings.domain` (the same value sitemap, robots and canonical
tags follow), so a shop configured that way would otherwise have to repeat its
own domain in an env var to be allowed to talk to itself. That runtime value is
read only when the static list misses, so the origin check adds no brand read of
its own on the ordinary path — the `mcpPublic` gate ahead of it already reads the
brand (`getFeatures()` is `(await getBrand()).features`), from the same TTL
cache.

`MCP_ALLOWED_ORIGINS` does **not** open the endpoint to browsers on other
origins: this route sends no CORS headers and has no `OPTIONS` handler, so such
a page still cannot read the response. It is an exemption for callers that send
an `Origin` you want accepted, not a cross-origin enabler.

The `403` body is a JSON-RPC error response with no `id` — the shape the spec
permits for a connection rejected before a message is read — and does not echo
the offending value back.

The allowlist is anchored to **configured** values, never to the request's own
`Host` header: in a DNS-rebinding attack the attacker's page carries its own
`Origin` while `Host` already matches the target, so comparing the two would
validate the attack. This is also why the check is not delegated to the SDK's
`enableDnsRebindingProtection` option, which is deprecated in favour of
validating outside the transport.

This closes a specification gap rather than a live hole: `/api/mcp` sends no
`Access-Control-Allow-*` headers, so a cross-origin browser page could never read
its response, and the ordinary clients omit `Origin` entirely.

One caller type does change, though: something exempt from CORS that still sends
an `Origin` — a browser extension with host permissions sends
`Origin: chrome-extension://…` — now gets a `403`, and `MCP_ALLOWED_ORIGINS`
cannot admit it, because opaque origins are dropped from the allowlist by design
(a stored `"null"` would match every sandboxed document). If you operate such a
client, say so on the repo — it needs an allowlist form this does not yet have.

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
