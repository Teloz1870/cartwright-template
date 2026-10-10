/**
 * Ren redirect-matchning — INGEN prisma/server-only, så proxy.ts (edge) kan
 * importere den. Matcher en pathname mod en redirect-map (locale-uafhængigt) og
 * returnerer destinationen + status, eller null.
 */

import { isDottedSegment } from "@/lib/urls";

export type RedirectRule = { to: string; status: number };
export type RedirectMap = Record<string, RedirectRule>;

/** A `/da` or `/en` segment at the start of a path — what `matchRedirect` strips before the lookup. */
export const LOCALE_RE = /^\/(da|en)(?=\/|$)/;

/** Options the proxy reads from `brand.urls` (URL2); absent = today's behaviour. */
export type MatchRedirectOptions = { trailingSlash?: boolean };

export function matchRedirect(
  pathname: string,
  map: RedirectMap,
  options: MatchRedirectOptions = {},
): { to: string; status: number } | null {
  const localeMatch = pathname.match(LOCALE_RE);
  const locale = localeMatch ? localeMatch[0] : ""; // "/da" | "/en" | ""
  const base = locale ? pathname.slice(locale.length) || "/" : pathname;

  // Sources are stored without a trailing slash (`normalizeFromPath`), but with
  // `urls.trailingSlash` on a request may arrive in either form — so the lookup
  // reads both as one. With the option off Next strips the slash first, and the
  // key is the path unchanged.
  // Prøv locale-strippet sti først, så den rå (hvis nogen lagde locale i fromPath).
  const rule = map[withoutTrailingSlash(base)] ?? map[withoutTrailingSlash(pathname)];
  if (!rule) return null;

  let to = rule.to;
  if (!/^https?:\/\//i.test(to)) {
    // Relativ destination → bevar locale-prefix.
    const path = to.startsWith("/") ? to : `/${to}`;
    to = `${locale}${options.trailingSlash ? withSlash(path) : path}`;
  }
  const status = rule.status === 302 ? 302 : 301;
  return { to, status };
}

/** `/a/` → `/a`; the root stays `/`. */
function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/**
 * The form proxy.ts's trailing-slash rule would send `path` to
 * (`trailingSlashRedirect` in lib/urls.ts), so a merchant redirect lands in one
 * hop instead of 301 → 308: a slash is added when the last segment has no dot,
 * and a path that already ends in one, or whose last segment has a dot
 * (`isDottedSegment`, the same rule as the link), is left as it is. Query and
 * fragment stay after the slash.
 */
function withSlash(path: string): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  if (pathname.endsWith("/")) return path;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (last === "" || isDottedSegment(last)) return path;
  return `${pathname}/${rest}`;
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
