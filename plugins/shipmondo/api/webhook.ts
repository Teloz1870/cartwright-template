import "server-only";

import { after, NextResponse, type NextRequest } from "next/server";
import { getFeatures } from "@/lib/brand";
import { applyShipment } from "../lib/apply-shipment";
import { readShipmondoConfig } from "../lib/config";
import { parseShipmentWebhook } from "../lib/webhook";

/**
 * POST /api/shipmondo/webhook — Shipmondo's "Shipments: create" webhook
 * (registered from /admin/shipmondo).
 *
 * Shipmondo wants a 200 within 3 seconds and documents no retries: a delivery
 * answered late, or with an error, is simply lost. So the route only checks
 * the signature (SHIPMONDO_WEBHOOK_KEY, HS256; nothing unsigned goes further)
 * and answers at once; the shipment is applied after the response
 * (../lib/apply-shipment.ts checks it against Shipmondo before it touches an
 * order). One that fails or arrives too early is not lost for good: the sweep
 * (/api/cron/shipmondo-orders) asks Shipmondo for the shipments of every sent
 * order still awaiting one (../lib/reconcile.ts).
 */
const MAX_BODY = 256 * 1024;

export async function POST(request: NextRequest) {
  if (!(await getFeatures()).shipmondo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const parsed = parseShipmentWebhook(raw, process.env.SHIPMONDO_WEBHOOK_KEY?.trim() || null);
  if (!parsed.ok) {
    return NextResponse.json({ ok: parsed.status === 200, ignored: parsed.reason }, { status: parsed.status });
  }
  const config = readShipmondoConfig();
  // Nothing to check the shipment with yet; the sweep picks it up once an account is connected.
  if (!config) return NextResponse.json({ ok: true, ignored: "shipmondo-not-configured" });

  const event = parsed.event;
  const run = () =>
    applyShipment(event, { config }).catch((err) => {
      console.error("[shipmondo webhook] could not apply the shipment (the sweep retries):", err);
    });
  try {
    after(run);
  } catch {
    void run();
  }
  return NextResponse.json({ ok: true, accepted: event.shipmentId });
}
