import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";
import { refreshGoogleConnectionAccessToken } from "@/plugins/google-workspace/lib/google/oauth";

export type GoogleFetchErrorCode =
  | "not_connected"
  | "missing_access_token"
  | "refresh_failed"
  | "db_error";

export type GoogleFetchResult =
  | { ok: true; response: Response }
  | {
      ok: false;
      error: {
        code: GoogleFetchErrorCode;
        message: string;
      };
    };

const REFRESH_SKEW_MS = 60_000;

async function getUsableAccessToken(): Promise<
  { ok: true; accessToken: string } | Exclude<GoogleFetchResult, { ok: true }>
> {
  let row:
    | {
        accessTokenEnc: string | null;
        refreshTokenEnc: string | null;
        tokenExpiresAt: Date | null;
        status: string;
      }
    | null = null;

  try {
    row = await prisma.googleConnection.findUnique({
      where: { id: 1 },
      select: {
        accessTokenEnc: true,
        refreshTokenEnc: true,
        tokenExpiresAt: true,
        status: true,
      },
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "db_error",
        message: "Could not read Google OAuth connection from the database.",
      },
    };
  }

  if (!row || row.status !== "connected" || !row.refreshTokenEnc) {
    return {
      ok: false,
      error: {
        code: "not_connected",
        message: "Google OAuth is not connected.",
      },
    };
  }

  const expiresAt = row.tokenExpiresAt?.getTime() ?? 0;
  const isExpired = !expiresAt || expiresAt - REFRESH_SKEW_MS <= Date.now();
  if (isExpired) {
    const refreshed = await refreshGoogleConnectionAccessToken();
    if (!refreshed.ok) {
      return {
        ok: false,
        error: {
          code: "refresh_failed",
          message: refreshed.error,
        },
      };
    }
    return { ok: true, accessToken: refreshed.accessToken };
  }

  const accessToken = row.accessTokenEnc
    ? decryptSecret(row.accessTokenEnc)
    : null;
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: "missing_access_token",
        message: "Google OAuth access token is missing. Reconnect Google.",
      },
    };
  }

  return { ok: true, accessToken };
}

export async function authorizedGoogleFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<GoogleFetchResult> {
  const token = await getUsableAccessToken();
  if (!token.ok) return token;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);

  return {
    ok: true,
    response: await fetch(input, {
      ...init,
      headers,
    }),
  };
}
