import {
  getClient,
  issueTokenPair,
  OAuthError,
  redeemAuthCode,
  refreshTokenGrant,
} from "@/lib/ucp/oauth";
import { ucpDisabledResponse, ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Token Endpoint (UCP identity-linking). Public clients (PKCE), så
 * ingen client-auth — client_id i body + PKCE er proof-of-possession. Grants:
 * authorization_code + refresh_token. Gated bag ucpIdentityLinking.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return tokenError("invalid_request", "Body must be application/x-www-form-urlencoded.", 400);
  }
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };

  const grantType = get("grant_type");
  const clientId = get("client_id");
  if (!clientId) return tokenError("invalid_client", "client_id is required.", 401);

  const client = await getClient(clientId);
  if (!client) return tokenError("invalid_client", "Unknown client.", 401);

  try {
    if (grantType === "authorization_code") {
      const code = get("code");
      const redirectUri = get("redirect_uri");
      const codeVerifier = get("code_verifier");
      if (!code || !redirectUri || !codeVerifier) {
        return tokenError(
          "invalid_request",
          "code, redirect_uri and code_verifier are required.",
          400,
        );
      }
      const { userId, scope } = await redeemAuthCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
      });
      const pair = await issueTokenPair({ clientId, userId, scope });
      return tokenOk(pair);
    }

    if (grantType === "refresh_token") {
      const refreshToken = get("refresh_token");
      if (!refreshToken) {
        return tokenError("invalid_request", "refresh_token is required.", 400);
      }
      const scopeParam = get("scope");
      const requestedScope = scopeParam ? scopeParam.trim().split(/\s+/) : undefined;
      const pair = await refreshTokenGrant({ refreshToken, clientId, requestedScope });
      return tokenOk(pair);
    }

    return tokenError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`, 400);
  } catch (err) {
    if (err instanceof OAuthError) return tokenError(err.code, err.message, err.status);
    return tokenError("invalid_request", "Token request failed.", 400);
  }
}

function tokenOk(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

function tokenError(error: string, description: string, status: number): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
