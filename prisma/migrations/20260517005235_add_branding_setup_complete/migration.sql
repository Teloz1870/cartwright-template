-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrandingSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "storeName" TEXT NOT NULL,
    "heroImage" TEXT NOT NULL,
    "announcement" TEXT NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BrandingSettings" ("announcement", "heroImage", "id", "storeName", "updatedAt") SELECT "announcement", "heroImage", "id", "storeName", "updatedAt" FROM "BrandingSettings";
DROP TABLE "BrandingSettings";
ALTER TABLE "new_BrandingSettings" RENAME TO "BrandingSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
