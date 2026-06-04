-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmationEmailSentAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "disputedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "refundedAt" DATETIME;
