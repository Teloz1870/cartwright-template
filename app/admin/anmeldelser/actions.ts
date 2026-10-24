/**
 * Re-export shim — the moderation server actions moved to the reviews plugin
 * (plugins/reviews/admin/actions.ts, cartwright-plugin-v1). Keeps the
 * historical import path working unchanged for existing scaffolds.
 */
export {
  approveReviewAction,
  rejectReviewAction,
  spamReviewAction,
} from "@/plugins/reviews/admin/actions";
