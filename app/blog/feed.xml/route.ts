/**
 * Route mount (cartwright-plugin-v1) — blog plugin (RSS 2.0 feed).
 * Handler implementation: plugins/blog/api/feed.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export { GET } from "@/plugins/blog/api/feed";
