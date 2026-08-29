/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/media/google-drive-import`) working unchanged for
 * existing scaffolds and tests.
 */
export {
  getConfiguredDriveImportFolderId,
  importConfiguredDriveFolder,
  importDriveImageFile,
} from "@/plugins/google-workspace/lib/drive-import";
export type { DriveImportResult } from "@/plugins/google-workspace/lib/drive-import";
