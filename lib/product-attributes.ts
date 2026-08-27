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
