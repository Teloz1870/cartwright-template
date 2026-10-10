/**
 * Route mount (cartwright-plugin-v1) — google-workspace plugin (OAuth consent
 * initiate). Handler implementation (incl. the admin-session guard):
 * plugins/google-workspace/api/oauth-initiate.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET } from "@/plugins/google-workspace/api/oauth-initiate";
