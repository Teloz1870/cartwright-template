/**
 * Crema — coffee-attribute parser (the KompositZaun port, translated to beans).
 *
 * `Product.attributes` is the engine's generic merchandising JSON; this module
 * narrows it to the coffee vocabulary the crema surfaces render:
 *
 *   { origin: "Etiopien", process: "Vasket", roast: 2,
 *     notes: ["bergamot", "fersken"], weightG: 250 }
 *
 * The one rule, taken verbatim from the KZ card: NEVER guess. A field that is
 * missing or doesn't parse returns null/[] and the caller omits that element —
 * a wrong roast level or a fabricated kr/kg figure is worse than no badge.
 */

import { localizedAttributes } from "@/lib/product-attributes";
import { PACK_SIZE_ATTRIBUTE } from "@/lib/product-attributes";

export type CoffeeAttributes = {
  /** Roast level 1–4 (integer) — anything else is null. */
  roast: number | null;
  origin: string | null;
  process: string | null;
  /** Tasting notes — non-empty strings only. */
  notes: string[];
  /** Bag weight in grams — finite and > 0, else null. */
  weightG: number | null;
};

const EMPTY: CoffeeAttributes = {
  roast: null,
  origin: null,
  process: null,
  notes: [],
  weightG: null,
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  // Prisma hands Json columns over parsed; a string is tolerated defensively
  // (e.g. a tool writing the column as serialized text) but never required.
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function asPositiveNumber(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Narrow a raw `Product.attributes` value to the coffee vocabulary. */
export function parseCoffeeAttributes(raw: unknown): CoffeeAttributes {
  const a = asRecord(raw);
  if (!a) return EMPTY;

  const roastNum = asPositiveNumber(a.roast);
  const roast =
    roastNum !== null && Number.isInteger(roastNum) && roastNum >= 1 && roastNum <= 4
      ? roastNum
      : null;

  const notes = Array.isArray(a.notes)
    ? a.notes
        .map(asTrimmedString)
        .filter((n): n is string => n !== null)
    : [];

  return {
    roast,
    origin: asTrimmedString(a.origin),
    process: asTrimmedString(a.process),
    notes,
    // Read through the shared key so pack and route cannot drift apart.
    weightG: asPositiveNumber(a[PACK_SIZE_ATTRIBUTE]),
  };
}

/**
 * Locale-aware variant: reads `translations.<locale>.attributes` merged over
 * the base object (lib/product-attributes), then narrows. On the base locale
 * this is byte-identical to `parseCoffeeAttributes(product.attributes)`.
 */
export function parseLocalizedCoffeeAttributes(
  product: { attributes?: unknown; translations?: unknown },
  locale: string,
): CoffeeAttributes {
  return parseCoffeeAttributes(localizedAttributes(product, locale));
}

/**
 * Honest price-per-kilo in minor units — only when the bag weight is known.
 * Returns null otherwise so the caller omits the line (never a wrong number).
 */
export function perKgOere(priceOere: number, weightG: number | null): number | null {
  if (weightG === null || !(priceOere > 0)) return null;
  return Math.round((priceOere * 1000) / weightG);
}
