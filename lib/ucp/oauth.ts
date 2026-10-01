import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * UCP identity-linking — OAuth 2.0 Authorization Server core (Hul D).
 *
 * Implementerer dev.ucp.common.identity_linking: Authorization Code + PKCE
 * (kun S256). Gated bag brand.features.ucpIdentityLinking (routerne 404'er når
 * off). Se docs/HUL-D-UCP-IDENTITY-LINKING.md for spec + sikkerheds-noter.
 *
 * Design-principper:
 *  - Kun token-/code-HASHES gemmes (HMAC-SHA256 + AUTH_SECRET-pepper) — en
 *    DB-leak alene giver ikke funktionelle tokens.
 *  - Authorization codes er single-use + kortlivede; redeem er atomisk.
 *  - PKCE S256 er PÅKRÆVET (plain afvises).
 *  - Refresh-rotation: en brugt refresh revokeres + dens access-tokens cascader.
 */

// ─── Konstanter ─────────────────────────────────────────────────────────────
export const CODE_TTL_SECONDS = 60;
export const ACCESS_TTL_SECONDS = 3600; // 1t
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dage

/** Scopes vi tilbyder. Format: {capability}:{scope} (^[a-z][a-z0-9_]*$ for navnet). */
export const SUPPORTED_SCOPES = [
  "dev.ucp.shopping.order:read",
  "dev.ucp.shopping.order:manage",
] as const;
export type UcpScope = (typeof SUPPORTED_SCOPES)[number];

export const SCOPE_POLICIES: Record<string, { plain: string }> = {
  "dev.ucp.shopping.order:read": {
    plain: "Read this user's order history on your behalf.",
  },
  "dev.ucp.shopping.order:manage": {
    plain: "Place and manage orders on this user's behalf.",
  },
};

// ─── Fejl ─────────────────────────────────────────────────────────────────
export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

// ─── Pure crypto/utils (unit-testbare uden DB) ──────────────────────────────
function getPepper(): string {
  const pepper = process.env.AUTH_SECRET;
  if (!pepper) throw new Error("AUTH_SECRET is missing — required for OAuth token hashing");
  return pepper;
}

/** HMAC-SHA256(plaintext, AUTH_SECRET). Bruges til tokens OG auth-codes. */
export function hashToken(plaintext: string): string {
  return createHmac("sha256", getPepper()).update(plaintext).digest("hex");
}

/** Uigennemskueligt token (43 base64url-tegn ≈ 256 bit). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Verificér PKCE S256: base64url(SHA-256(verifier)) === challenge (konstant-tid). */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseScopeString(scope: string): string[] {
  return scope.trim().split(/\s+/).filter(Boolean);
}

/**
 * Validér ønskede scopes mod (a) server-supporterede og (b) klientens tilladte.
 * Returnerer det normaliserede, deduplikerede sæt eller en OAuthError
 * (invalid_scope).
 */
export function validateRequestedScopes(
  requested: string[],
  clientAllowed: string[],
): string[] {
  const allowed = new Set(clientAllowed);
  const supported = new Set<string>(SUPPORTED_SCOPES);
  const out = new Set<string>();
  for (const s of requested) {
    if (!supported.has(s)) {
      throw new OAuthError("invalid_scope", `Unsupported scope: ${s}`, 400);
    }
    if (!allowed.has(s)) {
      throw new OAuthError("invalid_scope", `Scope not granted to client: ${s}`, 400);
    }
    out.add(s);
  }
  if (out.size === 0) {
    throw new OAuthError("invalid_scope", "At least one valid scope is required.", 400);
  }
  return [...out];
}

/** Eksakt redirect_uri-match (open-redirect-værn; ingen normalisering). */
export function redirectUriAllowed(redirectUri: string, registered: string[]): boolean {
  return registered.includes(redirectUri);
}

