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
// Downloads per run — files imported plus files that failed. Skipped files
// (already imported, unsupported, too large) do not count.
const MAX_FILES_PER_IMPORT = 50;
// The folder is listed newest first, so a re-run continues where the last one
// stopped by paging past the files it already imported. Every run starts again
// at the newest file, so this is a ceiling per folder, not a batch: files past
// it are never reached. 1,000 is the largest page Drive's files.list returns.
const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 20;
/** The most files one import walks — the folder's most recently modified. */
export const MAX_FILES_WALKED = LIST_PAGE_SIZE * MAX_LIST_PAGES;
/** Error code (prefix of the error text) for a folder past MAX_FILES_WALKED. */
export const DRIVE_FOLDER_TOO_LARGE = "drive-folder-too-large";

export type DriveImportResult = {
  ok: boolean;
  folderId: string | null;
  scanned: number;
  imported: number;
  skipped: number;
  /**
   * Stopped with files left that running it again reaches. False when the
   * folder goes on past MAX_FILES_WALKED: a re-run walks the same files, so
   * the errors carry DRIVE_FOLDER_TOO_LARGE instead.
   */
  more: boolean;
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

  const result: DriveImportResult = {
    ok: true,
    folderId,
    scanned: 0,
    imported: 0,
    skipped: 0,
    more: false,
    errors: [],
    assets: [],
  };
  let downloads = 0;
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const listed = await listDriveFilesInFolder(folderId, {
      pageSize: LIST_PAGE_SIZE,
      pageToken,
    });
    if (!listed.ok) {
      if (page === 0) return emptyImportResult(folderId, listed.error);
      result.errors.push(listed.error);
      result.more = true;
      return result;
    }

    const alreadyImported = await findImportedDriveFileIds(listed.files);
    for (const [index, file] of listed.files.entries()) {
      result.scanned += 1;
      if (alreadyImported.has(file.id)) {
        result.skipped += 1;
        continue;
      }
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
      if (!imported.ok || !imported.skipped) downloads += 1;
      if (downloads >= MAX_FILES_PER_IMPORT) {
        result.more =
          index < listed.files.length - 1 || listed.nextPageToken != null;
        return result;
      }
    }

    pageToken = listed.nextPageToken;
    if (!pageToken) return result;
  }

  result.errors.push(
    `${DRIVE_FOLDER_TOO_LARGE}: the folder has more than the ${result.scanned.toLocaleString("en-US")} files an import walks (newest first), so the files past them are never imported, however often it runs. Split it into folders of at most ${MAX_FILES_WALKED.toLocaleString("en-US")} files.`,
  );
  return result;
}

async function findImportedDriveFileIds(
  files: DriveFile[],
): Promise<Set<string>> {
  if (files.length === 0) return new Set();
  const rows = await prisma.mediaAsset.findMany({
    where: { driveFileId: { in: files.map((file) => file.id) } },
    select: { driveFileId: true },
  });
  return new Set(
    rows.map((row) => row.driveFileId).filter((id): id is string => id != null),
  );
}

export async function importDriveImageFile(
  file: Pick<DriveFile, "id" | "name" | "mimeType" | "size">,
): Promise<
  | { ok: true; assetId: string; skipped: false }
  | { ok: true; skipped: true; reason: string; assetId?: string }
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
    return {
      ok: true,
      skipped: true,
      reason: "already-imported",
      assetId: existing.id,
    };
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
    more: false,
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
