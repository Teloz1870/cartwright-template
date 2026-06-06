-- Track T2: Google Sheets ↔ catalog sync. Additive nullable sync state.
ALTER TABLE "IntegrationSettings" ADD COLUMN "sheetsSpreadsheetId" TEXT;
ALTER TABLE "IntegrationSettings" ADD COLUMN "sheetsLastSyncAt" DATETIME;
ALTER TABLE "IntegrationSettings" ADD COLUMN "sheetsLastSyncResultJson" TEXT;

ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "sheetRowRef" TEXT;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