// ─── RFC 8414 / 9728 metadata ───────────────────────────────────────────────
export function buildAuthorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function buildProtectedResourceMetadata(issuer: string) {
  return {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

// ─── Klient-registrering (RFC 7591, public clients) ─────────────────────────
type ClientRow = {
  id: string;
  name: string;
  redirectUris: string;
  tokenAuthMethod: string;
  scopes: string;
};

export async function getClient(clientId: string): Promise<{
  id: string;
  name: string;
  redirectUris: string[];
  tokenAuthMethod: string;
  scopes: string[];
} | null> {
  const row = (await prisma.oAuthClient.findUnique({ where: { id: clientId } })) as ClientRow | null;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    redirectUris: safeJsonArray(row.redirectUris),
    tokenAuthMethod: row.tokenAuthMethod,
    scopes: safeJsonArray(row.scopes),
  };
}

function safeJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function registerPublicClient(input: {
  name: string;
  redirectUris: string[];
  scopes?: string[];
}): Promise<{ client_id: string; redirect_uris: string[]; scopes: string[] }> {
  if (!input.name?.trim()) {
    throw new OAuthError("invalid_client_metadata", "client name is required.", 400);
  }
  const redirectUris = (input.redirectUris ?? []).filter((u) => isHttpsOrLoopback(u));
  if (redirectUris.length === 0) {
    throw new OAuthError(
      "invalid_redirect_uri",
      "At least one https (or loopback) redirect_uri is required.",
      400,
    );
  }
  // Least-privilege default: udelades scope → KUN order:read (aldrig den
  // mutérende order:manage by default; den skal eksplicit anmodes om). Klienten
  // kan højst få de scopes vi supporterer.
  const DEFAULT_SCOPES = ["dev.ucp.shopping.order:read"];
  const scopes = (input.scopes ?? DEFAULT_SCOPES).filter((s) =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length === 0) {
    throw new OAuthError("invalid_client_metadata", "No supported scopes requested.", 400);
  }
  const row = await prisma.oAuthClient.create({
    data: {
      name: input.name.trim(),
      redirectUris: JSON.stringify(redirectUris),
      tokenAuthMethod: "none",
      scopes: JSON.stringify(scopes),
    },
  });
  return { client_id: row.id, redirect_uris: redirectUris, scopes };
}

/** redirect_uri skal være https — undtagen loopback (RFC 8252 §7.3) til native/dev. */
export function isHttpsOrLoopback(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "::1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Authorization code ─────────────────────────────────────────────────────
/** Opretter en single-use code. Returnerer PLAINTEXT (gemmer kun hash). */
export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge: string;
}): Promise<string> {
  const code = generateOpaqueToken();
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scope: input.scope.join(" "),
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/**
 * Indløs en authorization code: validér client/redirect/PKCE + single-use,
 * markér consumed atomisk. Returnerer {userId, scope}. Replay af en allerede
 * brugt code → invalid_grant (+ defensivt: revokér tokens udstedt under den
 * code ville kræve en code→token-relation; vi holder det enkelt og afviser).
 */
export async function redeemAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ userId: string; scope: string }> {
  const codeHash = hashToken(input.code);
  const row = await prisma.oAuthAuthCode.findUnique({ where: { codeHash } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown authorization code.", 400);
  if (row.consumedAt) throw new OAuthError("invalid_grant", "Authorization code already used.", 400);
  if (row.expiresAt <= new Date()) throw new OAuthError("invalid_grant", "Authorization code expired.", 400);
  if (row.clientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "Code was issued to a different client.", 400);
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch.", 400);
  }
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed.", 400);
  }
  // Atomisk single-use claim: kun flip hvis stadig ikke-consumed.
  const claim = await prisma.oAuthAuthCode.updateMany({
    where: { codeHash, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claim.count === 0) {
    throw new OAuthError("invalid_grant", "Authorization code already used.", 400);
  }
  return { userId: row.userId, scope: row.scope };
}

// ─── Tokens ─────────────────────────────────────────────────────────────────
export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
};

/**
 * Udsteder et access+refresh-par. Access peger på refresh (generation-cascade).
 * familyId bæres uændret gennem rotation (reuse-detection); udelades den ved
 * første udstedelse (auth-code-grant) genereres en ny familie.
 */
export async function issueTokenPair(input: {
  clientId: string;
  userId: string;
  scope: string;
  familyId?: string;
}): Promise<TokenPair> {
  const refresh = generateOpaqueToken();
  const access = generateOpaqueToken();
  const familyId = input.familyId ?? generateOpaqueToken();
  const now = Date.now();

  const refreshRow = await prisma.oAuthToken.create({
    data: {
      tokenHash: hashToken(refresh),
      kind: "refresh",
      clientId: input.clientId,
      userId: input.userId,
      scope: input.scope,
      familyId,
      expiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
    },
  });
  await prisma.oAuthToken.create({
    data: {
      tokenHash: hashToken(access),
      kind: "access",
      clientId: input.clientId,
      userId: input.userId,
      scope: input.scope,
      familyId,
      parentRefreshId: refreshRow.id,
      expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
    },
  });

  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    scope: input.scope,
  };
}

