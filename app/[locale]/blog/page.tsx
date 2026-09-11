/**
 * Route mount (cartwright-plugin-v1) — blog plugin. The page implementation
 * lives in the plugin's self-contained module; this file only fixes the URL
 * (`/blog`). Segment config stays literal here for Next's static analysis.
 */
export const dynamic = "force-dynamic";

export { default, generateMetadata } from "@/plugins/blog/pages/BlogIndexPage";
