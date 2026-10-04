/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/oauth`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  createGoogleOAuthPkce,
  getGoogleOAuthCredentials,
  invalidateGoogleOAuthCredentialsCache,
  buildGoogleOAuthConsentUrl,
  exchangeGoogleOAuthCode,
  refreshGoogleConnectionAccessToken,
  revokeGoogleConnection,
  getGoogleConnectionStatus,
} from "@/plugins/google-workspace/lib/google/oauth";
export type {
  GoogleOAuthCredentials,
  GoogleConnectionStatus,
  GoogleOAuthInertResult,
} from "@/plugins/google-workspace/lib/google/oauth";
