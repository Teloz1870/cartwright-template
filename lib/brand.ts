import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { prisma } from "@/lib/db";
import { mergeFeatureOverrides } from "@/lib/feature-flags/resolve";

/**
 * ULTRAPLAN-lite UL5: server-side brand-loader der merger DB-overrides
 * ovenpå brand.config defaults.
 *
 * Pattern:
 * - brand.config.ts er COMPILE-TIME defaults (typed konstanter)
 * - BrandingSettings i DB er RUNTIME overrides (nullable felter)
 * - getBrand() returnerer en merged version hvor DB-værdier vinder
 *
 * Hot-path-komponenter (Header, Footer, layout) bruger fortsat brand-import
 * direkte for at undgå async-pollering. Kun komponenter der skal reflektere
 * admin-skift-uden-redeploy (fx setup-wizard, /admin headers) bruger getBrand().
 *
 * Memory-cache: 30 sek TTL — kort nok til at admin-changes slår igennem,
 * langt nok til at burst-requests ikke spammer DB.
 */

type CachedBrand = { value: MergedBrand; expiresAt: number };
let cache: CachedBrand | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Deep-mutable version af brand.config så DB-overrides kan assignes
 * (brand-export bruger `as const` → literal-types der ellers ville afvise
 * arbitrary strings fra DB).
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

export type MergedBrand = Mutable<typeof brandDefaults> & {
  /** Indikerer at brand er hentet fra DB (vs fresh fallback) */
  source: "db" | "fallback";
  ecommerceEnabled: boolean;
  defaultLocale: string;
  logo: Mutable<typeof brandDefaults.logo> & { imageUrl: string | null };
};

export async function getBrand(): Promise<MergedBrand> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

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
      const fallback = {
        ...brandDefaults,
        source: "fallback",
        logo: { ...brandDefaults.logo, imageUrl: null },
      } as unknown as MergedBrand;
      cache = { value: fallback, expiresAt: now + CACHE_TTL_MS };
      return fallback;
    }

    // Merge: DB-værdier override defaults, nullable-felter fallback til defaults.
    // Cast til MergedBrand for at bryde brand.config's `as const` literal-typer
    // — vi mister type-safety på de overskrevne felter, men de er kontrolleret
    // ovenfor (string-fallback) og DB-skemaet validerer ved migrate.
    // Phase H (2026-05-29): website-mode identity is sovereign from brand.config.
    // The DB row may override cosmetics (logo/colours) only — never storeName,
    // ecommerceEnabled, or industryTemplate. Stops a shared/contaminated DB from
    // turning a corporate site into a webshop (Teloz↔Northbound coffee incident).
    const isWebsiteMode = brandDefaults.mode === "website";
    const merged = {
      ...brandDefaults,
      storeName: isWebsiteMode ? brandDefaults.storeName : (row.storeName || brandDefaults.storeName),
      tagline: row.tagline || brandDefaults.tagline,
      domain: row.domain || brandDefaults.domain,
      // Afled runtime-url fra det DB-satte domæne, så sitemap, robots og
      // canonical-tags følger operatørens rigtige domæne — uden at
      // brand.config.ts skal redigeres efter fork.
      url: row.domain
        ? `https://${row.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
        : brandDefaults.url,
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
      ecommerceEnabled: isWebsiteMode
        ? false
        : (row.ecommerceEnabled ?? brandDefaults.ecommerceEnabled),
      defaultLocale: row.defaultLocale || "da",
      
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

    cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
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
    const fallback = {
      ...brandDefaults,
      source: "fallback",
    } as unknown as MergedBrand;
    cache = { value: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }
}

/**
 * Invalidér cachen — kaldes fra setup-wizard og /admin actions efter
 * brand-update så ændringen reflekteres umiddelbart.
 */
export function invalidateBrandCache(): void {
  cache = null;
}

/**
 * Convenience: de resolved feature-flags (brand.config-defaults merged med
 * DB-overrides for den runtime-toggleable delmængde). Arver getBrand's cache.
 */
export async function getFeatures(): Promise<MergedBrand["features"]> {
  return (await getBrand()).features;
}
