/**
 * Route mount (cartwright-plugin-v1) — shipmondo plugin webhook (a shipment
 * booked in Shipmondo brings its tracking back to the order). Handler:
 * plugins/shipmondo/api/webhook.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "@/plugins/shipmondo/api/webhook";
