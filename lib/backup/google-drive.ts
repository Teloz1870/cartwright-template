import "server-only";

import {
  backupFilename,
  dumpDatabase,
  serializeBackup,
} from "@/lib/backup/dump";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { uploadDriveFile } from "@/lib/google/drive";

export type DriveBackupResult =
  | {
      ok: true;
      file: { id: string; name: string };
      folderId: string;
      tableCount?: number;
      bytes?: number;
    }
  | { ok: false; error: string; folderId?: string | null };

export async function getConfiguredDriveBackupFolderId(): Promise<string | null> {
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { driveBackupFolderId: true, driveFolderId: true },
    });
    return (
      row?.driveBackupFolderId?.trim() ||
      row?.driveFolderId?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

export async function uploadBackupJsonToDrive(
  json: string,
  filename: string,
  folderIdOverride?: string | null,
): Promise<DriveBackupResult> {
  const folderId =
    folderIdOverride?.trim() || (await getConfiguredDriveBackupFolderId());
  if (!folderId) {
    return {
      ok: false,
      error: "Google Drive backup folder is not configured.",
      folderId,
    };
  }

  const uploaded = await uploadDriveFile({
    name: filename,
    mime: "application/json",
    bytes: json,
    folderId,
  });
  if (!uploaded.ok) return { ok: false, error: uploaded.error, folderId };

  return { ok: true, file: uploaded.file, folderId };
}

export async function runDriveBackup(
  folderIdOverride?: string | null,
): Promise<DriveBackupResult> {
  try {
    const brand = await getBrand();
    if (!(brand.features as { googleDrive?: boolean }).googleDrive) {
      return { ok: false, error: "googleDrive-feature-disabled" };
    }

    const payload = await dumpDatabase();
    const json = serializeBackup(payload);
    const filename = backupFilename(payload.createdAt);
    const uploaded = await uploadBackupJsonToDrive(json, filename, folderIdOverride);
    if (!uploaded.ok) return uploaded;
    return {
      ...uploaded,
      tableCount: payload.tableCount,
      bytes: json.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Google Drive backup failed.",
    };
  }
}
