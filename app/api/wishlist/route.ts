/**
 * Route mount (cartwright-plugin-v1) — wishlist plugin.
 * Handler implementation: plugins/wishlist/api/list.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET } from "@/plugins/wishlist/api/list";
