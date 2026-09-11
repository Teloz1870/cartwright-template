import "server-only";

import { z } from "zod";

import { runDriveBackup } from "@/lib/backup/google-drive";
import { importConfiguredDriveFolder } from "@/lib/media/google-drive-import";
import { defineTool } from "@/lib/tools/types";

const driveImportOutput = z.object({
  ok: z.boolean(),
  folderId: z.string().nullable(),
  scanned: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  assets: z.array(z.object({
    driveFileId: z.string(),
    assetId: z.string(),
    name: z.string(),
  }).strict()),
}).strict();

const driveBackupOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    file: z.object({ id: z.string(), name: z.string() }).strict(),
    folderId: z.string(),
    tableCount: z.number().int().nonnegative().optional(),
    bytes: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    folderId: z.string().nullable().optional(),
  }).strict(),
]);

export const driveImportFolderTool = defineTool({
  name: "drive.import_folder",
  description:
    "Import supported images from the configured Google Drive folder into the MediaAsset library via Vercel Blob. No-ops when googleDrive/mediaLibrary is off.",
  scope: "settings:write",
  input: z.object({
    folderId: z.string().trim().optional(),
    confirm: z.literal(true),
  }),
  output: driveImportOutput,
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
  output: driveBackupOutput,
  handler: async (args) => runDriveBackup(args.folderId ?? null),
  examples: [
    {
      name: "Back up to configured Drive folder",
      body: { confirm: true },
    },
  ],
});

export const driveTools = [driveImportFolderTool, driveBackupNowTool];
