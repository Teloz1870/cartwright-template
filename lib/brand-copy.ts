import { brand } from "@/brand.config";

/**
 * Per-locale variants for the copy that lives in `brand.config.ts`.
 *
 * The engine has three places customer-visible words come from, and until this
 * existed only one of them could speak more than one language:
 *   1. `messages/{da,en}.json` — locale-aware, but ENGINE copy: a shop cannot
 *      put its own tagline there without editing a file it does not own.
 *   2. `brand.config.ts` — the shop's own identity and copy. One string.
 *   3. the Resolvable Genome (`lib/genome/read.ts`) — AI-resolvable shop copy.
 *      Also one string: `readField` takes a key, not a locale.
 *
 * So a shop serving two locales had no way to say its own assistant button in
 * both. Measured on the eyewear canary: `assistantOpenText: "Spørg Stylisten"`
 * rendered verbatim on /en, and no amount of engine i18n could fix it, because
 * the string is the shop's, not the engine's.
 *
 * The shape is deliberately flat and dotted rather than nested per field:
 * `{ en: { "ai.assistantOpenText": "Ask the stylist" } }`. A shop adds the
 * locales it actually serves, for the fields it actually cares about, in one
 * block it can see at a glance — instead of a `…Translations` sibling scattered
 * beside every string in a 1000-line config.
 *
 * ABSENT ⇒ the base value, exactly as before. This can only add languages; it
 * can never change what a single-locale shop renders.
 */
export type BrandCopyTranslations = Record<string, Record<string, string>>;

/**
 * The shop's own copy for `locale`, falling back to the base value.
 *
 * Pure data in, pure string out — no request context — so the same call works
 * in a Server Component, a client component, an email and a cron job. The
 * caller supplies the locale, because only the caller knows whether it has one.
 */
export function localizedBrandCopy(
  path: string,
  base: string,
  locale: string | undefined,
): string {
  if (!locale || locale === brand.defaultLocale) return base;
  const table = (brand as { copyTranslations?: BrandCopyTranslations })
    .copyTranslations;
  const value = table?.[locale]?.[path];
  return typeof value === "string" && value.length > 0 ? value : base;
}

/**
 * A per-locale variant for `path`, or undefined if the shop supplies none.
 *
 * Separate from `localizedBrandCopy` because callers that ALSO consult the
 * Resolvable Genome need to know whether a translation exists before deciding
 * which source wins — see the note on precedence in components/Footer.tsx.
 */
export function brandCopyTranslation(
  path: string,
  locale: string | undefined,
): string | undefined {
  if (!locale || locale === brand.defaultLocale) return undefined;
  const table = (brand as { copyTranslations?: BrandCopyTranslations })
    .copyTranslations;
  const value = table?.[locale]?.[path];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
