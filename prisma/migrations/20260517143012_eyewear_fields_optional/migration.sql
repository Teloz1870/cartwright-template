-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceDkk" INTEGER NOT NULL,
    "images" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "frameColor" TEXT,
    "lensColor" TEXT,
    "brand" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "categoryId" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("attributes", "brand", "categoryId", "createdAt", "deletedAt", "description", "featured", "frameColor", "id", "images", "lensColor", "name", "priceDkk", "slug", "stock") SELECT "attributes", "brand", "categoryId", "createdAt", "deletedAt", "description", "featured", "frameColor", "id", "images", "lensColor", "name", "priceDkk", "slug", "stock" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
