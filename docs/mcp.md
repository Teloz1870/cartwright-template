# MCP endpoint architecture

Cartwright ships a public **Model Context Protocol** endpoint at `POST /api/mcp`.
MCP is the open standard for connecting AI clients (Claude Desktop, etc.) to real
systems. Anonymous clients receive a deliberately small, rate-limited read-only
surface; a valid Bearer key receives the full registry, with each invocation
still constrained by that key's scopes.

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

Three verbs reach the transport: `GET` (after the intro check below), `POST`
and `DELETE` all run the same `guard()` and then `serve()`. A fourth, `OPTIONS`,
runs `guard()` and stops there — it answers metadata, never a session.

## Origin validation (DNS-rebinding protection)

The transport specification requires an MCP server to validate the `Origin`
header on all incoming connections and to answer **`403 Forbidden`** when the
header is present and not allowed. `guard()` does that on every verb the route
answers — `GET`, `POST`, `DELETE` and `OPTIONS` — including the unauthenticated
intro branch that never reaches the transport at all.

`OPTIONS` is on that list because the route exports a handler for it. With no
export Next.js installs its own — a `204` with an `Allow` header, which is not
this route's code and so never reaches the gate. A shop with `mcpPublic` turned
off would therefore reply `404` to the other three while still announcing
`Allow: DELETE, GET, HEAD, OPTIONS, POST` — the surface the `404` is claiming
not to have. The exported handler returns the same plain `204` + `Allow` for
callers the gate admits, and the gate's own answer for everyone else.

(`HEAD` is in that list without an export of its own: Next implements it from
`GET`, so `HEAD /api/mcp` runs the gated `GET` handler.)

`/api/v1/tools`, `/api/v1/tools/<name>` and `/.well-known/mcp.json` now export
`OPTIONS` through the same gate, so the whole `mcpPublic` surface answers `404`
uniformly when the flag is off. Measured on a production build with the flag
off: all four paths return `404 {"error":"not_found"}` with no `Allow` header,
on `GET` and `OPTIONS` alike.

Two neighbours of this gap remain **open**. A verb the route handles for
nobody — `PUT`, `PATCH` — still gets Next's automatic `405`, which is its own
"something is mounted here" signal, and is as cheap for a scanner to probe as
the `OPTIONS` `204` was; and the `404` body is `{"error":"not_found"}` — JSON
an absent route would not produce. "Turned off" is therefore
*near*-indistinguishable from "never existed", not identical to it.

What is allowed:

| `Origin` on the request | Result |
|---|---|
| absent (Claude Desktop, curl, server-to-server) | allowed — the spec rejects only a *present* header |
| present but empty (an intermediary stripped the value) | allowed — no browser sends this |
| your shop's own URL — `brand.url` **or** the domain set in the setup wizard | allowed |
| anything listed in `MCP_ALLOWED_ORIGINS` (comma-separated) | allowed |
| `http://localhost:*` / `127.0.0.1` / `[::1]` | allowed **outside production only** |
| an opaque origin named explicitly as `opaque:<scheme>://<host>` | allowed |
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
origins: this route sends no `Access-Control-Allow-*` headers on any verb — its
`OPTIONS` handler answers the plain HTTP question ("which methods?") and is
deliberately not a CORS preflight — so such a page still cannot read the
response. It is an exemption for callers that send an `Origin` you want
accepted, not a cross-origin enabler.

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
`Origin: chrome-extension://…`, which the URL specification serializes as the
string `"null"`. Those are dropped from the allowlist by default, because one
stored `"null"` would match every sandboxed document at once — a `file://` page,
a sandboxed iframe and your extension are indistinguishable once serialized.

To admit exactly one, name it with an `opaque:` prefix, which matches that single
`scheme://host` and nothing else:

```bash
MCP_ALLOWED_ORIGINS="opaque:chrome-extension://abcdefghijklmnopabcdefghijklmnop"
```

Hostless values (`opaque:file:///x`, `opaque:data:…`, `opaque:null`) are dropped
for the same reason — there is no host to tell them apart by. The host is **not**
lower-cased, unlike an ordinary origin, because an extension id is
case-sensitive: copy it exactly.

## Auth & per-invocation scope enforcement

Without an `Authorization` header, MCP exposes only `products.search`,
`products.get`, `categories.list`, `site.list_pages` and `site.get_page`.
The two site tools query `status = published`; they cannot return drafts.
Supplying a header switches to API-key verification; an invalid key is rejected
rather than silently falling back to anonymous access.

Every registered tool's MCP handler delegates to the shared
`invokeTool(name, args, ctx, actor.scopes)` — the **same chokepoint** the REST
endpoint uses (see [scopes-and-tools.md](scopes-and-tools.md)). Consequences:

