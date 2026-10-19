import { prisma } from "@/lib/db";
import { requireUcpIdentity } from "@/lib/ucp/identity";
import {
  issuerFromRequest,
  ucpDisabledResponse,
  ucpIdentityLinkingEnabled,
} from "@/lib/ucp/gate";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET` is the only exported verb; `HEAD` is Next's, filled in from it. */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

/**
 * GET /api/ucp/orders — protected UCP resource. Returnerer den identitets-
 * linkede brugers ordre-historik. Kræver et UCP-access-token med scope
 * `dev.ucp.shopping.order:read` (Authorization: Bearer …). Demonstrerer +
 * håndhæver identity-linking-loopet (lib/ucp/identity.ts). Gated bag
 * ucpIdentityLinking.
 */
export async function GET(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();

  const issuer = issuerFromRequest(req);
  const auth = await requireUcpIdentity(req, issuer, ["dev.ucp.shopping.order:read"]);
  if (!auth.ok) return auth.response;

  const orders = await prisma.order.findMany({
    where: { userId: auth.identity.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      totalDkk: true,
      currency: true,
      createdAt: true,
      channel: true,
    },
  });

  return Response.json(
    { orders },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The EXISTENCE half of `GET`'s gate, and only that half: a shop that does not
 * link identities must answer this verb the way an absent path does, rather
 * than let the framework's substitute advertise the endpoint's method list.
 *
 * `GET` additionally runs `requireUcpIdentity()`; this does not, deliberately.
 * The method list belongs to the resource, not to a caller's token, and a
 * client that must send a bearer token to learn which verbs exist cannot use
 * the answer to discover anything the flag has not already published. So with
 * the flag on and no `Authorization` header, `GET` is 401 while `OPTIONS` is
 * 204 — the intended asymmetry, not a missed check.
 */
export async function OPTIONS(): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  return allowResponse(ALLOWED_METHODS);
}
