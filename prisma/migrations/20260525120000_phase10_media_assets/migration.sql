-- Phase 10 Slice 1 — MediaAsset central library + ProductMedia join.
--
-- Additive only: nye tabeller + nullable FK-kolonner på Category/Page/Service/
-- BrandingSettings. Legacy string-URL-felter (Product.images, Category.heroImage,
-- heroVideo, Page.heroImage, Service.heroImage, BrandingSettings.heroImage)
-- bevares urørt. Read-path (lib/media/shim.ts) foretrækker MediaAsset når
-- brand.features.mediaLibrary er on, ellers fallback til legacy.
--
-- Hand-written for at undgå Prisma's drift-fix migration (samme strategi som
-- Phase 5 + Phase 7).

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "blobPathname" TEXT,
    "sha256" TEXT,
    "altDa" TEXT,
    "altEn" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "geoSnippet" TEXT,
    "dominantColors" TEXT,
    "suggestedSlug" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "aiModel" TEXT,
    "aiAttempts" INTEGER NOT NULL DEFAULT 0,
    "aiLastError" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MediaAsset_blobPathname_key" ON "MediaAsset"("blobPathname");
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");
CREATE INDEX "MediaAsset_aiStatus_createdAt_idx" ON "MediaAsset"("aiStatus", "createdAt");

-- CreateTable
CREATE TABLE "ProductMedia" (
    "productId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    PRIMARY KEY ("productId", "assetId"),
    CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductMedia_productId_position_idx" ON "ProductMedia"("productId", "position");

-- AlterTable: tilføj nullable FK-kolonner. Eksisterende rækker beholder NULL
-- (legacy heroImage/heroVideo string-URL bruges fortsat indtil backfill).
ALTER TABLE "Category" ADD COLUMN "heroImageAssetId" TEXT REFERENCES "MediaAsset" ("id");
ALTER TABLE "Category" ADD COLUMN "heroVideoAssetId" TEXT REFERENCES "MediaAsset" ("id");
ALTER TABLE "Page" ADD COLUMN "heroImageAssetId" TEXT REFERENCES "MediaAsset" ("id");
ALTER TABLE "Service" ADD COLUMN "heroImageAssetId" TEXT REFERENCES "MediaAsset" ("id");
ALTER TABLE "BrandingSettings" ADD COLUMN "heroImageAssetId" TEXT REFERENCES "MediaAsset" ("id");