- Scope checks, Zod validation, audit logging and `confirm: true` gating behave
  **identically** over MCP and REST. There is no second, weaker path.
- MCP publishes each tool's concrete Zod input schema directly. The transport
  still accepts the legacy `{ "args": { ... } }` call shape for one compatibility
  release by normalizing it before SDK validation.
- Tools with a registry result schema publish a concrete MCP `outputSchema` and
  successful calls return both text content and the same value under
  `structuredContent.result`. Public tools carry read-only, non-destructive,
  idempotent and closed-world behavioral annotations.
- Each invocation stamps `actor = apikey:<id>`, a fresh `requestId`, and the
  caller IP / user-agent into the audit context.

Tool results retain MCP `text` content (pretty-printed JSON) for older clients;
typed clients use `structuredContent`. Failures come back as `isError: true`
with `[error <status>] <message>`. Validation and permission messages remain
actionable; unexpected handler/provider failures use a generic message so SQL,
filesystem paths and credentials never cross the MCP boundary.

## Anonymous rate limiting and trusted client IPs

The five anonymous tools share one 60-token public-agent bucket across MCP and
REST, refilling at one token per second. Responses expose the current
HTTPAPI structured `RateLimit-Policy` and `RateLimit` fields, plus legacy
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` compatibility
fields; a rejected request also includes `Retry-After`. When Upstash credentials are configured,
Redis is authoritative across serverless instances. A consumed local shadow
bucket remains active if Redis is missing or times out, so a provider failure
does not create a fresh unthrottled burst.

Every request that attempts Bearer authentication also consumes a separate
120-token `auth-attempt` bucket before API-key lookup. That local pre-auth
boundary remains active without Upstash, preventing formatted junk keys from
turning credential verification into an unthrottled database endpoint. Valid
authenticated calls expose that policy in the same structured and legacy
headers.

Anonymous JSON-RPC batches are rejected before they reach the MCP transport.
This prevents one HTTP request from invoking many public tools for one limiter
token. Authenticated, scope-restricted clients may still use protocol batching.

Client identity is accepted only from a trusted ingress:

- Vercel's ingress-owned forwarding header is trusted automatically and its IP
  value is validated, length-capped and IPv6-canonicalized.
- A self-hosted process ignores forwarding headers by default and places
  anonymous traffic in one conservative `unknown` bucket.
- A self-hosted operator may set
  `CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true` only after placing the app behind a
  reverse proxy that overwrites `X-Forwarded-For`. Enabling it behind a proxy
  that merely appends untrusted client input makes the limiter bypassable.

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

It also publishes read-only MCP resources for `llms.txt`, the public sitemap,
and public company/contact/policy information with explicit MIME types.

Pre-connection discovery is available at `/.well-known/mcp`,
`/.well-known/mcp/server-card.json`, and the compatibility path
`/.well-known/mcp.json`. Every card reports the same server version and exact
anonymous tool allowlist. `/.well-known/api-catalog` is the RFC 9727 entrypoint
for the REST/OpenAPI surface, while `/.well-known/agent-skills/index.json`
publishes a digest-verified portable public-site research skill.

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
404 — near-indistinguishable from a site without the surface. That now holds
for `OPTIONS` across the whole surface — `/api/mcp`, `/api/v1/tools*`, the MCP
server cards, API catalog, and Agent Skills routes each export the verb through
their gate (see the origin
section for why it needed an explicit handler); only the unhandled verbs still
answer Next's automatic `405`. Note: `features.set`
is itself a REST tool, so after disabling over REST the only way back on is
the admin UI. Keys minted in `/admin/api-keys` can carry an expiry; expired
keys are rejected with 401.

**Writing your own gated route?** Export `OPTIONS` through the same gate. The
framework behaviour above is not specific to this surface: any route module
that exports no `OPTIONS` gets Next's substitute, which answers `204` +
`Allow` without consulting your gate. Measured on a production build of a
website-mode shop, two routes elsewhere in the engine still show it —
`/.well-known/oauth-protected-resource` (gated on the `ucpIdentityLinking`
flag) and `/api/acp/feed` (gated on `ecommerceEnabled`, so it 404s on a
website-mode shop and serves normally on a webshop) both return `404` on `GET`
and `204 Allow: GET, HEAD, OPTIONS` on `OPTIONS`.

## Design rationale

- **One enforcement path.** MCP and REST share `invokeTool`, so security
  invariants are proven once.
- **Stateless > stateful** on serverless — no session store to lose, no
  initialize handshake to coordinate across instances.
- **Curated catalog, not schema introspection.** Clients get a stable,
  intentional contract; the database shape stays private and free to evolve.
