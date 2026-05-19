import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hasScope, type Scope } from "@/lib/scopes";

/**
 * Server-side pepper bundet til AUTH_SECRET. Sammen med hashing-funktionen
 * sikrer dette at en DB-leak alene ikke giver angriberen funktionelle keys —
 * de skal også have AUTH_SECRET fra serverens env.
 *
 * AUTH_SECRET er allerede påkrævet for Auth.js — vi genbruger den i stedet
 * for at introducere et nyt secret der skal vedligeholdes.
 */
function getKeyPepper(): string {
  const pepper = process.env.AUTH_SECRET;
  if (!pepper) {
    throw new Error(
      "AUTH_SECRET mangler — kræves som pepper for API-key hashing",
    );
  }
  return pepper;
}

/**
 * Format: `sb_live_<24-bytes-base64url>` (32 chars effektiv entropi).
 * Prefix gør keys nemme at genkende i logs/UI; "live" reserverer plads for
 * en fremtidig "sb_test_"-variant mod sandbox-DB.
 */
const KEY_PREFIX = "sb_live_";

export type ApiKeyActor = {
  type: "apikey";
  apiKeyId: string;
  userId: string;
  scopes: Scope[];
};

export type ApiAuthError = {
  status: 401 | 403;
  body: { error: string };
};

/**
 * Genererer en ny API-key. Returnerer både plaintext (vises ÉN gang til
 * brugeren) og hash (gemmes i DB). Brug i `/admin/api-keys/actions.ts`.
 */
export function generateApiKey(): { plaintext: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${raw}`;
  const hash = hashApiKey(plaintext);
  return { plaintext, hash };
}

export function hashApiKey(plaintext: string): string {
  // HMAC-SHA256 med server-side pepper i stedet for plain SHA-256.
  // DB-leak alene giver ikke funktionelle keys (review fund #8).
  return createHmac("sha256", getKeyPepper()).update(plaintext).digest("hex");
}

/**
 * Parser Authorization header. Returnerer null hvis intet eller forkert
 * format — caller beslutter om dette er 401 (kræver auth) eller fallback.
 */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Verificér en bearer-token og returnér actor med scopes. Bruges af
 * REST og MCP routes som første kald i deres handler.
 *
 * Returnerer { actor } ved success eller { error } med status-kode klar
 * til at sende som Response. Aldrig kast — caller skal kunne formattere
 * response-body konsistent.
 */
export async function authenticateApiKey(
  req: Request,
): Promise<{ actor: ApiKeyActor } | { error: ApiAuthError }> {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      error: {
        status: 401,
        body: { error: "Missing Authorization header (expected: Bearer sb_live_…)" },
      },
    };
  }

  if (!token.startsWith(KEY_PREFIX)) {
    return {
      error: { status: 401, body: { error: "Invalid API key format" } },
    };
  }

  const hash = hashApiKey(token);
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

  if (!key) {
    return { error: { status: 401, body: { error: "Invalid API key" } } };
  }

  if (key.revokedAt) {
    return { error: { status: 401, body: { error: "API key revoked" } } };
  }

  // Fire-and-forget — vi vil ikke fejle requesten hvis denne update fejler.
  // (SQLite kan undertiden hænge ved samtidige writes; lastUsedAt er
  // observability, ikke security.)
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  let scopes: Scope[];
  try {
    const parsed = JSON.parse(key.scopes);
    if (!Array.isArray(parsed)) throw new Error("scopes is not an array");
    scopes = parsed as Scope[];
  } catch {
    return {
      error: {
        status: 401,
        body: { error: "API key has malformed scopes (database integrity)" },
      },
    };
  }

  return {
    actor: { type: "apikey", apiKeyId: key.id, userId: key.userId, scopes },
  };
}

/**
 * Verificér og kræv en specifik scope i én operation. Den primære
 * helper REST/MCP-routes bør bruge.
 */
export async function requireApiScope(
  req: Request,
  scope: Scope,
): Promise<{ actor: ApiKeyActor } | { error: ApiAuthError }> {
  const result = await authenticateApiKey(req);
  if ("error" in result) return result;

  if (!hasScope(result.actor.scopes, scope)) {
    return {
      error: {
        status: 403,
        body: {
          error: `API key missing required scope: ${scope}`,
        },
      },
    };
  }

  return { actor: result.actor };
}

/**
 * Helper til at konvertere en ApiAuthError til en Response. REST-routes
 * kalder `if ("error" in r) return apiErrorResponse(r.error);`.
 */
export function apiErrorResponse(error: ApiAuthError): Response {
  return Response.json(error.body, { status: error.status });
}

/**
 * Format-helper til audit-log. Returnerer "apikey:<id>" så vi entydigt
 * kan skelne fra "user:<id>" (Auth.js-session) og "storefront-chat:<sid>".
 */
export function actorToAuditString(actor: ApiKeyActor): string {
  return `apikey:${actor.apiKeyId}`;
}
