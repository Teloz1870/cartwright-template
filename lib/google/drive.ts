/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/google/drive`) working unchanged for existing scaffolds
 * and tests.
 */
export {
  listDriveFilesInFolder,
  downloadDriveFileBytes,
  uploadDriveFile,
} from "@/plugins/google-workspace/lib/google/drive";
export type { DriveFile, DriveResult } from "@/plugins/google-workspace/lib/google/drive";
