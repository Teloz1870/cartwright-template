/**
 * Re-export shim — the implementation moved to the reviews plugin
 * (plugins/reviews/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/components/ReviewList`) working unchanged for existing scaffolds and the
 * core PDP mount.
 */
export { default } from "@/plugins/reviews/components/ReviewList";
