import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { prisma } from "@/lib/db";
import { mergeFeatureOverrides } from "@/lib/feature-flags/resolve";
import {
  applyIdentitySovereignty,
  sovereignEcommerce,
  sovereignStoreName,
} from "@/lib/identity";
import type { MergedBrand } from "@/lib/brand";
import { configuredPublicUrl } from "@/lib/public-url";

/**
 * B1 data-source seam — the DB-merged brand source (site-profile program).
 *
 * This file is the seam target `lib/data-source/brand.ts` declared by the
 * core module (modules/registry.ts) and provided by the db module. It ships
 * the db-variant: ONE BrandingSettings read + the merge of DB overrides onto
 * brand.config defaults — extracted VERBATIM from lib/brand.ts getBrand()
 * (pure extract-method; the 30s cache and the whole public API stay in
 * lib/brand.ts). The static variant (brand.static.ts) returns the fallback
 * branch without touching a database — the B3 materializer wires no-DB
 * profiles to it. fetchBrand() has exactly ONE caller by design: getBrand()
 * — everything else goes through lib/brand.ts.
 *
 * The file also owns the three cosmetic BrandingSettings reads lib/theme.ts
 * performs (theme palette, active design, chrome config) — same seam, same
 * static story: without a DB they return null and the theme layer falls back
 * to brand.config + the design pack's own tokens.
 */
