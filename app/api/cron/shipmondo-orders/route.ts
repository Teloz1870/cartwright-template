/**
 * Route mount (cartwright-plugin-v1) — shipmondo plugin (sends paid orders
 * that have not reached Shipmondo). Handler, incl. the CRON_SECRET guard:
 * plugins/shipmondo/api/send-orders-cron.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export { GET } from "@/plugins/shipmondo/api/send-orders-cron";
