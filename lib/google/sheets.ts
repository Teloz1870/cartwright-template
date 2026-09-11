/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/sheets`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  SHEETS_PRODUCT_TAB,
  SHEETS_PRODUCT_HEADERS,
  SHEETS_PRODUCT_RANGE,
  slugifySheetValue,
  sheetRowToProductDraft,
  productToSheetRow,
  readSheetRange,
  writeSheetRows,
  clearSheetRange,
  updateSheetRows,
} from "@/plugins/google-workspace/lib/google/sheets";
export type {
  SheetsProductHeader,
  SheetsApiErrorCode,
  SheetsResult,
  SheetProductDraft,
  ProductForSheetRow,
} from "@/plugins/google-workspace/lib/google/sheets";
