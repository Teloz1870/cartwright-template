/**
 * Re-export shim — the sheets admin server actions moved to the
 * google-workspace plugin (plugins/google-workspace/admin/sheets/actions.ts,
 * cartwright-plugin-v1). Keeps the historical import path working unchanged
 * for existing scaffolds.
 */
export {
  saveSheetsSettingsAction,
  runSheetsSyncAction,
} from "@/plugins/google-workspace/admin/sheets/actions";
