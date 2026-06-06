-- SEO-indekserings-kontroller på BrandingSettings.
-- seoIndexing: "public" (default) | "noindex" (staging/under-opbygning).
-- aiCrawlers:  "allow" (default, GEO) | "block" (bloker AI-bots, behold Google).
-- Additivt nullable med defaults → eksisterende rækker er "public"/"allow" = uændret.
-- Hand-written for konsistens med øvrige migrations.

ALTER TABLE "BrandingSettings" ADD COLUMN "seoIndexing" TEXT DEFAULT 'public';
ALTER TABLE "BrandingSettings" ADD COLUMN "aiCrawlers" TEXT DEFAULT 'allow';
