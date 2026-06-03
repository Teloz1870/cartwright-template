-- Blog: Post-tabel. Egen model (ikke Page) for blog-semantik. tags = JSON-streng
-- (SQLite har ingen scalar-lists). Additivt — ingen ændring af eksisterende tabeller.
-- Hand-written for konsistens med øvrige migrations.

CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImage" TEXT,
    "author" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "tags" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "translations" JSONB,
    "vibeHtml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");
