import "server-only";

import { after } from "next/server";
import { sendPaidOrderToShipmondo } from "@/plugins/shipmondo/lib/on-paid";

/**
 * B3 seam — work that follows an order becoming paid but belongs to an
 * optional module. Declared by the webshop module, provided by the shipmondo
 * plugin (modules/registry.ts); a materialization without the plugin copies
 * paid-hooks.static.ts over this file, so lib/orders/on-paid.ts compiles and
 * calls a no-op.
 *
 * Off the payment path by construction: the work runs after the response
 * (`after()`), so a slow or failing Shipmondo can neither delay the Stripe
 * webhook's answer nor fail the payment, and every error is logged, never
 * thrown. Outside a request scope (unit tests, scripts) `after()` throws and a
 * loose promise runs instead — the recipe of lib/auth/password-reset.ts.
 */
export function schedulePaidOrderHooks(orderId: string): void {
  const run = () =>
    sendPaidOrderToShipmondo(orderId).catch((err) => {
      console.error("[paid-hooks] shipmondo:", err);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
