-- Feature-management: per-shop runtime feature-overrides.
--
-- Adder BrandingSettings.featureOverridesJson så admin/AI kan tænde/slukke den
-- RUNTIME-toggleable delmængde af brand.features uden redeploy. JSON-objekt
-- { "<key>": boolean }. Kun keys på RUNTIME_TOGGLEABLE_KEYS-allowlisten honoreres
-- af lib/feature-flags/resolve.ts — identitet og compile-time-gates kan ALDRIG
-- flippes herfra (Phase G-guard).
--
-- Null = ingen overrides → brand.config.ts-defaults gælder. Eksisterende shops
-- opfører sig identisk efter migration (non-breaking, additivt nullable felt).
-- Hand-written for konsistens med øvrige Phase 7-10 migrations.

ALTER TABLE "BrandingSettings" ADD COLUMN "featureOverridesJson" TEXT;
