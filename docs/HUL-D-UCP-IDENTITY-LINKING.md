# Hul D — UCP identity-linking (OAuth 2.0): spec + færdiggørelse

**Status: BYGGET (default-off + db:push-gated).** Den fulde OAuth 2.0
Authorization Server er nu implementeret bag flaget `brand.features.ucpIdentityLinking`
(`tier: runtime`, default-off). Den anden halvdel af UCP-modenhed
(`g:native_commerce` i feed + capability-profil) var allerede shippet.

**Før aktivering:** kør `db:push` så de tre nye modeller findes
(`OAuthClient`, `OAuthAuthCode`, `OAuthToken`). Med flaget OFF 404'er alle
`/oauth/*`-routes og `/.well-known/ucp` annoncerer **ikke** identity-linking.

### Implementeret (filer)
- `lib/ucp/oauth.ts` — core: PKCE-S256-verify, scope-validering, RFC 8414/9728-metadata,
  client-registrering, single-use codes, token-udstedelse/-rotation/-revoke (cascade),
  access-token-validering. Kun token-/code-HASHES gemmes (HMAC + AUTH_SECRET).
- `lib/ucp/authorize.ts` — delt authorize-param-validering (no_redirect vs redirect).
- `lib/ucp/identity.ts` — `requireUcpIdentity()` (Bearer + scope → identity_required/insufficient_scope).
- `lib/ucp/gate.ts` — flag-gate + request-afledt issuer.
- Routes: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`,
  `/oauth/register` (RFC 7591), `/oauth/authorize` (consent-side + server-action),
  `/oauth/token` (authorization_code + refresh_token), `/oauth/revoke` (RFC 7009).
- `app/api/ucp/orders` — eksempel-protected-resource (kræver `dev.ucp.shopping.order:read`).
- `/.well-known/ucp` — spec-formet `dev.ucp.common.identity_linking`-capability m. `config.scopes`.
- `tests/unit/ucp-oauth.test.ts` — 29 cases (PKCE, scopes, single-use, scope-eskalering, revoke-cascade).

## Verificeret spec (ucp.dev/draft/specification/identity-linking, juni 2026)

- **Capability:** `dev.ucp.common.identity_linking`; schema `https://ucp.dev/schemas/common/identity_linking.json`.
- **Flow:** OAuth 2.0 **Authorization Code + PKCE (kun S256)** — eneste tilladte mekanisme.
  1. Metadata-discovery (RFC 8414) på `/.well-known/oauth-authorization-server`
  2. Authorization-request → `authorization_endpoint`
  3. Authorization-response m. `code` + `iss`-parameter (RFC 9207)
  4. Token-request → `token_endpoint` m. PKCE `code_verifier`
  5. Token-response → `access_token` + `refresh_token`
- **Authorization-server-metadata** (`/.well-known/oauth-authorization-server`) SKAL indeholde:
  `issuer` (byte-for-byte = discovery-base), `authorization_endpoint`, `token_endpoint`,
  `revocation_endpoint` (RFC 7009), `scopes_supported`, `response_types_supported` (incl. `"code"`),
  `grant_types_supported` (incl. `"authorization_code"` + `"refresh_token"`),
  `code_challenge_methods_supported` (**kun** `"S256"`), `token_endpoint_auth_methods_supported`,
  `authorization_response_iss_parameter_supported: true`.
- **Client-auth:** confidential clients → `private_key_jwt` (RFC 7523) eller `tls_client_auth`
  (RFC 8705), evt. `client_secret_basic`; **aldrig** plain PKCE. Public clients →
  `token_endpoint_auth_methods_supported: ["none"]` + PKCE S256, ingen `client_secret`.
- **Scope-format:** `{capability-name}:{scope-name}` (fx `dev.ucp.shopping.order:read`,
  `dev.ucp.shopping.checkout:manage`); scope-navn matcher `^[a-z][a-z0-9_]*$`.
