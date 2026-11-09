import "server-only";

import { OAuthError, validateAccessToken } from "@/lib/ucp/oauth";

/**
 * UCP identity-gate for ressource-operationer (Hul D). Validerer et Bearer
 * access-token + de krævede scopes og oversætter fejl til de UCP-foreskrevne
 * svar: `identity_required` (401) og `insufficient_scope` (403), begge med
 * WWW-Authenticate + en resource_metadata-pointer (RFC 9728).
 */

function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export type UcpIdentity = { userId: string; clientId: string; scope: string[] };

/**
 * Returnerer enten den autentificerede UCP-identitet eller et færdigt fejl-
 * Response (UCP-formet). Kald fra en UCP-commerce-route:
 *
 *   const id = await requireUcpIdentity(req, issuer, ["dev.ucp.shopping.order:read"]);
 *   if (!id.ok) return id.response;
 *   // brug id.userId
 */
export async function requireUcpIdentity(
  req: Request,
  issuer: string,
  requiredScopes: string[] = [],
): Promise<{ ok: true; identity: UcpIdentity } | { ok: false; response: Response }> {
  const token = extractBearer(req);
  const resourceMetadata = `${issuer}/.well-known/oauth-protected-resource`;

  if (!token) {
    return { ok: false, response: identityRequired(issuer, resourceMetadata) };
  }
  try {
    const identity = await validateAccessToken(token, requiredScopes);
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof OAuthError && err.code === "insufficient_scope") {
      return {
        ok: false,
        response: insufficientScope(requiredScopes, resourceMetadata),
      };
    }
    // invalid_token / alt andet → identity_required (401)
    return { ok: false, response: identityRequired(issuer, resourceMetadata) };
  }
}

function identityRequired(issuer: string, resourceMetadata: string): Response {
  return Response.json(
    { error: "identity_required", resource_metadata: resourceMetadata },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="${issuer}", resource_metadata="${resourceMetadata}"`,
      },
    },
  );
}

function insufficientScope(requiredScopes: string[], resourceMetadata: string): Response {
  const scope = requiredScopes.join(" ");
  return Response.json(
    { error: "insufficient_scope", scope, resource_metadata: resourceMetadata },
    {
      status: 403,
      headers: {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${resourceMetadata}"`,
      },
    },
  );
}
