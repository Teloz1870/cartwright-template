import { RUNTIME_TOGGLEABLE_KEYS, type FeatureKey } from "./manifest";

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
