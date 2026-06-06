-- Cartwright Live Canvas: per-shop 3D config override.
--
-- Adder BrandingSettings.threeDConfigJson så scene/intensitet/palette kan sættes
-- uden redeploy (via /admin/three-d eller AI-tool three.configure). JSON
-- { "scene": "...", "intensity": 0..1, "paletteSource": "theme"|"custom" }.
-- lib/three/resolve.ts validerer scene mod registry + clamper intensity og er
-- fail-soft på junk. Cosmetic — kan ikke røre identitet.
--
-- Null = brand.config.threeD-default. Non-breaking additivt nullable felt.
-- Hand-written for konsistens med øvrige BrandingSettings-override-migrations.

ALTER TABLE "BrandingSettings" ADD COLUMN "threeDConfigJson" TEXT;
