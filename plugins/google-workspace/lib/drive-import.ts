import "server-only";

import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import {
  downloadDriveFileBytes,
  listDriveFilesInFolder,
  type DriveFile,
} from "@/plugins/google-workspace/lib/google/drive";
import { computeSha256, findOrCreateBySha256 } from "@/lib/media/asset";
import {
  hasValidMagicBytes,
  MAGIC_BYTES_HEADER_BYTES,
} from "@/lib/upload/magic-bytes";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_FILES_PER_IMPORT = 50;

export type DriveImportResult = {
  ok: boolean;
  folderId: string | null;
  scanned: number;
  imported: number;
  skipped: number;
  errors: string[];
  assets: Array<{ driveFileId: string; assetId: string; name: string }>;
};

export async function getConfiguredDriveImportFolderId(): Promise<string | null> {
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { driveFolderId: true },
    });
    return row?.driveFolderId?.trim() || null;
  } catch {
    return null;
  }
}

export async function importConfiguredDriveFolder(
  folderIdOverride?: string | null,
): Promise<DriveImportResult> {
  const brand = await getBrand();
  if (!(brand.features as { googleDrive?: boolean }).googleDrive) {
    return emptyImportResult(null, "googleDrive-feature-disabled");
  }
  if (!(brand.features as { mediaLibrary?: boolean }).mediaLibrary) {
    return emptyImportResult(null, "mediaLibrary-feature-disabled");
  }

  const folderId =
    folderIdOverride?.trim() || (await getConfiguredDriveImportFolderId());
  if (!folderId) return emptyImportResult(null, "drive-folder-not-configured");

  const listed = await listDriveFilesInFolder(folderId, {
    pageSize: MAX_FILES_PER_IMPORT,
  });
  if (!listed.ok) return emptyImportResult(folderId, listed.error);

  const result: DriveImportResult = {
    ok: true,
    folderId,
    scanned: listed.files.length,
    imported: 0,
    skipped: 0,
    errors: [],
    assets: [],
  };

  for (const file of listed.files.slice(0, MAX_FILES_PER_IMPORT)) {
    const imported = await importDriveImageFile(file);
    if (imported.ok && !imported.skipped) {
      result.imported += 1;
      result.assets.push({
        driveFileId: file.id,
        assetId: imported.assetId,
        name: file.name,
      });
    } else {
      result.skipped += 1;
      if (!imported.ok) result.errors.push(`${file.name}: ${imported.error}`);
    }
  }

  return result;
}

export async function importDriveImageFile(
  file: Pick<DriveFile, "id" | "name" | "mimeType" | "size">,
): Promise<
  | { ok: true; assetId: string; skipped: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  const mime = file.mimeType ?? "";
  if (!IMAGE_MIME.has(mime)) {
    return {
      ok: true,
      skipped: true,
      reason: `unsupported mime: ${mime || "unknown"}`,
    };
  }

  const size = Number(file.size ?? 0);
  if (Number.isFinite(size) && size > MAX_IMAGE_BYTES) {
    return { ok: true, skipped: true, reason: "image-too-large" };
  }

  const existing = await prisma.mediaAsset.findFirst({
    where: { driveFileId: file.id },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, assetId: existing.id, skipped: false };
  }

  const downloaded = await downloadDriveFileBytes(file.id);
  if (!downloaded.ok) return { ok: false, error: downloaded.error };

  if (downloaded.bytes.length > MAX_IMAGE_BYTES) {
    return { ok: true, skipped: true, reason: "image-too-large" };
  }

  const header = downloaded.bytes.subarray(0, MAGIC_BYTES_HEADER_BYTES);
  if (!hasValidMagicBytes(header, mime)) {
    return { ok: false, error: "Drive file content does not match image type." };
  }

  const safeName = sanitizeDriveFilename(file.name);
  const pathname = `drive-imports/${randomUUID()}-${safeName}`;
  const blobBody = downloaded.bytes.buffer.slice(
    downloaded.bytes.byteOffset,
    downloaded.bytes.byteOffset + downloaded.bytes.byteLength,
  ) as ArrayBuffer;
  let blob: { url: string; pathname: string };
  try {
    blob = await put(pathname, blobBody, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Vercel Blob upload failed.",
    };
  }

  try {
    const sha256 = computeSha256(downloaded.bytes);
    const asset = await findOrCreateBySha256({
      url: blob.url,
      mime,
      sizeBytes: downloaded.bytes.length,
      blobPathname: blob.pathname,
      sha256,
      uploadedBy: "system:google-drive",
      driveFileId: file.id,
    });
    return { ok: true, assetId: asset.id, skipped: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "MediaAsset write failed.",
    };
  }
}

function emptyImportResult(
  folderId: string | null,
  error: string,
): DriveImportResult {
  return {
    ok: false,
    folderId,
    scanned: 0,
    imported: 0,
    skipped: 0,
    errors: [error],
    assets: [],
  };
}

function sanitizeDriveFilename(name: string): string {
  const fallback = "drive-image";
  const safe = (name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return safe || fallback;
}
