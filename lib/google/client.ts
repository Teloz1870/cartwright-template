/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/client`) working unchanged for existing scaffolds
 * and tests.
 */
export { authorizedGoogleFetch } from "@/plugins/google-workspace/lib/google/client";
export type {
  GoogleFetchErrorCode,
  GoogleFetchResult,
} from "@/plugins/google-workspace/lib/google/client";
