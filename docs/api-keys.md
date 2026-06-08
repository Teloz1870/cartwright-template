# API keys & authentication

Cartwright exposes its full operational tool surface (catalog, orders, discounts,
pages, campaigns, …) over two authenticated programmatic interfaces:

- **REST** — `POST /api/v1/tools/<name>` (one tool per call).
- **MCP** — `POST /api/mcp` (Model Context Protocol; see [mcp.md](mcp.md)).

Both authenticate the same way: a **Bearer API key** in the `Authorization`
header. This document describes how keys are minted, stored, verified and
revoked, and which environment the auth layer depends on.

Source of truth: [`lib/api-auth.ts`](../lib/api-auth.ts),
[`lib/scopes.ts`](../lib/scopes.ts), [`lib/env-preflight.ts`](../lib/env-preflight.ts).

---

## Key format

```
sb_live_<24 random bytes, base64url>
```

- The `sb_live_` prefix makes keys greppable in logs and recognizable in the
  admin UI. The `live` segment reserves room for a future `sb_test_` variant
  against a sandbox database.
- Entropy comes from `randomBytes(24)` (192 bits) — not guessable.

Keys are created in **`/admin/api-keys`** (shop-owner only). The plaintext is
shown **exactly once** at creation time; only the hash is persisted.

## Storage — the database never holds a usable key

Cartwright stores a **keyed hash**, not the key itself:

```
keyHash = HMAC-SHA256(key_plaintext, pepper = AUTH_SECRET)
```

Two properties follow:

1. **A database leak alone is not enough to forge a key.** The stored value is
   an HMAC, and the HMAC pepper is `AUTH_SECRET`, which lives only in the
   server environment — never in the database. An attacker who exfiltrates the
   `ApiKey` table still cannot produce a token that verifies, because they
   cannot recompute the HMAC without the server-side secret.
2. **We reuse `AUTH_SECRET` deliberately.** It is already required by Auth.js,
   so there is no new secret to rotate or leak. (`getKeyPepper()` throws if it
   is missing — see preflight below.)

Plain SHA-256 was rejected for exactly reason (1): an unkeyed digest is forgeable
from a DB dump. The pepper closes that gap.

## Verification flow

`authenticateApiKey(req)` and the convenience wrapper `requireApiScope(req, scope)`
are the entry points every REST/MCP route calls first. The flow:

1. **Extract** the bearer token (`extractBearerToken`). Missing/badly-formed
   header → `401`.
2. **Prefix check** — token must start with `sb_live_`, else `401` (cheap reject
   before any DB hit).
3. **Hash + lookup** — `HMAC-SHA256` the token and look up `ApiKey.keyHash`
   (unique index). No row → `401 Invalid API key`.
4. **Revocation** — if `revokedAt` is set → `401 API key revoked`.
5. **Last-used stamp** — `lastUsedAt` is updated **fire-and-forget**; a failure
   here never fails the request (it is observability, not security).
6. **Scopes** — the key's `scopes` JSON column is parsed into a `Scope[]`.
   Malformed JSON → `401` (database-integrity guard).

The function **never throws** — it returns `{ actor }` or
`{ error: { status, body } }` so callers format responses consistently via
`apiErrorResponse(error)`.

### Authorizing a specific action

`requireApiScope(req, scope)` runs the flow above and then checks the key
carries the scope the tool requires (`hasScope`). Missing scope → `403` with a
message naming the required scope. See [scopes-and-tools.md](scopes-and-tools.md)
for the scope model and the per-tool mapping.

### Audit identity

Each authenticated actor is rendered as `apikey:<id>` (`actorToAuditString`) in
the audit log, distinct from `user:<id>` (Auth.js session) and
`storefront-chat:<sid>`. Every tool invocation is attributed to one of these.

## Revoking a key

Set `revokedAt` (via `/admin/api-keys`). Verification rejects revoked keys at
step 4 on the **next** call — there is no in-memory key cache to wait out, so
revocation is effectively immediate.

## Environment dependency & preflight

The auth layer hard-depends on **`AUTH_SECRET`**. To fail fast rather than at
the first request, [`lib/env-preflight.ts`](../lib/env-preflight.ts) (`assertEnv()`)
checks required env on the boot path / via the preflight CLI:

- **`AUTH_SECRET`** — always required (also the API-key pepper). Generate with
  `openssl rand -hex 32`.
- In **production**, `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are required (the
  app refuses to boot on an ephemeral local SQLite file — see
  [supabase-postgres.md](supabase-postgres.md) and `DEPLOY.md §2`).
- In **dev**, either `DATABASE_URL` (e.g. `file:./dev.db`) or the Turso pair.

`assertEnv()` is skipped during `next build` (`NEXT_PHASE=phase-production-build`)
so a build without secrets still succeeds. Env values are scrubbed of
non-printable characters and surrounding quotes before use (clipboard paste into
the Vercel UI has historically introduced zero-width characters that break HTTP
headers).

## Operational checklist

- [ ] `AUTH_SECRET` set (32+ random bytes) in every environment.
- [ ] Keys minted in `/admin/api-keys`, copied once, stored in the consumer's
      secret manager — never committed.
- [ ] Each key granted the **minimum** scopes it needs (principle of least
      privilege; see [scopes-and-tools.md](scopes-and-tools.md)).
- [ ] Rotate by minting a new key, swapping the consumer, then revoking the old.
