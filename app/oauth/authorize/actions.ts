"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAuthCode } from "@/lib/ucp/oauth";
import { buildRedirect, validateAuthorizeParams } from "@/lib/ucp/authorize";
import { canonicalIssuer, ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";

/**
 * Consent-beslutning for /oauth/authorize. RE-VALIDERER alt (hidden inputs er
 * klient-styrede) + RE-TJEKKER session (koden bindes til den indloggede bruger).
 * Approve → udsteder authorization code + redirect med iss (RFC 9207).
 * Deny → redirect med error=access_denied.
 */
export async function decideAuthorization(formData: FormData): Promise<void> {
  if (!(await ucpIdentityLinkingEnabled())) redirect("/");

  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };

  const params = {
    response_type: str("response_type"),
    client_id: str("client_id"),
    redirect_uri: str("redirect_uri"),
    scope: str("scope"),
    code_challenge: str("code_challenge"),
    code_challenge_method: str("code_challenge_method"),
    state: str("state"),
  };
  const decision = str("decision");

  const session = await auth();
  const userId = session?.user?.id;

  // iss (RFC 9207) = kanonisk origin (AUTH_URL/brand.url), IKKE request-headers
  // (host-header-injection-værn — samme som issuerFromRequest). Dev-fallback:
  // request-host.
  let issuer = canonicalIssuer() ?? "";
  if (!issuer) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    issuer = host ? `${proto}://${host}` : "";
  }

  const v = await validateAuthorizeParams(params);
  if (!v.ok) {
    // no_redirect: kan ikke sikkert redirecte tilbage → hjem. redirect: tilbage med error.
    if (v.kind === "redirect") {
      redirect(buildRedirect(v.redirectUri, { error: v.error, state: v.state, iss: issuer }));
    }
    redirect("/");
  }

  // Skulle være håndteret af siden, men re-tjek: ingen bruger → kan ikke samtykke.
  if (!userId) {
    redirect(
      buildRedirect(v.redirectUri, { error: "access_denied", state: v.state, iss: issuer }),
    );
  }

  if (decision !== "approve") {
    redirect(
      buildRedirect(v.redirectUri, { error: "access_denied", state: v.state, iss: issuer }),
    );
  }

  let code: string;
  try {
    code = await createAuthCode({
      clientId: v.clientId,
      userId: userId!,
      redirectUri: v.redirectUri,
      scope: v.scopes,
      codeChallenge: v.codeChallenge,
    });
  } catch {
    redirect(
      buildRedirect(v.redirectUri, { error: "server_error", state: v.state, iss: issuer }),
    );
  }

  redirect(buildRedirect(v.redirectUri, { code: code!, state: v.state, iss: issuer }));
}