export async function fetchBrand(): Promise<MergedBrand> {
  const deploymentUrl = configuredPublicUrl(brandDefaults.url);
  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
    });

    if (!row) {
      // Phase G fix (2026-05-28): fallback must respect brandDefaults — NOT
      // invent a different identity. Previously hardcoded ecommerceEnabled:
      // true caused Teloz (brand.config says false) to render as a webshop
      // whenever the DB was unreachable or missing this row. brand.config.ts
      // is the single source of truth per CLAUDE.md — fallback only fills
      // gaps the DB would have filled, never overrides explicit config.
      return {
        ...brandDefaults,
        url: deploymentUrl,
        source: "fallback",
        logo: { ...brandDefaults.logo, imageUrl: null },
      } as unknown as MergedBrand;
    }

    // Merge: DB-værdier override defaults, nullable-felter fallback til defaults.
    // Cast til MergedBrand for at bryde brand.config's `as const` literal-typer
    // — vi mister type-safety på de overskrevne felter, men de er kontrolleret
    // ovenfor (string-fallback) og DB-skemaet validerer ved migrate.
    // Phase H (2026-05-29): website-mode identity is sovereign from brand.config.
    // The DB row may override cosmetics (logo/colours) only — never storeName,
    // ecommerceEnabled, or industryTemplate. Stops a shared/contaminated DB from
    // turning a corporate site into a webshop (Teloz↔Northbound coffee incident).
    // The website-mode gate above is now one case of `identitySovereignty`
    // (lib/identity.ts): the axis that decides ownership is where the config
    // lives, not what kind of site it is. Policy "auto" reproduces the old
    // expressions verbatim.
    const isWebsiteMode = brandDefaults.mode === "website";
    const merged = {
      ...brandDefaults,
      storeName: sovereignStoreName(row.storeName),
      tagline: row.tagline || brandDefaults.tagline,
      domain: row.domain || brandDefaults.domain,
      // Afled runtime-url fra det DB-satte domæne, så sitemap, robots og
      // canonical-tags følger operatørens rigtige domæne — uden at
      // brand.config.ts skal redigeres efter fork.
      url: row.domain
        ? `https://${row.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
        : deploymentUrl,
      emails: {
        from: row.emailFrom || brandDefaults.emails.from,
        fromName: row.emailFromName || brandDefaults.emails.fromName,
        support: row.emailSupport || brandDefaults.emails.support,
        admin: row.emailAdmin || brandDefaults.emails.admin,
      },
      industryTemplate: isWebsiteMode
        ? brandDefaults.industryTemplate
        : (row.industryTemplate || brandDefaults.industryTemplate),
      // Phase G/H fix: respect brand.config when DB column is NULL, and in
      // website-mode force config's value so the DB can never enable a webshop.
      ecommerceEnabled: sovereignEcommerce(row.ecommerceEnabled),
      // Every sibling field in this block falls back to brandDefaults; this one
      // used to fall back to a hardcoded "da", so an English fork with a silent
      // column served /en/… while llms.txt announced "Language: da".
      defaultLocale: row.defaultLocale || brandDefaults.defaultLocale,

      // Override Logo if DB fields exist
      logo: {
        ...brandDefaults.logo,
        imageUrl: row.logoImageUrl,
        markPaths: row.logoMarkPaths ? (JSON.parse(row.logoMarkPaths) as string[]) : brandDefaults.logo.markPaths,
        markViewBox: row.logoMarkViewBox || brandDefaults.logo.markViewBox,
        markStrokeWidth: row.logoMarkStrokeWidth || brandDefaults.logo.markStrokeWidth,
        markClass: row.logoMarkClass || brandDefaults.logo.markClass,
        markTransform: row.logoTransform ?? brandDefaults.logo.markTransform,
        faviconBg: row.faviconBg || brandDefaults.logo.faviconBg,
        faviconFg: row.faviconFg || brandDefaults.logo.faviconFg,
      },

      // Feature-overrides: DB kan tænde/slukke den runtime-toggleable
      // delmængde (se RUNTIME_TOGGLEABLE_KEYS). Allowlist-filteret i
      // mergeFeatureOverrides sikrer at identitet + compile-time-gates ALDRIG
      // kan flippes via DB — samme guard-princip som ecommerceEnabled ovenfor.
      features: mergeFeatureOverrides(
        { ...brandDefaults.features },
        row.featureOverridesJson,
      ),

      source: "db" as const,
    } as MergedBrand;

    return merged;
  } catch (err) {
    // DB-fail (build-time, fresh fork uden DB-yet) → return defaults
    console.warn(
      "[getBrand] DB-load fejlede, bruger brand.config defaults:",
      err instanceof Error ? err.message : err,
    );
    // Phase G fix (2026-05-28): same fallback-respects-brandDefaults
    // principle as the no-row path above. Previously hardcoded
    // ecommerceEnabled:true broke Teloz when DB threw (schema drift).
    return {
      ...brandDefaults,
      url: deploymentUrl,
      source: "fallback",
    } as unknown as MergedBrand;
  }
}

// ── The chrome/homepage RAW settings row (vs fetchBrand's merged view):
//    Header, Footer and the homepage read BrandingSettings.findFirst directly
//    (uncached, fail-soft at the call sites) for storeName/identity overrides
//    and the first-run predicate. Query verbatim; per-component `.catch()`es
//    stay at the call sites. ──

/**
 * Header/Footer/homepage: the BrandingSettings row, with identity normalised.
 *
 * NOT the untouched row any more, and that is the point. `getBrand()`'s merge
 * was already guarded, yet a fork's site still renamed itself — because these
 * callers read the row directly instead of the merged view. Normalising here
 * means every `settings?.storeName ?? brand.storeName` call site keeps
 * compiling and simply yields the sovereign value, so no current OR future
 * reader can route around the policy. Under the default `"auto"` the row comes
 * back exactly as before.
 *
 * `fetchBrandingRow()` stays available for the few places that genuinely need
 * the stored value (the admin forms, which must show what is persisted).
 */
export function fetchBrandingRow() {
  return prisma.brandingSettings.findFirst();
}

export async function fetchBrandingSettings() {
  return applyIdentitySovereignty(await fetchBrandingRow());
}

// ── lib/theme.ts' BrandingSettings reads (queries verbatim; the callers keep
//    their own try/catch + 30s caches, so fail-soft behavior is unchanged) ──

/** getActiveTheme(): the runtime theme-palette override (themeJson). */
export function fetchThemeSettings() {
  return prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { themeJson: true },
  });
}

/** getActiveDesign(): the admin's design choice + inference inputs. */
export function fetchDesignSettings() {
  return prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { designSlug: true, industryTemplate: true, ecommerceEnabled: true },
  });
}

/** getActiveChromeConfig(): the chrome-part selection (chromeJson). */
export function fetchChromeSettings() {
  return prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { chromeJson: true },
  });
}
