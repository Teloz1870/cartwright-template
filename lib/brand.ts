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
      const fallback = { ...brandDefaults, source: "fallback" as const } as MergedBrand;
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
      emails: {
        from: row.emailFrom || brandDefaults.emails.from,
        fromName: row.emailFromName || brandDefaults.emails.fromName,
        support: row.emailSupport || brandDefaults.emails.support,
        admin: row.emailAdmin || brandDefaults.emails.admin,
      },
      industryTemplate:
        row.industryTemplate || brandDefaults.industryTemplate,
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
    const fallback = { ...brandDefaults, source: "fallback" as const } as MergedBrand;
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
