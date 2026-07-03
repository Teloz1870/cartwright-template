import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { prisma } from "@/lib/db";
import {
  buildPackingSlip,
  type PackingSlipModel,
} from "@/lib/fulfillment/pick-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
});

/**
 * Standalone print-HTML — bevidst en route handler (ikke en page) så pakkesedlen
 * ikke arver admin-layoutets sidebar. Operatøren bruger browserens "Gem som PDF".
 * Auto-print on load. Ingen PDF-dependency på serverless.
 */
function renderPackingSlipHtml(m: PackingSlipModel): string {
  const accent = brand.emailColors.accent;
  const rows = m.lines
    .map(
      (l) => `
      <tr>
        <td>${esc(l.productName)}${l.variant ? `<br><span class="muted">${esc(l.variant)}</span>` : ""}</td>
        <td>${l.sku ? esc(l.sku) : "—"}</td>
        <td class="qty">${l.quantity}</td>
        <td class="pick"></td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <title>Pakkeseddel ${esc(m.shortId)} — ${esc(brand.storeName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accent}; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 900; color: ${accent}; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .muted { color: #777; font-size: 12px; }
    .grid { display: flex; gap: 48px; margin-bottom: 24px; }
    .grid h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #777; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; border-bottom: 2px solid #ddd; padding: 8px; font-size: 11px; text-transform: uppercase; color: #777; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.qty { text-align: center; font-weight: 700; }
    td.pick { width: 48px; }
    td.pick::after { content: "☐"; font-size: 18px; color: #bbb; }
    .total { margin-top: 16px; font-weight: 900; }
    .btn { margin-top: 24px; padding: 10px 18px; background: ${accent}; color: #fff; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; }
    @media print { .btn { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">${esc(brand.storeName)}</div>
      <div class="muted">Pakkeseddel / pluk-liste</div>
    </div>
    <div style="text-align:right;">
      <h1>Ordre ${esc(m.shortId)}</h1>
      <div class="muted">${esc(dateFormatter.format(new Date(m.createdAtIso)))}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <h2>Leveringsadresse</h2>
      <div>${esc(m.shipping.name)}<br>${esc(m.shipping.address)}<br>${esc(m.shipping.zip)} ${esc(m.shipping.city)}</div>
    </div>
    <div>
      <h2>Forsendelse</h2>
      <div>${m.carrier ? esc(m.carrier) : "—"}${m.trackingNumber ? `<br><span class="muted">${esc(m.trackingNumber)}</span>` : ""}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Vare</th><th>SKU</th><th style="text-align:center;">Antal</th><th>Pluk</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total">I alt: ${m.totalUnits} enhed(er)</div>

  <button class="btn" onclick="window.print()">Print / Gem som PDF</button>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const features = await getFeatures();
  if (!features.fulfillmentPdf) notFound();

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) notFound();

  const html = renderPackingSlipHtml(buildPackingSlip(order));
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
