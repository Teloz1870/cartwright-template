import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import type { MergedBrand } from "@/lib/brand";

/**
 * B1 static seam variant — brand WITHOUT a database (site-profile program).
 *
 * Returns exactly getBrand()'s fallback branch: brand.config defaults with
 * `source: "fallback"` — identical to what every DB-profile renders when the
 * DB is silent. brand.config.ts stays the single source of truth; there is
 * simply no override layer here.
 *
 * NOTHING in the engine imports this file today — it exists so the B3
 * materializer can wire the no-DB `site` profile's seam
 * (`lib/data-source/brand.ts`) to it. The engine stays byte-identical until
 * a materializer performs that swap.
 */
export async function fetchBrand(): Promise<MergedBrand> {
  // Mirrors the db variant's no-row branch exactly (the audited fallback):
  // `logo.imageUrl` is a DB-ONLY field on MergedBrand (brand.config's logo
  // carries no imageUrl) — null here means "no uploaded logo", it discards
  // nothing from config.
  return {
    ...brandDefaults,
    source: "fallback",
    logo: { ...brandDefaults.logo, imageUrl: null },
  } as unknown as MergedBrand;
}

// ── The chrome/homepage RAW settings row: no DB → no row, exactly the
//    unseeded-DB render every profile already handles (brand.config wins
//    everywhere). Structural subset of BrandingSettings covering the fields
//    today's call sites read (Header/Footer chrome + the first-run
//    predicate); DesignHomepageProps.settings accepts null directly. ──

/**
 * Header/Footer/homepage: no DB → no settings row.
 *
 * DELIBERATE subset (same boundary as nav.static.ts' fetchHomeCategories):
 * it covers every field Header/Footer and the first-run predicate read, plus
 * the hero fields (heroImage/announcement) design homepages consume. It can
 * NEVER satisfy the full `BrandingSettings | null` that today's page.tsx
 * forwards into DesignHomepageProps.settings — by design: the site profile
 * replaces page.tsx with a B3 static homepage variant (core.knownDeviations),
 * and THAT variant consumes this subset.
 */
export async function fetchBrandingSettings(): Promise<{
  storeName: string | null;
  ecommerceEnabled: boolean | null;
  industryTemplate: string | null;
  designSlug: string | null;
  setupComplete: boolean | null;
  websiteHeadline: string | null;
  tagline: string | null;
  heroCta: string | null;
  heroImage: string | null;
  announcement: string | null;
} | null> {
  return null;
}

// ── lib/theme.ts' settings reads: no DB → no row. The theme layer already
//    handles null everywhere: getActiveTheme → compile-time CSS file,
//    getActiveDesign → brand.designSlug ?? inference from brand.config,
//    getActiveChromeConfig → the design's own siteChrome/shared chrome.
//    Return types are structural row-shapes | null (matching the db
//    variant's selects) so lib/theme.ts' `row?.x` reads keep compiling when
//    B3 copies this file over the seam target (codex fold-in, PR #382). ──

/** getActiveTheme(): no runtime palette override. */
export async function fetchThemeSettings(): Promise<{ themeJson: string | null } | null> {
  return null;
}

/** getActiveDesign(): design resolves from brand.config alone. */
export async function fetchDesignSettings(): Promise<{
  designSlug: string | null;
  industryTemplate: string | null;
  ecommerceEnabled: boolean | null;
} | null> {
  return null;
}

/** getActiveChromeConfig(): no chrome-part override. */
export async function fetchChromeSettings(): Promise<{ chromeJson: string | null } | null> {
  return null;
}
