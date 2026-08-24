import {
  RUNTIME_TOGGLEABLE_KEYS,
  getDescriptor,
  type FeatureDescriptor,
  type FeatureKey,
} from "./manifest";
import type { MergedBrand } from "@/lib/brand";

/**
 * Synkront tjek af om en feature MÅ tændes lige nu (dependencies + precondition
 * opfyldt). Returnerer en forklarende grund hvis blokeret, ellers null. Delt
 * af validateToggle (apply-path, admin-modulet) og status-visningen
 * (lib/feature-flags/status.ts) så admin-UI'ets "disabled"-tilstand og
 * server-validering altid er enige. Bor i READ-laget (B3): status skal kunne
 * compile i profiler uden admin-modulets write-path.
 */
export function enableBlockReason(
  desc: FeatureDescriptor,
  brand: MergedBrand,
): string | null {
  for (const dep of desc.dependsOn ?? []) {
    if (!brand.features[dep]) {
      const depDesc = getDescriptor(dep);
      return `Kræver at '${depDesc?.label ?? dep}' er aktiveret først.`;
    }
  }
  if (desc.precondition?.kind === "ecommerce" && !brand.ecommerceEnabled) {
    return "Kræver at e-commerce er aktiveret (webshop-mode).";
  }
  if (desc.precondition?.kind === "minCurrencies") {
    const count = Object.keys(brand.policies?.supportedCurrencies ?? {}).length;
    if (count < desc.precondition.value) {
      return `Kræver mindst ${desc.precondition.value} valutaer i supportedCurrencies (har ${count}).`;
    }
  }
  return null;
}

/**
 * Merger DB-feature-overrides ovenpå brand.config-defaults.
 *
 * SIKKERHEDSINVARIANT (features-ækvivalent til identity-guarden i lib/brand.ts):
 * et override honoreres KUN hvis (a) key'en er på RUNTIME_TOGGLEABLE_KEYS-
 * allowlisten OG (b) værdien er en boolean. Alt andet ignoreres lydløst —
 * en kontamineret/hostile `featureOverridesJson` med fx `ecommerceEnabled:true`,
 * `a2a:true` eller junk-typer kan ALDRIG flippe identitet eller compile-time-
 * gates. Det er den strukturelle garanti mod en gentagelse af Phase G-bugget.
 *
 * Fail-soft: null/uparsbar JSON → returnér defaults uændret (samme filosofi
 * som getBrand's fallback-paths).
 */
export function mergeFeatureOverrides<T extends Record<string, boolean>>(
  defaults: T,
  json: string | null | undefined,
): T {
  if (!json) return { ...defaults };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...defaults };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...defaults };
  }

  const merged: T = { ...defaults };
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "boolean") continue;
    if (!RUNTIME_TOGGLEABLE_KEYS.has(key as FeatureKey)) continue;
    // Kun allowlistede, eksisterende keys med boolean-værdi når hertil.
    if (!(key in defaults)) continue;
    (merged as Record<string, boolean>)[key] = value;
  }
  return merged;
}
