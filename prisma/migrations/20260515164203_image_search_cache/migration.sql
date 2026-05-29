-- CreateTable
CREATE TABLE "ImageSearchCache" (
    "queryHash" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'unsplash',
    "query" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ImageSearchCache_expiresAt_idx" ON "ImageSearchCache"("expiresAt");
