-- Resolvable Genome (kernel): per-shop genome-state override.
--
-- Adder BrandingSettings.genomeJson så registrerede genome-copy-felter
-- (lib/genome/fields.ts) kan have human/AI-overrides + LLM-resolved cache +
-- identity-anker-overrides UDEN redeploy. JSON-form:
--   { "overrides": { "<field>": string },
--     "resolved":  { "<field>": { "value": string, "deps": string } },
--     "identity":  { "<anchor>": string } }
-- lib/genome/store.ts validerer mod field-allowlist + Zod og er fail-soft på
-- junk. Cosmetic — kan ALDRIG røre identitet (mode/ecommerceEnabled/
-- industryTemplate). RENDER (readField) kalder aldrig en LLM.
--
-- Null = brand.config-ankre. Non-breaking additivt nullable felt.
-- Hand-written for konsistens med øvrige BrandingSettings-override-migrations.

ALTER TABLE "BrandingSettings" ADD COLUMN "genomeJson" TEXT;
