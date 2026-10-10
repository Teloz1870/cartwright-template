/**
 * Re-export shim — the implementation moved to the reviews plugin
 * (plugins/reviews/lib/mailer-review-prompt.ts, cartwright-plugin-v1). Keeps
 * the historical import path (`@/lib/mailer/review-prompt`) working unchanged
 * for existing scaffolds.
 */
export { sendReviewPromptEmail } from "@/plugins/reviews/lib/mailer-review-prompt";
export type {
  ReviewPromptItem,
  ReviewPromptData,
} from "@/plugins/reviews/lib/mailer-review-prompt";
