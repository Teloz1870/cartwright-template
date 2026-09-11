/**
 * Canonical trust routes with compatibility for the original CMS URLs.
 *
 * A `Map`, not an object literal: page slugs are caller-supplied and the slug
 * validators allow `^[a-z0-9-]+$`, so a page may legitimately be called
 * `constructor` — and on an object literal that lookup returns `Object`, a
 * truthy function. Every reader below would then treat an ordinary page as a
 * trust alias and interpolate a function into a URL.
 */
const TRUST_ROUTE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["about", "about"],
  ["om-os", "about"],
  ["contact", "contact"],
  ["privacy", "privacy"],
]);

export function canonicalPublicPagePath(slug: string, locale: string): string {
  const canonical = TRUST_ROUTE_ALIASES.get(slug.toLowerCase());
  return canonical
    ? `/${locale}/${canonical}`
    : `/${locale}/info/${slug}`;
}

/**
 * Every source slug that resolves to one canonical public route, in the order
 * the route itself reads them (`app/[locale]/about/page.tsx` and the MCP
 * `public-trust` resource both read `["about", "om-os"]`).
 *
 * A reader that resolves a slug has to use the same set the router does, or it
 * answers about a different row than the URL it published actually renders.
 */
export function publicPageSourceSlugs(slug: string): string[] {
  const canonical = TRUST_ROUTE_ALIASES.get(slug.toLowerCase());
  if (!canonical) return [slug];
  return [
    canonical,
    ...[...TRUST_ROUTE_ALIASES]
      .filter(([source, target]) => source !== canonical && target === canonical)
      .map(([source]) => source),
  ];
}

export function isTrustPageSourceSlug(slug: string): boolean {
  return TRUST_ROUTE_ALIASES.has(slug.toLowerCase());
}

export function canonicalTrustRedirect(
  pathname: string,
  locales: readonly string[],
): string | null {
  const match = pathname.match(/^\/([^/]+)\/info\/([^/]+)\/?$/);
  if (!match) return null;

  const [, locale, rawSlug] = match;
  if (!locale || !rawSlug || !locales.includes(locale)) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug).toLowerCase();
  } catch {
    return null;
  }
  const canonical = TRUST_ROUTE_ALIASES.get(slug);
  return canonical ? `/${locale}/${canonical}` : null;
}
