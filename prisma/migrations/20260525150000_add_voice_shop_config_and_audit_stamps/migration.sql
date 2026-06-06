-- Voice shop + Local-AI v2: udvider IntegrationSettings med voice-shop-konfig
-- og AI-provider felter (anthropicModel, localAiFallbackMode,
-- lastDegradedAt, lastModelDetectedAt, aiUsageJson) som chatModelResolved()
-- og /admin/integrations LocalAiForm læser/skriver.
--
-- AuditLog udvides med provider/model/modality/sessionMinutes som
-- lib/audit.ts stamps via AsyncLocalStorage-context (lib/audit-context.ts).
-- Bagudkompatibelt: alle gamle rows får provider="anthropic", modality="text".
--
-- Hand-written for at undgå Prisma's drift-fix (schema-drift cleanup er en
-- separat opgave — se internal-docs).

-- IntegrationSettings: voice-shop config
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopEnabled" BOOLEAN DEFAULT 0;
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopModel" TEXT DEFAULT 'gemini-2.5-flash-live';
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopVoice" TEXT DEFAULT 'Puck';
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopAllowedToolsJson" TEXT;
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopMaxMinutesPerSession" INTEGER DEFAULT 5;
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopMaxMinutesPerDay" INTEGER DEFAULT 60;
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopVisionEnabled" BOOLEAN DEFAULT 1;
ALTER TABLE "IntegrationSettings" ADD COLUMN "voiceShopLastDailyUsageJson" TEXT;

-- IntegrationSettings: Local-AI v2 felter
ALTER TABLE "IntegrationSettings" ADD COLUMN "anthropicModel" TEXT DEFAULT 'claude-haiku-4-5';
ALTER TABLE "IntegrationSettings" ADD COLUMN "localAiFallbackMode" TEXT DEFAULT 'on-error';
ALTER TABLE "IntegrationSettings" ADD COLUMN "lastDegradedAt" DATETIME;
ALTER TABLE "IntegrationSettings" ADD COLUMN "lastModelDetectedAt" DATETIME;
ALTER TABLE "IntegrationSettings" ADD COLUMN "aiUsageJson" TEXT;

-- AuditLog: provider/model/modality stamps + sessionMinutes for voice
ALTER TABLE "AuditLog" ADD COLUMN "provider" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "model" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "modality" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "sessionMinutes" REAL;

-- Backfill: alle eksisterende rows er text/anthropic (pre-voice)
UPDATE "AuditLog" SET "provider" = 'anthropic', "modality" = 'text' WHERE "provider" IS NULL;

-- Index på provider for /admin/audit filtre (text vs voice vs local)
CREATE INDEX "AuditLog_provider_idx" ON "AuditLog"("provider");
