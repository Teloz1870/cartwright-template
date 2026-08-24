/** Canonical trust routes with compatibility for the original CMS URLs. */
const TRUST_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  about: "about",
  "om-os": "about",
  contact: "contact",
  privacy: "privacy",
};

export function canonicalPublicPagePath(slug: string, locale: string): string {
  const canonical = TRUST_ROUTE_ALIASES[slug.toLowerCase()];
  return canonical
    ? `/${locale}/${canonical}`
    : `/${locale}/info/${slug}`;
}

export function isTrustPageSourceSlug(slug: string): boolean {
  return TRUST_ROUTE_ALIASES[slug.toLowerCase()] !== undefined;
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
  const canonical = TRUST_ROUTE_ALIASES[slug];
  return canonical ? `/${locale}/${canonical}` : null;
}
