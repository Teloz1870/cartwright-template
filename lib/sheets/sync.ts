/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/sheets/sync`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  getSheetsSyncSettings,
  saveSheetsSpreadsheetId,
  pullProductsFromSheet,
  pushProductsToSheet,
  syncProductsWithSheet,
} from "@/plugins/google-workspace/lib/sheets-sync";
export type {
  SheetsSyncMode,
  SheetsSyncResult,
  SheetsSyncCounts,
} from "@/plugins/google-workspace/lib/sheets-sync";
