/**
 * Localized product attributes.
 *
 * `Product.attributes` (generic merchandising JSON) is authored in the shop's
 * base locale. Locale variants live next to name/description in the existing
 * `translations` JSON: `translations.<locale>.attributes` is a partial object
 * merged OVER the base — so locale-neutral keys (roast, weightG) are written
 * once, and only human-language values (origin, process, notes) need a
 * translation. `getDynamicTranslation` stays string-field-only; this is its
 * object-shaped sibling.
 *
 * On the base locale (or with no override) the base object is returned
 * untouched — byte-identical for every existing caller.
 */
import { brand } from "@/brand.config";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function localizedAttributes(
  entity: { attributes?: unknown; translations?: unknown },
  locale: string,
): unknown {
  const base = entity.attributes;
  if (locale === brand.defaultLocale) return base;

  const override = asRecord(
    asRecord(asRecord(entity.translations)?.[locale])?.attributes,
  );
  if (!override) return base;

  const baseRecord = asRecord(base);
  return baseRecord ? { ...baseRecord, ...override } : override;
}

/**
 * The attribute key recording grams per pack.
 *
 * It lives HERE, not in the design pack that invented it, because the
 * dependency has to run pack → core and never the other way: a pruned `light`
 * scaffold has no `designs/crema/`, so a core route importing from it would
 * fail to build (tests/unit/design-deep-imports.test.ts enforces exactly
 * this, and caught the first attempt).
 *
 * One name in one place still matters. `/api/products/search` lifts this key
 * into a named `packSizeGrams` field; a hardcoded "weightG" over there would
 * go stale silently the day the vocabulary is tidied — the route would still
 * EMIT `packSizeGrams`, so a field-name contract test stays green while every
 * live value becomes null.
 */
export const PACK_SIZE_ATTRIBUTE = "weightG" as const;
