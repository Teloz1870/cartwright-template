-- Abandoned-cart idempotens-log (WooCommerce-paritet). cartId som PK = én mail
-- pr. kurv. Mirror af ReviewPromptLog. Additivt. Hand-written for konsistens.

CREATE TABLE "AbandonedCartLog" (
    "cartId" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailMessageId" TEXT,
    CONSTRAINT "AbandonedCartLog_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
