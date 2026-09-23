import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 1 — MediaAsset write-helpers.
 *
 * Skrives fra upload-route (dual-write efter put() til Vercel Blob) og fra
 * backfill-scriptet (Slice 3). Læsning sker via lib/media/shim.ts som vælger
 * mellem MediaAsset og legacy-URL-felter baseret på brand.features.mediaLibrary.
 */

export type CreateAssetParams = {
  url: string;
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  blobPathname?: string | null;
  sha256?: string | null;
  uploadedBy?: string | null;
  driveFileId?: string | null;
};

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function createAssetFromBlob(params: CreateAssetParams) {
  return prisma.mediaAsset.create({
    data: {
      url: params.url,
      mime: params.mime,
      sizeBytes: params.sizeBytes,
      width: params.width ?? null,
      height: params.height ?? null,
      durationSec: params.durationSec ?? null,
      blobPathname: params.blobPathname ?? null,
      sha256: params.sha256 ?? null,
      uploadedBy: params.uploadedBy ?? null,
      driveFileId: params.driveFileId ?? null,
      aiStatus: "pending",
    },
  });
}

/**
 * Dedup'er på sha256-hash så samme fil uploadet to gange ikke giver to rows.
 * Returnerer den eksisterende asset hvis fundet, ellers opretter ny.
 */
export async function findOrCreateBySha256(
  params: CreateAssetParams & { sha256: string },
) {
  if (params.driveFileId) {
    const existingDriveAsset = await prisma.mediaAsset.findFirst({
      where: { driveFileId: params.driveFileId },
    });
    if (existingDriveAsset) return existingDriveAsset;
  }

  const existing = await prisma.mediaAsset.findFirst({
    where: { sha256: params.sha256 },
  });
  if (existing) return existing;
  return createAssetFromBlob(params);
}

export type ProductMediaRole = "gallery" | "hero" | "swatch";

export async function attachProductMedia(
  productId: string,
  assetId: string,
  position = 0,
  role: ProductMediaRole = "gallery",
) {
  return prisma.productMedia.upsert({
    where: { productId_assetId: { productId, assetId } },
    update: { position, role },
    create: { productId, assetId, position, role },
  });
}
