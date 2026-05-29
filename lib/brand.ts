import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { prisma } from "@/lib/db";

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
    const merged = {
      ...brandDefaults,
      storeName: row.storeName || brandDefaults.storeName,
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
      industryTemplate:
        row.industryTemplate || brandDefaults.industryTemplate,
      // Phase G fix: respect brand.config when DB column is NULL — don't
      // force webshop mode on website-mode shops.
      ecommerceEnabled: row.ecommerceEnabled ?? brandDefaults.ecommerceEnabled,
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
