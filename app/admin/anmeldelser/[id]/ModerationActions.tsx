/**
 * Re-export shim — the moderation UI moved to the reviews plugin
 * (plugins/reviews/admin/ModerationActions.tsx, cartwright-plugin-v1). Keeps
 * the historical import path working unchanged for existing scaffolds.
 */
export { default } from "@/plugins/reviews/admin/ModerationActions";
