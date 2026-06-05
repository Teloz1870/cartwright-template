-- Moms + faktura på Order. vatOere = moms-andel (øre); invoice* = faktura-reference
-- når en faktura genereres (lib/invoicing). Additive nullable felter — eksisterende
-- ordrer er uændrede. Hand-written for konsistens med øvrige migrations.

ALTER TABLE "Order" ADD COLUMN "vatOere" INTEGER;
ALTER TABLE "Order" ADD COLUMN "invoiceProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoicePdfUrl" TEXT;
