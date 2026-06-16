import { OAuthError, registerPublicClient } from "@/lib/ucp/oauth";
import { ucpDisabledResponse, ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC 7591 — Dynamic Client Registration (public clients, PKCE, ingen secret).
 * En agentic-platform registrerer sine redirect_uris + ønskede scopes og får et
 * client_id retur. Gated bag ucpIdentityLinking.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const b = body as {
    client_name?: unknown;
    redirect_uris?: unknown;
    scope?: unknown;
  };
  const name = typeof b.client_name === "string" ? b.client_name : "";
  const redirectUris = Array.isArray(b.redirect_uris)
    ? b.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  // Udelades scope → undefined, så registerPublicClient anvender least-privilege
  // default (order:read) frem for at over-tildele order:manage.
  const scopes =
    typeof b.scope === "string" && b.scope.trim()
      ? b.scope.trim().split(/\s+/)
      : undefined;

  try {
    const reg = await registerPublicClient({ name, redirectUris, scopes });
    return Response.json(
      {
        client_id: reg.client_id,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        redirect_uris: reg.redirect_uris,
        scope: reg.scopes.join(" "),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json(
        { error: err.code, error_description: err.message },
        { status: err.status },
      );
    }
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Registration failed." },
      { status: 400 },
    );
  }
}
