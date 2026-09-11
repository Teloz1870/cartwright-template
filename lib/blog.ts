/**
 * Re-export shim — the implementation moved to the blog plugin
 * (plugins/blog/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/lib/blog`) working unchanged for existing scaffolds and tests.
 */
export { listPublishedPosts, getPublishedPost } from "@/plugins/blog/lib/blog";
export type { PostSummary, PostView } from "@/plugins/blog/lib/blog";
