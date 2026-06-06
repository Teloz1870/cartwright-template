-- GDPR sletteret-log (art. 17). Sporing af anonymiserings-requests.
-- Selve anonymiseringen er soft + admin-udløst (lib/gdpr/erase.ts); denne tabel
-- er kun audit/sporing. Additivt — ingen ændring af eksisterende tabeller.
-- Hand-written for konsistens med øvrige migrations.

CREATE TABLE "DataErasureRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL,
    "summaryJson" TEXT,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

CREATE INDEX "DataErasureRequest_email_idx" ON "DataErasureRequest"("email");
