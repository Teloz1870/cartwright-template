-- Baseline for orphan tables: Lead, MigrationJob, Service, Subscription.
--
-- These four models live in prisma/schema.prisma but were never captured by a
-- migration (they were introduced via `prisma db push`). As a result a full
-- from-zero replay (`prisma migrate deploy`, `scripts/migrate-turso.ts` on a
-- fresh DB, CI) failed at 20260525120000_phase10_media_assets — which ALTERs
-- "Service" — with `no such table: Service`, and a from-zero DB would also be
-- missing all four tables.
--
-- This migration is intentionally BACKDATED (timestamp after 20260514_init so
-- "User" exists for Subscription's FK, before 20260525_phase10 so "Service"
-- exists before phase10 adds its heroImageAssetId column). "Service" is created
-- here WITHOUT heroImageAssetId — phase10 adds that column.
--
-- Every statement is idempotent (IF NOT EXISTS) so it is a safe no-op on
-- existing databases that already have these tables via db push (e.g. the live
-- canaries, which apply only pending migrations via scripts/migrate-turso.ts).

CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "projectType" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "aiPriority" TEXT,
    "aiSummary" TEXT,
    "aiSuggestedReply" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "MigrationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "storeName" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "logJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Service WITHOUT heroImageAssetId (phase10_media_assets adds that column + FK).
CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "priceString" TEXT,
    "heroImage" TEXT,
    "features" JSONB,
    "body" TEXT NOT NULL,
    "vibeHtml" TEXT,
    "showInNav" BOOLEAN NOT NULL DEFAULT false,
    "navOrder" INTEGER NOT NULL DEFAULT 0,
    "translations" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Service_slug_key" ON "Service"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubId_key" ON "Subscription"("stripeSubId");
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
