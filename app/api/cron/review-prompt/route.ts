/**
 * Route mount (cartwright-plugin-v1) — reviews plugin (daily review-prompt
 * cron). Handler implementation: plugins/reviews/api/review-prompt-cron.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export { GET } from "@/plugins/reviews/api/review-prompt-cron";
