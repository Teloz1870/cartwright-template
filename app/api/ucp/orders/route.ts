import { prisma } from "@/lib/db";
import { requireUcpIdentity } from "@/lib/ucp/identity";
import {
  issuerFromRequest,
  ucpDisabledResponse,
  ucpIdentityLinkingEnabled,
} from "@/lib/ucp/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
