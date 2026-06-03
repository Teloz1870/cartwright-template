-- Phase 7 of Master Plan §4 — add agenticPolicyJson column to BrandingSettings.
--
-- Drives Guardian middleware (lib/guardian/middleware.ts) verdicts. Null →
-- DEFAULT_POLICY (deny-all), which is the safe out-of-the-box default.
-- Admins edit this via the Phase 9 /admin/agentic policy editor (follow-up).
--
-- Hand-written to avoid Prisma's drift-fix migration (schema drift cleanup
-- is a separate task — see internal-docs for details).

-- AlterTable
ALTER TABLE "BrandingSettings" ADD COLUMN "agenticPolicyJson" TEXT;
