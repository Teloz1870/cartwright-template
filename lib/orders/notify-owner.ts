import "server-only";

import { getBrand } from "@/lib/brand";
import { sendOwnerNewOrderEmail, type OrderEmailData } from "@/lib/mailer";

/**
 * GAP1 — the owner gets an e-mail when an order is paid.
 *
 * Called once at each place an order BECOMES paid: the Stripe webhook, the
 * reconcile cron, mock-mode checkout and the ACP complete path. Each of those
 * already runs at most once per order (the webhook and the cron early-return
 * on an order that is already paid; mock and ACP create the order paid), so
 * this function holds no state of its own.
 *
 * Runtime flag `ownerOrderEmail`, default off ⇒ nothing is sent and nothing
 * changes. It never throws: a failed owner mail must never fail a payment.
 */
export async function notifyOwnerOfPaidOrder(data: OrderEmailData): Promise<void> {
  try {
    const brand = await getBrand();
    if (!brand.features.ownerOrderEmail) return;
    const to = brand.emails.admin?.trim();
    if (!to) return;
    await sendOwnerNewOrderEmail({
      ...data,
      to,
      adminUrl: adminOrderUrl(brand.url, data.orderId),
    });
  } catch (err) {
    console.error(`[owner-order-email] could not notify the owner of ${data.orderId}:`, err);
  }
}

function adminOrderUrl(siteUrl: string | undefined, orderId: string): string | null {
  if (!siteUrl) return null;
  try {
    const origin = new URL(siteUrl);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
    return new URL(`/admin/ordrer/${encodeURIComponent(orderId)}`, origin.origin).toString();
  } catch {
    return null;
  }
}
