-- v0.7.0: Design Registry foundation
--
-- Adder BrandingSettings.designSlug så design og industry-template kan
-- vælges uafhængigt. Pre-v0.7.0 shops har designSlug=NULL → render-laget
-- infererer fra industryTemplate via inferDesignFromIndustry() i
-- designs/index.ts. Eksisterende shops opfører sig identisk efter migration.
--
-- Backwards-compat inferens-mapping (i kode, ikke i DB):
--   saas              → saas-dark
--   studio            → studio
--   anden website-mode → corporate-baseline
--   ecommerceEnabled=1 → webshop-classic
--
-- Non-breaking additivt nullable felt — ingen data-migration nødvendig.
-- Hand-written for konsistens med øvrige Phase 7-10 migrations som også
-- skriver SQL direkte (undgår Prisma's drift-detection support).

ALTER TABLE "BrandingSettings" ADD COLUMN "designSlug" TEXT;
