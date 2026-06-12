import { buildAuthorizationServerMetadata } from "@/lib/ucp/oauth";
import {
  issuerFromRequest,
  ucpDisabledResponse,
  ucpIdentityLinkingEnabled,
} from "@/lib/ucp/gate";

export const dynamic = "force-dynamic";

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
