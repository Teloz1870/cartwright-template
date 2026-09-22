import { brand } from "@/brand.config";

/**
 * Normalise the `translations` value into a plain lookup object.
 *
 * Prisma hands a `Json?` column back as an object, but the legacy `$queryRaw`
 * paths in `lib/public-pages.ts` bypass the client's deserialisation and SQLite
 * returns the column as TEXT. Without this, translations silently never applied
 * on exactly the installations those fallbacks exist to keep working.
 */
function asBag(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Own-property read: `bag["constructor"]["name"]` is the string "Object", so an
 *  inherited hit would silently replace real copy. Callers clamp the locale to
 *  `brand.locales`, but the rule must not depend on every caller remembering. */
function own(bag: Record<string, unknown> | null, key: string): unknown {
  return bag && Object.hasOwn(bag, key) ? bag[key] : undefined;
}

/**
 * Resolve one translatable field of a DB row for an EXPLICIT locale.
 *
 * This is the leaf of the dynamic-translation model: pure, synchronous, and
 * free of `next-intl` (and therefore of a request context). `getDynamicTranslation`
 * is the async wrapper that resolves the ambient request locale and then calls
 * this; agent-facing surfaces that already KNOW their locale — `llms.txt`, the
 * public `site.*` tools — call this directly, so there is exactly one place
 * where "which language does this row speak?" is decided.
 *
 * Contract (unchanged from the wrapper it was extracted from):
 * - the base column IS the source text, written in `brand.defaultLocale`;
 * - for the base locale the base column wins outright — no lookup, no drift;
 * - otherwise a non-empty `translations[locale][field]` wins;
 * - anything else falls back to the base column (or the caller's fallback).
 */
export function translatedField(
  entity: { [key: string]: unknown; translations?: unknown },
  field: string,
  locale: string,
  fallback: string | null | undefined = "",
): string {
  const baseValue =
    typeof entity[field] === "string" ? (entity[field] as string) : (fallback ?? "");
  if (locale === brand.defaultLocale) return baseValue;

  const v = own(asBag(own(asBag(entity.translations), locale)), field);
  if (typeof v === "string" && v) return v;

  return baseValue;
}
