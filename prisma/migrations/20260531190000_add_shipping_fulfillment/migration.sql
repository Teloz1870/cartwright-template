-- Shipping & fulfillment (Track G). Additive: nullable kolonner på Product/Order
-- + nye tabeller (zones, rates, suppliers, fulfillment). Eksisterende rækker
-- uændrede. Flat-fee-fragt bevares når features.shippingZones er off.
-- Hand-written for konsistens med øvrige migrations.

ALTER TABLE "Product" ADD COLUMN "weightGram" INTEGER;
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Order" ADD COLUMN "carrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "estDeliveryFrom" DATETIME;
ALTER TABLE "Order" ADD COLUMN "estDeliveryTo" DATETIME;

CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feeDkk" INTEGER NOT NULL,
    "freeThresholdDkk" INTEGER,
    "minWeightGram" INTEGER,
    "maxWeightGram" INTEGER,
    "deliveryDaysMin" INTEGER NOT NULL DEFAULT 2,
    "deliveryDaysMax" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "ShippingRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingZone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ShippingRate_zoneId_idx" ON "ShippingRate"("zoneId");

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FulfillmentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "token" TEXT NOT NULL,
    "lineJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FulfillmentOrder_token_key" ON "FulfillmentOrder"("token");
CREATE INDEX "FulfillmentOrder_orderId_idx" ON "FulfillmentOrder"("orderId");
CREATE INDEX "FulfillmentOrder_supplierId_idx" ON "FulfillmentOrder"("supplierId");
