import { buildAuthorizationServerMetadata } from "@/lib/ucp/oauth";
import {
  issuerFromRequest,
  ucpDisabledResponse,
  ucpIdentityLinkingEnabled,
} from "@/lib/ucp/gate";
import { allowResponse } from "@/lib/http/allow";

export const dynamic = "force-dynamic";

/** `GET` is the only exported verb; `HEAD` is Next's, filled in from it. */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata for UCP identity-linking.
 * Gated bag brand.features.ucpIdentityLinking (404 når off). issuer udledes af
 * request'en så den matcher discovery-base byte-for-byte.
 */
export async function GET(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  const issuer = issuerFromRequest(req);
  return Response.json(buildAuthorizationServerMetadata(issuer), {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}

/**
 * Same gate as `GET`: a shop that does not link identities must answer this
 * verb the way an absent path does, not advertise the resource's method list.
 */
export async function OPTIONS(): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  return allowResponse(ALLOWED_METHODS);
}
