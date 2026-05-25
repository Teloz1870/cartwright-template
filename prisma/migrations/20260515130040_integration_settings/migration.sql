-- CreateTable
CREATE TABLE "IntegrationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "anthropicApiKey" TEXT,
    "updatedAt" DATETIME NOT NULL
);