- **Profil-deklaration** (`/.well-known/ucp` → `capabilities`):
  ```json
  { "dev.ucp.common.identity_linking": [{
    "version": "draft",
    "spec": "https://ucp.dev/specification/identity-linking",
    "schema": "https://ucp.dev/schemas/common/identity_linking.json",
    "config": { "scopes": { "dev.ucp.shopping.order:read": {}, "dev.ucp.shopping.order:manage": {} } }
  }] }
  ```
- **Fejl:** `identity_required` (401, `WWW-Authenticate: Bearer realm="<issuer>"`),
  `insufficient_scope` (403, `WWW-Authenticate: Bearer error="insufficient_scope" scope="<set>"`);
  begge peger på `/.well-known/oauth-protected-resource`.
- **Sikkerhed:** validér `iss` mod discovered `issuer`; eksakt `redirect_uri`-match
  (undt. loopback per RFC 8252 §7.3); `state` (CSRF); TLS 1.2+; revocation invaliderer
  alle udstedte access tokens.

## Checkliste — status

1. ✅ `/.well-known/oauth-authorization-server` (RFC 8414).
2. ✅ `/.well-known/oauth-protected-resource` (RFC 9728).
3. ✅ Authorization-endpoint: consent-side (Auth.js-session) + PKCE-capture + eksakt redirect-match + state + engangs-code + iss.
4. ✅ Token-endpoint: authorization_code + refresh_token; PKCE-verify (afviser manglende/plain via S256-only).
5. ✅ Revocation-endpoint (RFC 7009) m. refresh→access cascade.
6. ✅ Scope-håndhævelse: `requireUcpIdentity()` + eksempel-resource `app/api/ucp/orders`.
7. ✅ Prisma-modeller (OAuthClient/OAuthAuthCode/OAuthToken) — **kør `db:push` før aktivering**.
8. ✅ `/.well-known/ucp` deklarerer `dev.ucp.common.identity_linking` m. `config.scopes` (gated).
9. ✅ Flag promoveret til `tier: "runtime"` + `implemented: true` (default-off).

### Sikkerheds-hærdning (efter adversariel review)
- **Refresh reuse-detection (RFC 9700 §4.14.2):** tokens bærer en `familyId` gennem rotation;
  genbrug af en allerede-roteret refresh dræber HELE familien (ikke kun den døde token).
- **Client-bundet revocation:** `revokeToken(token, clientId)` revokerer kun hvis `row.clientId`
  matcher (svarer stadig 200 — lækker ikke eksistens). Refresh-revoke dræber familien.
- **Issuer fra kanonisk origin:** `canonicalIssuer()` bruger `AUTH_URL`/`brand.url` (IKKE
  Host/X-Forwarded-Host) → ingen issuer-spoofing/cache-poisoning af discovery-metadata.
- **Least-privilege registrering:** udeladt `scope` defaulter til `order:read` (aldrig
  `order:manage`); consent-siden mærker klienten som ikke-verificeret + clamper navnet.

### Resterende / follow-ups
- **Confidential clients** (private_key_jwt / tls_client_auth): metadata annoncerer kun `none`
  (public + PKCE) i v1. Tilføj confidential-auth hvis en partner kræver det.
- **Rate-limiting + logging** på `/oauth/register` (genbrug `lib/rate-limit.ts`) mod registrerings-spam.
- **Bredere scope-rollout:** flere UCP-commerce-ops (cart/checkout) bag `requireUcpIdentity`.
- **Cron-oprydning** af udløbne codes/tokens (kan tilføjes til en eksisterende cleanup-cron).

## Verifikation før go-live
Kør en UCP-conformance-klient (eller `ucpchecker`) mod `/.well-known/ucp` +
`/.well-known/oauth-authorization-server`; gennemfør en fuld authorization-code+PKCE-
linking + en scoped commerce-operation + en revocation. Canary-mosaik (UCP er ungt —
valider på staging før promovering).
