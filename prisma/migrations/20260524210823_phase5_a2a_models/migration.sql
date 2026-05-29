-- Phase 5 of Master Plan §4 — A2A (Agent-to-Agent) data foundation.
--
-- Four new tables for the Headless Merchant architecture:
--   AgentCard         — signed JSON-LD blob buyer agents read for discovery
--   EscrowTransaction — Verify-then-Pay state machine
--   PoTEProof         — Proof-of-Task-Execution evidence
--   AgenticJWT        — A-JWT audit log + replay protection
--
-- This migration is hand-written (not Prisma-autogen) because schema.prisma
-- has pre-existing drift vs the migration chain (a separate cleanup task).
-- Restricting this migration to ONLY the 4 new tables keeps it safe to apply
-- to the shared Turso prod DB without disturbing existing tables.

-- CreateTable
CREATE TABLE "AgentCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "signedJson" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "buyerAgentId" TEXT NOT NULL,
    "shopId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DKK',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "disputeReason" TEXT,
    "fundedAt" DATETIME,
    "releasedAt" DATETIME,
    "refundedAt" DATETIME,
    "disputedAt" DATETIME,
    "paymentRail" TEXT NOT NULL DEFAULT 'stripe',
    "paymentRefId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PoTEProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "escrowTxId" TEXT NOT NULL,
    "proofType" TEXT NOT NULL,
    "proofPayloadJson" TEXT NOT NULL,
    "expectedHash" TEXT,
    "submittedHash" TEXT,
    "verifierResult" TEXT NOT NULL DEFAULT 'pending',
    "verifierMessage" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PoTEProof_escrowTxId_fkey" FOREIGN KEY ("escrowTxId") REFERENCES "EscrowTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgenticJWT" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jti" TEXT NOT NULL,
    "issuerAgentId" TEXT NOT NULL,
    "audienceShop" TEXT,
    "scopes" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "signedJwt" TEXT NOT NULL,
    "verifyResult" TEXT NOT NULL DEFAULT 'pending',
    "verifyError" TEXT,
    "requestPath" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentCard_revokedAt_createdAt_idx" ON "AgentCard"("revokedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCard_version_idx" ON "AgentCard"("version");

-- CreateIndex
CREATE INDEX "EscrowTransaction_status_idx" ON "EscrowTransaction"("status");

-- CreateIndex
CREATE INDEX "EscrowTransaction_buyerAgentId_idx" ON "EscrowTransaction"("buyerAgentId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_sessionId_idx" ON "EscrowTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_createdAt_idx" ON "EscrowTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PoTEProof_escrowTxId_idx" ON "PoTEProof"("escrowTxId");

-- CreateIndex
CREATE INDEX "PoTEProof_verifierResult_idx" ON "PoTEProof"("verifierResult");

-- CreateIndex
CREATE INDEX "AgenticJWT_issuerAgentId_createdAt_idx" ON "AgenticJWT"("issuerAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgenticJWT_createdAt_idx" ON "AgenticJWT"("createdAt");

-- CreateIndex
CREATE INDEX "AgenticJWT_verifyResult_idx" ON "AgenticJWT"("verifyResult");

-- CreateIndex
CREATE UNIQUE INDEX "AgenticJWT_issuerAgentId_jti_key" ON "AgenticJWT"("issuerAgentId", "jti");
