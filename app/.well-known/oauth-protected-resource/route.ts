import { buildProtectedResourceMetadata } from "@/lib/ucp/oauth";
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
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata. UCP identity_required /
 * insufficient_scope-fejl peger hertil. Gated bag ucpIdentityLinking.
 */
export async function GET(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  const issuer = issuerFromRequest(req);
  return Response.json(buildProtectedResourceMetadata(issuer), {
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
