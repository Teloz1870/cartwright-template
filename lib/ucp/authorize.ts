import "server-only";

import {
  getClient,
  OAuthError,
  parseScopeString,
  redirectUriAllowed,
  SUPPORTED_SCOPES,
  validateRequestedScopes,
} from "@/lib/ucp/oauth";

/**
 * Delt validering for /oauth/authorize — brugt af BÅDE consent-siden (render)
 * og decision-server-action'en (re-validér; hidden inputs er klient-styrede).
 *
 * Fejl-taksonomi (OAuth-BCP):
 *  - `no_redirect`: client_id/redirect_uri er ugyldig → vi MÅ IKKE redirecte
 *    (open-redirect-værn) → vis fejl-side.
 *  - `redirect`: redirect_uri er valideret, men en anden param fejler → redirect
 *    tilbage med error+state.
 */
export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
};

export type AuthorizeValidation =
  | {
      ok: true;
      clientId: string;
      clientName: string;
      redirectUri: string;
      scopes: string[];
      codeChallenge: string;
      state?: string;
    }
  | { ok: false; kind: "no_redirect"; error: string; description: string }
  | {
      ok: false;
      kind: "redirect";
      redirectUri: string;
      error: string;
      description: string;
      state?: string;
    };

export async function validateAuthorizeParams(
  p: AuthorizeParams,
): Promise<AuthorizeValidation> {
  if (!p.client_id) {
    return { ok: false, kind: "no_redirect", error: "invalid_request", description: "client_id is required." };
  }
  const client = await getClient(p.client_id);
  if (!client) {
    return { ok: false, kind: "no_redirect", error: "invalid_client", description: "Unknown client_id." };
  }
  if (!p.redirect_uri || !redirectUriAllowed(p.redirect_uri, client.redirectUris)) {
    return {
      ok: false,
      kind: "no_redirect",
      error: "invalid_request",
      description: "redirect_uri is missing or not registered for this client.",
    };
  }
  // redirect_uri er nu betroet → resterende fejl redirecter tilbage.
  const redirectUri = p.redirect_uri;
  const state = p.state;

  if (p.response_type !== "code") {
    return {
      ok: false,
      kind: "redirect",
      redirectUri,
      state,
      error: "unsupported_response_type",
      description: "Only response_type=code is supported.",
    };
  }
  if (p.code_challenge_method !== "S256") {
    return {
      ok: false,
      kind: "redirect",
      redirectUri,
      state,
      error: "invalid_request",
      description: "code_challenge_method must be S256.",
    };
  }
  if (!p.code_challenge) {
    return {
      ok: false,
      kind: "redirect",
      redirectUri,
      state,
      error: "invalid_request",
      description: "code_challenge (PKCE) is required.",
    };
  }

  const requested =
    p.scope && p.scope.trim() ? parseScopeString(p.scope) : [...SUPPORTED_SCOPES];
  let scopes: string[];
  try {
    scopes = validateRequestedScopes(requested, client.scopes);
  } catch (err) {
    const oe = err as OAuthError;
    return {
      ok: false,
      kind: "redirect",
      redirectUri,
      state,
      error: oe.code ?? "invalid_scope",
      description: oe.message ?? "Invalid scope.",
    };
  }

  return {
    ok: true,
    clientId: client.id,
    clientName: client.name,
    redirectUri,
    scopes,
    codeChallenge: p.code_challenge,
    state,
  };
}

/** Byg en redirect-URL tilbage til klienten med query-params (eksisterende query bevares). */
export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}
