import { brand } from "@/brand.config";

/**
 * Normalise the `translations` value into a plain lookup object.
 *
 * Prisma hands a `Json?` column back as an object, but the legacy `$queryRaw`
 * paths in `lib/public-pages.ts` bypass the client's deserialisation and SQLite
 * returns the column as TEXT. Without this, translations silently never applied
 * on exactly the installations those fallbacks exist to keep working.
 */
/** A plain object of fields — not null, not an array. */
function isBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBag(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isBag(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isBag(value) ? value : null;
}

/**
 * `translations` as a lookup object for an admin form to start from — read the
 * way `translatedField` and `mergeTranslations` read it, so a column that comes
 * back as JSON text opens filled rather than empty.
 */
export function readTranslations(value: unknown): Record<string, unknown> | null {
  return asBag(value);
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

/**
 * The write side: merge an admin form's submitted `translations` into the
 * stored ones, field by field.
 *
 * A form posts only the locale and fields it shows (the category form:
 * `en.{name,description,descriptionLong}`), while the column also holds what
 * other writers put there — another locale, a field the form has no input for.
 * Writing the submission over the column dropped all of that on every save.
 * Here a submitted field wins, so an emptied input still clears its own field,
 * and everything not submitted is kept. `null` only when nothing is stored and
 * nothing was sent.
 *
 * Built by spreading, never `bag[locale] = …`: a posted `"__proto__"` key stays
 * an own key instead of re-parenting the result.
 */
export function mergeTranslations(
  stored: unknown,
  submitted: unknown,
): Record<string, unknown> | null {
  const base = asBag(stored);
  const sent = asBag(submitted);
  if (!sent) return base;
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(sent).flatMap(([locale, fields]) => {
        const kept = asBag(own(base, locale));
        const next = asBag(fields);
        // A locale is a bag of fields: a submission that is not one changes
        // nothing, and one that is lands on what is kept, parsed like it.
        if (!next) return kept ? [[locale, kept]] : [];
        return [[locale, { ...(kept ?? {}), ...next }]];
      }),
    ),
  };
}

/**
 * The homepage render prefers `translations[locale].vibeHtml` over the base
 * field. A freshly published mockup must win in EVERY locale, so strip stale
 * per-locale vibeHtml entries (keeping all other translation keys) whenever
 * we set or clear the base field — mockup.set/clear, and a Vibe Sandbox save
 * (`updatePage`), whose posted locale then lands on top.
 */
export function stripVibeHtmlFromTranslations<T>(translations: T): T {
  // Typed structurally, not with Prisma's JSON types: this file is core and ships
  // in `--profile site` scaffolds, which have no generated Prisma client.
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    return translations;
  }
  const out: Record<string, unknown> = {};
  for (const [locale, value] of Object.entries(translations)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const { vibeHtml: _dropped, ...rest } = value as Record<string, unknown>;
      out[locale] = rest;
    } else {
      out[locale] = value;
    }
  }
  return out as T;
}
