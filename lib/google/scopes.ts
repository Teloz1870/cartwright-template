/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/scopes`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  GOOGLE_SHEETS_SCOPES,
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_DOCS_SCOPES,
  composeGoogleScopes,
} from "@/plugins/google-workspace/lib/google/scopes";
export type { GoogleScopeModule } from "@/plugins/google-workspace/lib/google/scopes";
