import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { sovereignEcommerce } from "@/lib/identity";
import { fetchBrand } from "@/lib/data-source/brand";
import { inferDesignFromIndustry } from "@/designs/options";

/**
 * Resolve a shop's identity (Phase H) + active design from the DB settings row.
 * Single source of truth shared by the homepage render (app/[locale]/page.tsx)
 * and the admin design picker (app/admin/designs/DesignsPanel.tsx) so they can
 * never disagree about mode/design.
 *
 * In website-mode, IDENTITY (mode/ecommerce/industry) comes from brand.config,
 * NOT the DB — a contaminated/shared DB must not flip a corporate site into a
 * webshop (the Teloz↔Northbound incident). The DESIGN is COSMETIC: a config
 * override (brand.designSlug) wins, then the admin's DB choice
 * (settings.designSlug — now honored in BOTH modes), then inference.
 */
export type StoreIdentity = {
  isWebsiteMode: boolean;
  ecommerceEnabled: boolean;
  industryTemplate: string;
  /** Resolved active design pack slug. */
  designSlug: string;
  /** True when designSlug came from inference (no config/DB override). */
  designIsInferred: boolean;
};

export function resolveStoreIdentity(
  settings: {
    ecommerceEnabled?: boolean | null;
    industryTemplate?: string | null;
    designSlug?: string | null;
  } | null,
): StoreIdentity {
  const isWebsiteMode = brandDefaults.mode === "website";
  // Same policy as fetchBrand()'s merge — the two used to duplicate the
  // website-mode gate, which is how they could drift apart.
  const ecommerceEnabled = sovereignEcommerce(settings?.ecommerceEnabled);
  const industryTemplate = isWebsiteMode
    ? brandDefaults.industryTemplate
    : (settings?.industryTemplate || brandDefaults.industryTemplate);
  const explicit = brandDefaults.designSlug ?? settings?.designSlug ?? null;
  const designSlug =
    explicit ?? inferDesignFromIndustry(industryTemplate, ecommerceEnabled);
  return {
    isWebsiteMode,
    ecommerceEnabled,
    industryTemplate,
    designSlug,
    designIsInferred: !explicit,
  };
}

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
 *
 * B1 data-source seam (site-profile program): selve DB-læsningen + merge er
 * flyttet UÆNDRET til lib/data-source/brand.ts (seam target; static-variant i
 * brand.static.ts). Denne fil beholder cache + hele den offentlige API.
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
  source: "db" | "fallback" | "unavailable";
  ecommerceEnabled: boolean;
  defaultLocale: string;
  logo: Mutable<typeof brandDefaults.logo> & { imageUrl: string | null };
};

export async function getBrand(): Promise<MergedBrand> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  // Hele fetch+merge-logikken (inkl. Phase G/H fallback-disciplinen) bor i
  // seam-filen lib/data-source/brand.ts — fetchBrand() kaster aldrig (fail-
  // soft til brand.config defaults), så hvert resultat kan caches direkte.
  const value = await fetchBrand();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
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

/**
 * Security-sensitive feature gates need to know whether their runtime view is
 * authoritative. Public rendering may safely fall back to config during a DB
 * outage; a DB-disabled network interface may not silently reopen that way.
 */
export async function getFeatureGateState(): Promise<{
  available: boolean;
  features: MergedBrand["features"];
}> {
  const resolved = await getBrand();
  return {
    available: resolved.source !== "unavailable",
    features: resolved.features,
  };
}
