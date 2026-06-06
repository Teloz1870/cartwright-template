-- AlterTable: explicit body-format provenance for imported content (Google Docs).
-- Nullable, no default → existing rows stay NULL and render via the safe
-- markdown path (bodyFormat ?? "text"). Additive, byte-identical for existing shops.
ALTER TABLE "Page" ADD COLUMN "bodyFormat" TEXT;
ALTER TABLE "Post" ADD COLUMN "bodyFormat" TEXT;
