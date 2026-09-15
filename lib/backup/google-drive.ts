/**
 * Re-export shim — the implementation moved to the google-workspace plugin
 * (plugins/google-workspace/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/backup/google-drive`) working unchanged for existing
 * scaffolds and tests.
 */
export {
  getConfiguredDriveBackupFolderId,
  uploadBackupJsonToDrive,
  runDriveBackup,
} from "@/plugins/google-workspace/lib/drive-backup";
export type { DriveBackupResult } from "@/plugins/google-workspace/lib/drive-backup";
