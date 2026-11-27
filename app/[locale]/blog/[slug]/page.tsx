/**
 * Route mount (cartwright-plugin-v1) — blog plugin. The page implementation
 * (incl. BlogPosting + BreadcrumbList JSON-LD) lives in the plugin's
 * self-contained module; this file only fixes the URL (`/blog/[slug]`).
 * Segment config stays literal here for Next's static analysis.
 */
export const dynamic = "force-dynamic";

export { default, generateMetadata } from "@/plugins/blog/pages/BlogPostPage";
