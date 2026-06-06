-- Admin-styrede redirects (WooCommerce-paritet). proxy.ts slår op i en Redis-
-- cachet map (fail-soft). Additivt. Hand-written for konsistens med øvrige migrations.

CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");
