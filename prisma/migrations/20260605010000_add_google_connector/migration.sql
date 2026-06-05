-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "accountEmail" TEXT,
    "grantedScopesJson" TEXT,
    "refreshTokenEnc" TEXT,
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "connectedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable: Google Workspace OAuth2 client credentials (encrypted at rest)
ALTER TABLE "IntegrationSettings" ADD COLUMN "googleOAuthClientId" TEXT;
ALTER TABLE "IntegrationSettings" ADD COLUMN "googleOAuthClientSecret" TEXT;
