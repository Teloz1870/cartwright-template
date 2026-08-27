import "server-only";

import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { getResendApiKey, shouldUseResend } from "@/lib/mailer/resend";

/**
 * Dropshipping / fulfillment (Track G). Router en ordres varer til deres
 * leverandører (Product.supplierId): én FulfillmentOrder pr. leverandør med en
 * snapshot af linjerne. mode "email" → send en pakkeseddel til leverandøren med
 * et bekræft-link; "manual" → bare registrér (admin håndterer). Idempotent.
 */

type FulfillmentItem = { productName: string; quantity: number };

export async function createFulfillmentOrders(
  orderId: string,
  actor: AuditActor,
): Promise<{ created: number }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              supplierId: true,
              supplier: { select: { id: true, name: true, email: true, mode: true } },
            },
          },
        },
      },
    },
  });
  if (!order) return { created: 0 };

  const bySupplier = new Map<
    string,
    { supplier: { name: string; email: string | null; mode: string }; items: FulfillmentItem[] }
  >();
  for (const it of order.items) {
    const sup = it.product?.supplier;
    if (!sup) continue;
    if (!bySupplier.has(sup.id)) bySupplier.set(sup.id, { supplier: sup, items: [] });
    bySupplier.get(sup.id)!.items.push({ productName: it.productName, quantity: it.quantity });
  }

  let created = 0;
  await withAudit(
    { actor, tool: "fulfillment.create", args: { orderId } },
    async () => {
      for (const [supplierId, { supplier, items }] of bySupplier) {
        const existing = await prisma.fulfillmentOrder.findFirst({ where: { orderId, supplierId } });
        if (existing) continue; // idempotent

        const token = randomUUID();
        let status = "created";
        if (supplier.mode === "email" && supplier.email) {
          const sent = await sendSupplierPackingSlip(supplier.email, supplier.name, order, items, token).catch(
            (e) => {
              console.error("[fulfillment] supplier mail failed:", e);
              return false;
            },
          );
          if (sent) status = "sent";
        }
        await prisma.fulfillmentOrder.create({
          data: { orderId, supplierId, token, status, lineJson: JSON.stringify(items) },
        });
        created++;
      }
    },
  );

  return { created };
}

export async function markFulfillmentShipped(token: string): Promise<{ ok: boolean }> {
  const fo = await prisma.fulfillmentOrder.findUnique({ where: { token } });
  if (!fo) return { ok: false };
  await prisma.fulfillmentOrder.update({ where: { token }, data: { status: "shipped" } });
  return { ok: true };
}

async function sendSupplierPackingSlip(
  to: string,
  supplierName: string,
  order: { id: string; shippingName: string; shippingAddress: string; shippingZip: string; shippingCity: string },
  items: FulfillmentItem[],
  token: string,
): Promise<boolean> {
  const confirmUrl = `${brand.url}/api/fulfillment/confirm?token=${encodeURIComponent(token)}`;
  const lines = items.map((i) => `${i.productName} ×${i.quantity}`).join("\n");
  const subject = `Ny ordre til pakning — ${order.id.slice(0, 8)}`;
  const text = `Hej ${supplierName},

Ny ordre til pakning og forsendelse:

${lines}

Leveringsadresse:
${order.shippingName}
${order.shippingAddress}
${order.shippingZip} ${order.shippingCity}

Markér som afsendt: ${confirmUrl}

— ${brand.storeName}`;
  const html = `<p>Hej ${supplierName},</p><p>Ny ordre til pakning:</p><pre>${lines}</pre>
<p><strong>Leveringsadresse:</strong><br>${order.shippingName}<br>${order.shippingAddress}<br>${order.shippingZip} ${order.shippingCity}</p>
<p><a href="${confirmUrl}">Markér som afsendt</a></p><p>— ${brand.storeName}</p>`;

  if (await shouldUseResend()) {
    const key = await getResendApiKey();
    if (key) {
      const client = new Resend(key);
      const result = await client.emails.send({
        from: `${brand.emails.fromName} <${brand.emails.from}>`,
        to,
        subject,
        html,
        text,
      });
      if (result.error) throw new Error(result.error.message);
      return true;
    }
  }
  return false;
}
