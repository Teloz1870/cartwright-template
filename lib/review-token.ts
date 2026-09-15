/**
 * Re-export shim — the implementation moved to the reviews plugin
 * (plugins/reviews/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/lib/review-token`) working unchanged for existing scaffolds.
 */
export { signReviewToken, verifyReviewToken } from "@/plugins/reviews/lib/review-token";
