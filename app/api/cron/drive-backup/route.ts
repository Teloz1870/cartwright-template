/**
 * Route mount (cartwright-plugin-v1) — google-workspace plugin (logical DB
 * backup -> Google Drive cron). Handler implementation (incl. the CRON_SECRET
 * guard): plugins/google-workspace/api/drive-backup-cron.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export { GET } from "@/plugins/google-workspace/api/drive-backup-cron";
