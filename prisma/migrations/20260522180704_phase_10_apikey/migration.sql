-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "description" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "ApiKey" ADD COLUMN "lastUsedIp" TEXT;
