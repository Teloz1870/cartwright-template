-- Google Drive media import + backup destination (Track T3)
ALTER TABLE "IntegrationSettings" ADD COLUMN "driveFolderId" TEXT;
ALTER TABLE "IntegrationSettings" ADD COLUMN "driveBackupFolderId" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "driveFileId" TEXT;

CREATE INDEX "MediaAsset_driveFileId_idx" ON "MediaAsset"("driveFileId");
