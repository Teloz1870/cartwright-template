/**
 * Ren redirect-matchning — INGEN prisma/server-only, så proxy.ts (edge) kan
 * importere den. Matcher en pathname mod en redirect-map (locale-uafhængigt) og
 * returnerer destinationen + status, eller null.
 */

export type RedirectRule = { to: string; status: number };
export type RedirectMap = Record<string, RedirectRule>;

/** A `/da` or `/en` segment at the start of a path — what `matchRedirect` strips before the lookup. */
export const LOCALE_RE = /^\/(da|en)(?=\/|$)/;

export function matchRedirect(
  pathname: string,
  map: RedirectMap,
): { to: string; status: number } | null {
  const localeMatch = pathname.match(LOCALE_RE);
  const locale = localeMatch ? localeMatch[0] : ""; // "/da" | "/en" | ""
  const base = locale ? pathname.slice(locale.length) || "/" : pathname;

  // Prøv locale-strippet sti først, så den rå (hvis nogen lagde locale i fromPath).
  const rule = map[base] ?? map[pathname];
  if (!rule) return null;

  let to = rule.to;
  if (!/^https?:\/\//i.test(to)) {
    // Relativ destination → bevar locale-prefix.
    const path = to.startsWith("/") ? to : `/${to}`;
    to = `${locale}${path}`;
  }
  const status = rule.status === 302 ? 302 : 301;
  return { to, status };
}

/** Normalisér en bruger-indtastet fromPath: leading slash, ingen trailing slash. */
export function normalizeFromPath(input: string): string {
  let p = input.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}

/**
 * The source path a RELATIVE destination is looked up under when the reader
 * follows it: the query/hash is not part of the pathname, `matchRedirect`
 * strips the locale prefix before the lookup, and `normalizeFromPath` is how
 * every source is stored. The CSV planner (./import.ts) and the single-create
 * rule (./store.ts) go through this so "is a source" means the same thing at
 * plan time as at request time.
 */
export function stripLocaleAndQuery(path: string): string {
  return relativePathOf(path).replace(LOCALE_RE, "") || "/";
}

/** A relative destination as the router sees it: query/hash off, normalised like a stored source. */
export function relativePathOf(path: string): string {
  return normalizeFromPath(path.replace(/[?#].*$/, ""));
}
