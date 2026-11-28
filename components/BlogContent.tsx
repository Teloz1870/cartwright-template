/**
 * Re-export shim — the implementation moved to the blog plugin
 * (plugins/blog/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/components/BlogContent`) working unchanged for existing scaffolds and
 * tests.
 */
export { default } from "@/plugins/blog/components/BlogContent";
