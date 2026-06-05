import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import { composeGoogleScopes } from "@/lib/google/scopes";

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  accountEmail: string | null;
  grantedScopes: string[];
  tokenExpiresAt: Date | null;
  connectedAt: Date | null;
  lastError: string | null;
};

export type GoogleOAuthInertResult = {
  ok: false;
  reason: "missing_credentials" | "not_connected" | "missing_refresh_token" | "oauth_error" | "db_error";
  error: string;
};

const CACHE_TTL_MS = 30_000;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

let cachedCredentials: {
  value: GoogleOAuthCredentials | null;
  expiresAt: number;
} | null = null;

function maskOAuthError(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  return "Google OAuth request failed";
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((scope): scope is string => typeof scope === "string")
      : [];
  } catch {
    return [];
  }
}

function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createGoogleOAuthPkce(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  return {
    state,
    codeVerifier,
    codeChallenge: codeChallengeFromVerifier(codeVerifier),
  };
}

export async function getGoogleOAuthCredentials(): Promise<GoogleOAuthCredentials | null> {
  const now = Date.now();
  if (cachedCredentials && cachedCredentials.expiresAt > now) {
    return cachedCredentials.value;
  }

  let clientId: string | null = null;
  let clientSecret: string | null = null;

  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        googleOAuthClientId: true,
        googleOAuthClientSecret: true,
      },
    });
    clientId = row?.googleOAuthClientId
      ? decryptSecret(row.googleOAuthClientId)
      : null;
    clientSecret = row?.googleOAuthClientSecret
      ? decryptSecret(row.googleOAuthClientSecret)
      : null;
  } catch {
    // DB ikke tilgængelig — fall back til env.
  }

  clientId = clientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? null;
  clientSecret = clientSecret ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? null;

  const value = clientId && clientSecret ? { clientId, clientSecret } : null;
  cachedCredentials = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function invalidateGoogleOAuthCredentialsCache(): void {
  cachedCredentials = null;
}

export async function buildGoogleOAuthConsentUrl(args: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
}): Promise<{ ok: true; url: string } | GoogleOAuthInertResult> {
  const credentials = await getGoogleOAuthCredentials();
  if (!credentials) {
    return {
      ok: false,
      reason: "missing_credentials",
      error: "Google OAuth client id/secret is not configured.",
    };
  }

  const scopes = args.scopes?.length ? args.scopes : composeGoogleScopes();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", args.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { ok: true, url: url.toString() };
}

async function postGoogleToken(
  body: URLSearchParams,
): Promise<
  | {
      ok: true;
      token: {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
      };
    }
  | GoogleOAuthInertResult
> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return {
      ok: false,
      reason: "oauth_error",
      error: "Google OAuth token endpoint is unreachable.",
    };
  }
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    return {
      ok: false,
      reason: "oauth_error",
      error: maskOAuthError(payload?.error_description ?? payload?.error),
    };
  }

  return {
    ok: true,
    token: {
      access_token:
        typeof payload?.access_token === "string"
          ? payload.access_token
          : undefined,
      refresh_token:
        typeof payload?.refresh_token === "string"
          ? payload.refresh_token
          : undefined,
      expires_in:
        typeof payload?.expires_in === "number" ? payload.expires_in : undefined,
      scope: typeof payload?.scope === "string" ? payload.scope : undefined,
      token_type:
        typeof payload?.token_type === "string" ? payload.token_type : undefined,
    },
  };
}

export async function exchangeGoogleOAuthCode(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ ok: true; status: GoogleConnectionStatus } | GoogleOAuthInertResult> {
  const credentials = await getGoogleOAuthCredentials();
  if (!credentials) {
    return {
      ok: false,
      reason: "missing_credentials",
      error: "Google OAuth client id/secret is not configured.",
    };
  }

  const tokenResult = await postGoogleToken(
    new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: args.code,
      code_verifier: args.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: args.redirectUri,
    }),
  );
  if (!tokenResult.ok) {
    await markGoogleConnectionError(tokenResult.error);
    return tokenResult;
  }

  const { token } = tokenResult;
  if (!token.access_token) {
    const error = "Google OAuth response did not include an access token.";
    await markGoogleConnectionError(error);
    return { ok: false, reason: "oauth_error", error };
  }
  if (!token.refresh_token) {
    const error =
      "Google OAuth response did not include a refresh token. Reconnect Google and approve offline access.";
    await markGoogleConnectionError(error);
    return { ok: false, reason: "oauth_error", error };
  }

  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;
  const scopes = token.scope ? token.scope.split(/\s+/).filter(Boolean) : composeGoogleScopes();

  try {
    await prisma.googleConnection.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        tokenExpiresAt: expiresAt,
        grantedScopesJson: JSON.stringify(scopes),
        status: "connected",
        lastError: null,
        connectedAt: new Date(),
      },
      update: {
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        tokenExpiresAt: expiresAt,
        grantedScopesJson: JSON.stringify(scopes),
        status: "connected",
        lastError: null,
        connectedAt: new Date(),
      },
    });
  } catch {
    return {
      ok: false,
      reason: "db_error",
      error: "Could not persist Google OAuth tokens.",
    };
  }

  return { ok: true, status: await getGoogleConnectionStatus() };
}