/**
 * Refresh-grant med rotation: validér refresh (hash, ikke-revoked, ikke-udløbet,
 * samme client), revokér den gamle refresh + dens access-tokens, og udsted et
 * nyt par. Scope kan ikke eskaleres (kun et subset af den oprindelige).
 */
export async function refreshTokenGrant(input: {
  refreshToken: string;
  clientId: string;
  requestedScope?: string[];
}): Promise<TokenPair> {
  const tokenHash = hashToken(input.refreshToken);
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!row || row.kind !== "refresh") {
    throw new OAuthError("invalid_grant", "Unknown refresh token.", 400);
  }
  if (row.revokedAt) {
    // REUSE DETECTION (RFC 9700 §4.14.2): en allerede-roteret/revoked refresh
    // præsenteres igen → stærkt tyveri-signal → dræb HELE familien (også den
    // aktuelt-aktive generation), ikke bare denne døde token.
    if (row.familyId) await revokeFamily(row.familyId);
    throw new OAuthError(
      "invalid_grant",
      "Refresh token already used — token family revoked.",
      400,
    );
  }
  if (row.expiresAt <= new Date()) throw new OAuthError("invalid_grant", "Refresh token expired.", 400);
  if (row.clientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "Refresh token belongs to a different client.", 400);
  }

  const originalScopes = parseScopeString(row.scope);
  let scope = originalScopes;
  if (input.requestedScope && input.requestedScope.length > 0) {
    const orig = new Set(originalScopes);
    for (const s of input.requestedScope) {
      if (!orig.has(s)) {
        throw new OAuthError("invalid_scope", `Cannot escalate scope: ${s}`, 400);
      }
    }
    scope = input.requestedScope;
  }

  // Rotation: revokér KUN den præsenterede generation (denne refresh + dens
  // access-tokens) FØR ny udstedelse — det nye par arver familyId.
  await revokeGeneration(row.id);

  return issueTokenPair({
    clientId: row.clientId,
    userId: row.userId,
    scope: scope.join(" "),
    familyId: row.familyId || undefined,
  });
}

/** Revokér én generation: den præsenterede refresh + dens access-børn. */
async function revokeGeneration(refreshId: string): Promise<void> {
  const now = new Date();
  await prisma.oAuthToken.updateMany({
    where: { id: refreshId, revokedAt: null },
    data: { revokedAt: now },
  });
  await prisma.oAuthToken.updateMany({
    where: { parentRefreshId: refreshId, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Revokér HELE token-familien (alle generationer, access + refresh). */
async function revokeFamily(familyId: string): Promise<void> {
  await prisma.oAuthToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * RFC 7009 revocation. Bundet til den anmodende klient (row.clientId ===
 * clientId) — ellers no-op (lækker ikke token-eksistens; svarer stadig 200).
 * Revoke af en refresh dræber hele familien; revoke af et access kun den selv.
 */
export async function revokeToken(token: string, clientId: string): Promise<void> {
  const tokenHash = hashToken(token);
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!row) return; // ukendt token → no-op (RFC 7009)
  if (row.clientId !== clientId) return; // ikke kalderens token → no-op
  if (row.kind === "refresh") {
    await revokeFamily(row.familyId || row.id);
  } else {
    await prisma.oAuthToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/**
 * Validér et access-token til ressource-adgang. Returnerer {userId, scope} eller
 * kaster OAuthError (401 invalid_token / 403 insufficient_scope). Bruges af
 * UCP-commerce-ops via lib/ucp/identity.ts.
 */
export async function validateAccessToken(
  token: string,
  requiredScopes: string[] = [],
): Promise<{ userId: string; clientId: string; scope: string[] }> {
  const tokenHash = hashToken(token);
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!row || row.kind !== "access" || row.revokedAt || row.expiresAt <= new Date()) {
    throw new OAuthError("invalid_token", "Missing, expired, or invalid access token.", 401);
  }
  const granted = parseScopeString(row.scope);
  const grantedSet = new Set(granted);
  for (const need of requiredScopes) {
    if (!grantedSet.has(need)) {
      throw new OAuthError(
        "insufficient_scope",
        `Token lacks required scope: ${need}`,
        403,
      );
    }
  }
  return { userId: row.userId, clientId: row.clientId, scope: granted };
}
