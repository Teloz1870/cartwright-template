-- AlterTable
ALTER TABLE "IntegrationSettings" ADD COLUMN "videoGenProvider" TEXT DEFAULT 'luma';
ALTER TABLE "IntegrationSettings" ADD COLUMN "videoGenerationApiKey" TEXT;
