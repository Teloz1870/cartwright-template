-- CreateTable
CREATE TABLE "AcpCheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'not_ready_for_payment',
    "currency" TEXT NOT NULL DEFAULT 'dkk',
    "lineItemsJson" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "shippingName" TEXT,
    "shippingAddress" TEXT,
    "shippingZip" TEXT,
    "shippingCity" TEXT,
    "shippingCountry" TEXT,
    "fulfillmentOption" TEXT,
    "discountCode" TEXT,
    "subtotalDkk" INTEGER NOT NULL DEFAULT 0,
    "shippingDkk" INTEGER NOT NULL DEFAULT 0,
    "discountDkk" INTEGER NOT NULL DEFAULT 0,
    "totalDkk" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AcpIdempotencyKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shippingName" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "shippingZip" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "subtotalDkk" INTEGER NOT NULL,
    "shippingDkk" INTEGER NOT NULL,
    "discountDkk" INTEGER NOT NULL DEFAULT 0,
    "totalDkk" INTEGER NOT NULL,
    "discountCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripePaymentIntentId" TEXT,
    "paymentMethod" TEXT,
    "paidAt" DATETIME,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "acpSessionId" TEXT,
    "confirmationEmailSentAt" DATETIME,
    "refundedAt" DATETIME,
    "disputedAt" DATETIME,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("confirmationEmailSentAt", "createdAt", "discountCode", "discountDkk", "disputedAt", "email", "id", "paidAt", "paymentMethod", "phoneNumber", "refundedAt", "shippingAddress", "shippingCity", "shippingDkk", "shippingName", "shippingZip", "status", "stripePaymentIntentId", "subtotalDkk", "totalDkk", "userId") SELECT "confirmationEmailSentAt", "createdAt", "discountCode", "discountDkk", "disputedAt", "email", "id", "paidAt", "paymentMethod", "phoneNumber", "refundedAt", "shippingAddress", "shippingCity", "shippingDkk", "shippingName", "shippingZip", "status", "stripePaymentIntentId", "subtotalDkk", "totalDkk", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_email_idx" ON "Order"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AcpCheckoutSession_orderId_key" ON "AcpCheckoutSession"("orderId");

-- CreateIndex
CREATE INDEX "AcpCheckoutSession_status_idx" ON "AcpCheckoutSession"("status");

-- CreateIndex
CREATE INDEX "AcpCheckoutSession_expiresAt_idx" ON "AcpCheckoutSession"("expiresAt");
