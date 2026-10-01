/**
 * Re-export shim — the implementation moved to the reviews plugin
 * (plugins/reviews/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/lib/reviews`) working unchanged for existing scaffolds and the core PDP
 * (AggregateRating JSON-LD).
 */
export {
  AGGREGATE_RATING_THRESHOLD,
  getAggregateRating,
  listApprovedReviews,
} from "@/plugins/reviews/lib/reviews";
export type { AggregateRating } from "@/plugins/reviews/lib/reviews";