async function markGoogleConnectionError(error: string): Promise<void> {
  try {
    await prisma.googleConnection.upsert({
      where: { id: 1 },
      create: { id: 1, status: "error", lastError: error },
      update: { status: "error", lastError: error },
    });
  } catch {
    // Status-write failure should not turn a fail-soft OAuth result into a throw.
  }
}

export async function refreshGoogleConnectionAccessToken(): Promise<
  { ok: true; accessToken: string; tokenExpiresAt: Date | null } | GoogleOAuthInertResult
> {
  const credentials = await getGoogleOAuthCredentials();
  if (!credentials) {
    return {
      ok: false,
      reason: "missing_credentials",
      error: "Google OAuth client id/secret is not configured.",
    };
  }

  let refreshToken: string | null = null;
  try {
    const row = await prisma.googleConnection.findUnique({
      where: { id: 1 },
      select: { refreshTokenEnc: true },
    });
    refreshToken = row?.refreshTokenEnc
      ? decryptSecret(row.refreshTokenEnc)
      : null;
  } catch {
    return {
      ok: false,
      reason: "db_error",
      error: "Could not read Google OAuth connection from the database.",
    };
  }

  if (!refreshToken) {
    return {
      ok: false,
      reason: "missing_refresh_token",
      error: "Google OAuth refresh token is missing. Reconnect Google.",
    };
  }

  const tokenResult = await postGoogleToken(
    new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  if (!tokenResult.ok) {
    await markGoogleConnectionError(tokenResult.error);
    return tokenResult;
  }

  const accessToken = tokenResult.token.access_token;
  if (!accessToken) {
    const error = "Google refresh response did not include an access token.";
    await markGoogleConnectionError(error);
    return { ok: false, reason: "oauth_error", error };
  }

  const tokenExpiresAt =
    typeof tokenResult.token.expires_in === "number"
      ? new Date(Date.now() + tokenResult.token.expires_in * 1000)
      : null;

  try {
    await prisma.googleConnection.update({
      where: { id: 1 },
      data: {
        accessTokenEnc: encryptSecret(accessToken),
        ...(tokenResult.token.refresh_token
          ? { refreshTokenEnc: encryptSecret(tokenResult.token.refresh_token) }
          : {}),
        tokenExpiresAt,
        status: "connected",
        lastError: null,
      },
    });
  } catch {
    return {
      ok: false,
      reason: "db_error",
      error: "Could not persist refreshed Google OAuth token.",
    };
  }

  return { ok: true, accessToken, tokenExpiresAt };
}

export async function revokeGoogleConnection(): Promise<
  { ok: true } | GoogleOAuthInertResult
> {
  let remoteRevokeWarning: string | null = null;

  try {
    const row = await prisma.googleConnection.findUnique({
      where: { id: 1 },
      select: { accessTokenEnc: true, refreshTokenEnc: true },
    });
    const token =
      (row?.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : null) ??
      (row?.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : null);

    if (token) {
      const response = await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
      if (!response.ok) {
        remoteRevokeWarning = `Google token revoke failed with status ${response.status}.`;
        console.warn("[google-oauth] remote revoke failed:", response.status);
      }
    }
  } catch (error) {
    remoteRevokeWarning = "Google token revoke request failed.";
    console.warn(
      "[google-oauth] remote revoke failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  try {
    await prisma.googleConnection.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        status: "disconnected",
        lastError: remoteRevokeWarning,
      },
      update: {
        accountEmail: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        grantedScopesJson: null,
        status: "disconnected",
        lastError: remoteRevokeWarning,
        connectedAt: null,
      },
    });
  } catch {
    return {
      ok: false,
      reason: "db_error",
      error: "Could not clear Google OAuth connection.",
    };
  }

  return { ok: true };
}

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const configured = (await getGoogleOAuthCredentials()) !== null;
  try {
    const row = await prisma.googleConnection.findUnique({
      where: { id: 1 },
      select: {
        accountEmail: true,
        grantedScopesJson: true,
        tokenExpiresAt: true,
        status: true,
        lastError: true,
        connectedAt: true,
        refreshTokenEnc: true,
      },
    });

    return {
      configured,
      connected: row?.status === "connected" && !!row.refreshTokenEnc,
      status: row?.status ?? "disconnected",
      accountEmail: row?.accountEmail ?? null,
      grantedScopes: parseScopes(row?.grantedScopesJson),
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      connectedAt: row?.connectedAt ?? null,
      lastError: row?.lastError ?? null,
    };
  } catch {
    return {
      configured,
      connected: false,
      status: "error",
      accountEmail: null,
      grantedScopes: [],
      tokenExpiresAt: null,
      connectedAt: null,
      lastError: "Could not read Google OAuth connection from the database.",
    };
  }
}
