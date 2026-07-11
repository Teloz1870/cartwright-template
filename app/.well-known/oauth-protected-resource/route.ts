import { buildProtectedResourceMetadata } from "@/lib/ucp/oauth";
import {
  issuerFromRequest,
  ucpDisabledResponse,
  ucpIdentityLinkingEnabled,
} from "@/lib/ucp/gate";

export const dynamic = "force-dynamic";

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
