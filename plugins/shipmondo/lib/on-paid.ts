import "server-only";

import { getFeatures } from "@/lib/brand";
import { readShipmondoConfig } from "./config";
import { sendOrderToShipmondo } from "./send-order";

const ACTOR = "system:shipmondo-on-paid" as const;

/**
 * The shipmondo plugin's side of the paid-order seam (lib/orders/paid-hooks.ts):
 * an order that has just been paid goes to Shipmondo at once. Runs after the
 * response; quiet unless the flag is on and an account is connected.
 *
 * A refusal is written on the order by the send itself (one line per order,
 * ./send-order.ts recordFailure), and the sweep (/api/cron/shipmondo-orders)
 * tries again later.
 */
export async function sendPaidOrderToShipmondo(orderId: string): Promise<void> {
  if (!(await getFeatures()).shipmondo) return;
  const config = readShipmondoConfig();
  if (!config) return;
  await sendOrderToShipmondo(orderId, ACTOR, { config });
}
