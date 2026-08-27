/**
 * Route mount (cartwright-plugin-v1) — google-workspace plugin (Sheets catalog
 * sync cron). Handler implementation (incl. the CRON_SECRET guard):
 * plugins/google-workspace/api/sheets-sync-cron.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export { GET } from "@/plugins/google-workspace/api/sheets-sync-cron";
