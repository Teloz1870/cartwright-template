import type { IndustryTemplate, SeedPage } from "./types";

/**
 * Seed copy is authored in ONE language per template — declared as
 * `IndustryTemplate.sourceLocale` — with the other languages under
 * `SeedPage.translations`. That is fine right up until a shop's own base
 * locale is NOT the template's source locale.
 *
 * `getDynamicTranslation` (lib/i18n-dynamic.ts) short-circuits to the BASE
 * column whenever the request locale equals `brand.defaultLocale` and never
 * reaches into `translations` for it. So a shop on `defaultLocale: "da"`
 * seeded from an English-source template would render English on its own
 * primary route, and the Danish copy the template ships for it would be
 * unreachable — present in the column, dead to the reader.
 *
 * Rotating at WRITE time is what fixes it: the copy for the shop's base locale
 * becomes the base columns, and the template's source text is demoted into
 * `translations[sourceLocale]` so shops listing that locale still resolve it.
 *
 * Pure and a strict no-op unless all three conditions hold — the template
 * declares a `sourceLocale`, it differs from the shop's base locale, and the
 * page actually carries base-column copy for that base locale. Anything else
 * comes back as the identical object reference.
 */

// The only fields that exist as base columns on Page. Anything else a locale
// carries (metaTitle, metaDescription) is read out of `translations` for EVERY
// locale, base included, so rotating it would be a no-op at best.
const BASE_FIELDS = ["title", "body"] as const;

export function orientSeedPage(
  page: SeedPage,
  sourceLocale: string | undefined,
  defaultLocale: string,
): SeedPage {
  if (!sourceLocale || sourceLocale === defaultLocale) return page;

  const target = page.translations?.[defaultLocale];
  if (!target) return page;

  const swapped = BASE_FIELDS.filter(
    (f) => typeof target[f] === "string" && target[f].length > 0,
  );
  // A locale that only carries meta fields changes nothing about which text
  // renders on the base route — leave the page exactly as authored.
  if (swapped.length === 0) return page;

  const translations: Record<string, Record<string, string>> = {};
  for (const [locale, fields] of Object.entries(page.translations ?? {})) {
    if (locale !== defaultLocale) translations[locale] = { ...fields };
  }

  const oriented: SeedPage = { ...page };
  const demoted: Record<string, string> = { ...(translations[sourceLocale] ?? {}) };

  for (const field of swapped) {
    demoted[field] = page[field];
    oriented[field] = target[field];
  }
  translations[sourceLocale] = demoted;

  // Fields the base locale carried that are NOT base columns stay readable
  // under their own locale key — dropping them would lose copy silently.
  const kept = Object.fromEntries(
    Object.entries(target).filter(
      (entry): entry is [string, string] =>
        !(BASE_FIELDS as readonly string[]).includes(entry[0]),
    ),
  );
  if (Object.keys(kept).length > 0) translations[defaultLocale] = kept;

  oriented.translations = translations;
  return oriented;
}

/** Every page of a template, oriented for the shop's own base locale. */
export function orientSeedPages(
  template: IndustryTemplate,
  defaultLocale: string,
): SeedPage[] {
  return (template.pages ?? []).map((page) =>
    orientSeedPage(page, template.sourceLocale, defaultLocale),
  );
}
