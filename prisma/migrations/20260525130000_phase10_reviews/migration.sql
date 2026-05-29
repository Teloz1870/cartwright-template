-- Phase 10 Slice 7 — kunde-reviews system.
--
-- Additive only: 2 nye tabeller (ProductReview, ReviewPromptLog) med FK'er
-- til Product, User, Order. Ingen ALTER på eksisterende tabeller — relationerne
-- fra Product/User/Order til ProductReview er navigations-only (Prisma-niveau),
-- DB'en behøver ikke kolonner i den retning.
--
-- Hand-written for konsistens med Phase 5 + Phase 7 + Phase 10 Slice 1 mønstret.

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'da',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderatorNote" TEXT,
    "moderatedBy" TEXT,
    "moderatedAt" DATETIME,
    "reviewToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductReview_reviewToken_key" ON "ProductReview"("reviewToken");
CREATE INDEX "ProductReview_productId_status_idx" ON "ProductReview"("productId", "status");
CREATE INDEX "ProductReview_status_createdAt_idx" ON "ProductReview"("status", "createdAt");
CREATE INDEX "ProductReview_orderId_idx" ON "ProductReview"("orderId");

-- CreateTable
CREATE TABLE "ReviewPromptLog" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailMessageId" TEXT,
    CONSTRAINT "ReviewPromptLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
