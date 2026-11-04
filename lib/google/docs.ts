/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/docs`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  googleDocToMarkdown,
  extractGoogleDocId,
  fetchGoogleDoc,
} from "@/plugins/google-workspace/lib/google/docs";
export type {
  GoogleDocsDocument,
  FetchGoogleDocResult,
} from "@/plugins/google-workspace/lib/google/docs";
