import { brand } from "@/brand.config";
import { problemResponse } from "@/lib/api-problem";

export const dynamic = "force-dynamic";

/**
 * RETIRED (owner decision B84, 2026-10) — every verb answers `410 Gone`.
 *
 * This route created a Stripe Checkout Session for one product and nothing
 * else: no order, no `orderId` in the session metadata. The Stripe webhook
 * skips a session without one, so the buyer paid, the shop recorded no order
 * and the success page was a 404. It was public, unflagged, and advertised as
 * `checkoutEndpoint` on every `/api/products/search` row.
 *
 * Agent checkout is ACP (`/api/acp/v1/checkout_sessions`): its completion
 * (`lib/acp/complete.ts`) creates the order in the same step as the charge
 * and refunds the payment if that fails. The answer names it only where that
 * checkout can take the payment (`acpCheckoutTakesPayment` below); elsewhere
 * it names the product page — on a shop with ACP off `llms.txt` tells agents
 * not to call `/api/acp/*`, and this must not contradict it.
 *
 * No Stripe, database or brand-row call happens here. `OPTIONS` stays the
 * framework's 204 + `Allow`. The file is deleted in the next release; the
 * `/api` catch-all then answers this path with a 404.
 */
const ACP_CHECKOUT_PATH = "/api/acp/v1/checkout_sessions";

/**
 * Both ACP switches, because either alone leaves the buyer unable to pay:
 * `brand.acp.enabled` mounts `/api/acp/v1/*` (the gate `lib/acp/http.ts`
 * reads), and env `ACP_PAYMENT_COMPLETION=1` runs the payment step — without
 * it `/complete` answers 501 (`isAcpCompletionEnabled` in
 * `lib/acp/complete.ts`). The env is read here, not imported: this route
 * belongs to the webshop module and `lib/acp` to the acp module, which the
 * commerce profile leaves out. `agent-checkout-retired.test.ts` holds the two
 * reads to the same answer.
 */
function acpCheckoutTakesPayment(): boolean {
  return brand.acp.enabled && process.env.ACP_PAYMENT_COMPLETION === "1";
}

function gone(request: Request): Response {
  const acp = acpCheckoutTakesPayment();
  return problemResponse({
    status: 410,
    title: "Gone",
    detail:
      "This agent checkout endpoint is retired: it took a card payment without creating an order.",
    instance: new URL(request.url).pathname,
    code: "agent_checkout_retired",
    resolution: acp
      ? `Use the Agentic Commerce Protocol checkout: POST ${ACP_CHECKOUT_PATH} to create a session, then POST ${ACP_CHECKOUT_PATH}/{id}/complete. It creates the order with the payment and refunds the payment if the order fails.`
      : "This shop offers no agent checkout. Send the buyer to the product's url from /api/products/search to buy through the shop's own checkout.",
    ...(acp ? { headers: { Link: `<${ACP_CHECKOUT_PATH}>; rel="successor-version"` } } : {}),
  });
}

export const GET = gone;
export const HEAD = gone;
export const POST = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
