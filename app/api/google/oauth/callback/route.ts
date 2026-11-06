/**
 * Route mount (cartwright-plugin-v1) — google-workspace plugin (OAuth code
 * exchange callback). Handler implementation (incl. the admin-session guard +
 * PKCE state validation): plugins/google-workspace/api/oauth-callback.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET } from "@/plugins/google-workspace/api/oauth-callback";
