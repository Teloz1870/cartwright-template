-- Newsletter-tilmeldinger (double-opt-in). UI'et havde ingen backend; denne tabel
-- + /api/newsletter/* gør den rigtig. token = confirm/unsubscribe-link. Additivt.
-- Hand-written for konsistens med øvrige migrations.

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "unsubscribedAt" DATETIME
);

CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");
CREATE UNIQUE INDEX "Subscriber_token_key" ON "Subscriber"("token");
CREATE INDEX "Subscriber_status_idx" ON "Subscriber"("status");
