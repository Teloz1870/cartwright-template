import "server-only";

import { z } from "zod";

import { runDriveBackup } from "@/lib/backup/google-drive";
import { importConfiguredDriveFolder } from "@/lib/media/google-drive-import";
import { defineTool } from "@/lib/tools/types";

export const driveImportFolderTool = defineTool({
  name: "drive.import_folder",
  description:
    "Import supported images from the configured Google Drive folder into the MediaAsset library via Vercel Blob. No-ops when googleDrive/mediaLibrary is off.",
  scope: "settings:write",
  input: z.object({
    folderId: z.string().trim().optional(),
    confirm: z.literal(true),
  }),
  handler: async (args) => importConfiguredDriveFolder(args.folderId ?? null),
  examples: [
    {
      name: "Import configured Drive folder",
      body: { confirm: true },
    },
  ],
});

export const driveBackupNowTool = defineTool({
  name: "drive.backup_now",
  description:
    "Run the existing logical database backup routine and upload the JSON artifact to Google Drive. No-ops when configuration is missing.",
  scope: "settings:write",
  input: z.object({
    folderId: z.string().trim().optional(),
    confirm: z.literal(true),
  }),
  handler: async (args) => runDriveBackup(args.folderId ?? null),
  examples: [
    {
      name: "Back up to configured Drive folder",
      body: { confirm: true },
    },
  ],
});

export const driveTools = [driveImportFolderTool, driveBackupNowTool];
