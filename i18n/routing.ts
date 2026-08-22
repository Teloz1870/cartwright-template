import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';
import {brand} from '@/brand.config';

export const routing = defineRouting({
  // Sourced from brand.config so a clone adds a language in ONE place
  // (e.g. ["da", "en", "de"]). LOCALE_TAGS + hreflangFor below already cover
  // de/sv/no, so wider hreflang lights up automatically.
  locales: [...brand.locales],
  // Used when no locale matches
  defaultLocale: brand.defaultLocale
});

/**
 * Runtime guard for the dynamic `[locale]` segment.
 *
 * Next.js can otherwise treat an unknown one-segment path (for example an
 * OpenAPI URL removed by the `site` scaffold profile) as a locale and render
 * the homepage with a misleading 200 response. Keep the guard derived from
 * `brand.locales` so forks only have one locale source of truth.
 */
export function isSupportedLocale(locale: string): boolean {
  return (routing.locales as readonly string[]).includes(locale);
}

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);

/**
 * Phase 10 Slice 6 — hreflang alternates til generateMetadata.
 *
 * Genererer { 'da-DK': url, 'en': url, 'x-default': url } map for et givent
 * path-template. Bruges på PDP + kategori-sider så Google forstår at /da/produkt/x
 * og /en/produkt/x er samme indhold på forskellige sprog.
 *
 * `path` skal indeholde `{locale}` placeholder. Tom map returneres når shoppen
 * kører single-locale (solbriller-canary er da-only) så hreflang ikke giver
 * misvisende signal.
 *
 * Eksempel:
 *   hreflangFor("/{locale}/produkt/foo")
 *   → { 'da-DK': "https://teloz.net/da/produkt/foo", 'en': "...", 'x-default': "..." }
 */
const LOCALE_TAGS: Record<string, string> = {
  da: 'da-DK',
  en: 'en',
  de: 'de-DE',
  sv: 'sv-SE',
  no: 'nb-NO',
};

export function hreflangFor(
  pathTemplate: string,
  baseUrl: string,
): Record<string, string> {
  if (routing.locales.length <= 1) return {};
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const map: Record<string, string> = {};
  for (const locale of routing.locales) {
    const tag = LOCALE_TAGS[locale] ?? locale;
    map[tag] = `${trimmedBase}${pathTemplate.replace('{locale}', locale)}`;
  }
  // x-default peger på default-locale URL'en
  map['x-default'] = `${trimmedBase}${pathTemplate.replace('{locale}', routing.defaultLocale)}`;
  return map;
}
