import { brand } from "@/brand.config";
import { canonicalPublicPagePath } from "@/lib/canonical-public-routes";

/**
 * The one place a public link is built from (URL0-a).
 *
 * Today the shape of a storefront URL is spelled out at every call site —
 * `/${locale}/product/${slug}` in the sitemap, the product card, the PDP
 * canonical, the feeds, the design packs. That is fine while every shop has the
 * same shape. It stops being fine the day one shop needs its OLD addresses to
 * keep working (a WooCommerce migration: `/hegn/komposithegn/x/` — no locale
 * prefix, a trailing slash, and a path that is not derived from the slug), or
 * the day a single-language site decides `/da/` in front of every URL says
 * nothing to its visitors.
 *
 * So the shape becomes three options in `brand.urls`, and these helpers are the
 * single reader of them. With the block absent — every canary, every scaffold —
 * the helpers reproduce today's strings byte for byte. The engine's own product
 * and category links go through here since URL0-b (a test fails on one built by
 * hand), the design packs since URL0-c, the options start steering routing
 * in URL1/URL2, and a stored `permalink` starts being SERVED (not just linked)
 * in URL5.
 *
 * Deliberately not `server-only`: the design packs and the client-side product
 * card will link through here too.
 */

export type BrandUrlConfig = {
  /**
   * When true, an entity that carries a `permalink` (Product/Category today;
   * the column is filled by the migration import) is linked at that permalink
   * instead of the pattern (`/product/<slug>`). When false — the default — a
   * stored permalink is ignored and every link follows the pattern.
   */
  permalinks: boolean;
  /** Every path ends in `/` (WordPress style). Default false: `/product/x`. */
  trailingSlash: boolean;
  /**
   * "always" (default) puts the locale in front of every path (`/da/...`).
   * "never" drops it — allowed ONLY on a single-locale shop, and NEVER inferred
   * from `locales.length`: a one-language shop keeps `/da/` unless it opts out
   * here (the solbrillen canary is da-only and its URLs carry `/da`).
   */
  localePrefix: "always" | "never";
};

/** What `brand.config.ts` may spell out — every field optional, defaults below. */
export type BrandUrlOptions = Partial<BrandUrlConfig>;

export const URL_DEFAULTS: Readonly<BrandUrlConfig> = Object.freeze({
  permalinks: false,
  trailingSlash: false,
  localePrefix: "always",
});

/** The slice of a brand config these helpers read — `brand` and a test double both fit. */
export type UrlConfigSource = {
  locales: readonly string[];
  urls?: BrandUrlOptions | null;
};

/**
 * Merge `urls` over the defaults and reject the one combination that breaks
 * routing: `localePrefix: "never"` on a shop with more than one locale, where
 * two languages would compete for the same path. Throws with a message that
 * names the fix, so a misconfigured `brand.config.ts` fails loudly at the first
 * link instead of serving the wrong language quietly.
 *
 * Fails at the CALL, never at import: a throwing module takes down every page
 * that imports it, including ones that never build a link.
 */
export function assertUrlConfig(source: UrlConfigSource): BrandUrlConfig {
  const given = source.urls ?? {};
  const resolved: BrandUrlConfig = { ...URL_DEFAULTS };

  if (given.permalinks !== undefined) {
    if (typeof given.permalinks !== "boolean") {
      throw new Error(
        `brand.urls.permalinks must be true or false, got ${JSON.stringify(given.permalinks)}.`,
      );
    }
    resolved.permalinks = given.permalinks;
  }
  if (given.trailingSlash !== undefined) {
    if (typeof given.trailingSlash !== "boolean") {
      throw new Error(
        `brand.urls.trailingSlash must be true or false, got ${JSON.stringify(given.trailingSlash)}.`,
      );
    }
    resolved.trailingSlash = given.trailingSlash;
  }
  if (given.localePrefix !== undefined) {
    if (given.localePrefix !== "always" && given.localePrefix !== "never") {
      throw new Error(
        `brand.urls.localePrefix must be "always" or "never", got ${JSON.stringify(given.localePrefix)}.`,
      );
    }
    resolved.localePrefix = given.localePrefix;
  }

  if (resolved.localePrefix === "never" && source.locales.length !== 1) {
    throw new Error(
      `brand.urls.localePrefix: "never" needs exactly one locale, but brand.locales has ` +
        `${source.locales.length} (${source.locales.join(", ") || "none"}). ` +
        `Keep "always" (the default) on a multi-language shop, or reduce brand.locales ` +
        `to the one language the shop speaks.`,
    );
  }

  return resolved;
}

/** `brand.urls` merged with the defaults; the block may be absent entirely. */
export function resolveUrlConfig(): BrandUrlConfig {
  return assertUrlConfig(brand as unknown as UrlConfigSource);
}

/**
 * The configured locales (`brand.locales`, the list i18n/routing.ts routes by)
 * as a regex alternation — `da|en` on the shipped config. Both proxies and the
 * redirect matcher build their locale patterns from it, so a shop with `["de"]`
 * is read by its own locales, never by a hardcoded pair. No locales (only a
 * test double) gives a pattern that matches nothing, never an empty one.
 */
export const LOCALE_ALTERNATION =
  ((brand as unknown as Partial<UrlConfigSource>).locales ?? [])
    .map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|") || "(?!)";

/** A configured locale as the first segment of a path (`/da`, `/da/x`). */
export const LOCALE_SEGMENT_RE = new RegExp(`^\\/(${LOCALE_ALTERNATION})(?=\\/|$)`);

/**
 * URL1 — the `localePrefix` i18n/routing.ts hands next-intl: "never" only for a
 * literal `urls.localePrefix: "never"` on a shop with exactly one locale, and
 * otherwise `undefined`, so routing passes NO key and next-intl keeps its own
 * default ("always") — the config every canary had before. Never inferred from
 * `locales.length` alone. Never throws, because routing reads it at import
 * (every page imports routing): a "never" on a multi-locale shop is refused by
 * next.config.ts at build and by `assertUrlConfig` at the first link.
 */
export function routingLocalePrefix(
  source: UrlConfigSource = brand as unknown as UrlConfigSource,
): "never" | undefined {
  return source.urls?.localePrefix === "never" && source.locales.length === 1 ? "never" : undefined;
}

/**
 * URL1 — the address an engine path (`/da/about`) is served at: under
 * `localePrefix: "never"` its leading locale is dropped (`/about`), exactly where
 * next-intl would redirect it, so a redirect the proxies build from such a path
 * lands in one hop and a sitemap entry needs none. Unchanged under "always", and
 * for any other path.
 */
export function withoutLocalePrefix(path: string): string {
  if (resolveUrlConfig().localePrefix !== "never") return path;
  const head = `/${(brand as unknown as UrlConfigSource).locales[0]}`;
  const rest = path.slice(head.length);
  if (!path.startsWith(head) || (rest !== "" && !/^[/?#]/.test(rest))) return path;
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/** The pathname, and whatever query/fragment followed it (kept verbatim). */
function splitPathname(path: string): { pathname: string; rest: string } {
  const cut = path.search(/[?#]/);
  return cut === -1
    ? { pathname: path, rest: "" }
    : { pathname: path.slice(0, cut), rest: path.slice(cut) };
}

/**
 * A path with exactly one leading slash and no empty segments, so joining
 * pieces that each brought their own slash can never produce `//`. An absolute
 * URL (the shape WooCommerce's own `permalink` field has) contributes only its
 * pathname, query and fragment.
 */
function normalizePath(raw: string): string {
  // Browsers read `\` as `/` and drop tab/CR/LF inside a URL, so `/\evil.com/x`
  // or `/\n/evil.com/x` would leave the site as a protocol-relative link.
  // Normalise them the way the browser will BEFORE the slashes are collapsed.
  const cleaned = raw.trim().replace(/[\t\n\r]/g, "");
  const cut = cleaned.search(/[?#]/);
  const head = cut === -1 ? cleaned : cleaned.slice(0, cut);
  let path = `${head.replace(/\\/g, "/")}${cut === -1 ? "" : cleaned.slice(cut)}`;
  // A full URL keeps only its path, query and fragment: a permalink is a local
  // address, never another host. (A leading `//` is NOT read as a host — the
  // joins below rely on `//product//x` collapsing to `/product/x`.)
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      // Not a parseable URL after all — treat it as a path.
    }
  }
  const { pathname, rest } = splitPathname(path);
  const collapsed = pathname.replace(/\/{2,}/g, "/").replace(/^\/+/, "");
  return `/${collapsed}${rest}`;
}

/**
 * Prefix `path` with the locale, unless `urls.localePrefix` is "never".
 * `withLocale("/", "da")` is `/da` — the locale home, as today.
 */
export function withLocale(path: string, locale: string): string {
  // One path segment, nothing else: an empty locale would turn `/x` into
  // `//x` — a protocol-relative link to the host `x` — and a slash, backslash,
  // query, fragment or a `.`/`..` segment would smuggle a different path in front of this one.
  // (`{locale}` passes: the hreflang and IndexNow templates use it.)
  if (!/^(?!\.{1,2}$)[^/\\?#\s]+$/.test(locale)) {
    throw new Error(`withLocale needs a single path segment as locale, got ${JSON.stringify(locale)}.`);
  }
  const normalized = normalizePath(path);
  if (resolveUrlConfig().localePrefix === "never") return normalized;
  const { pathname, rest } = splitPathname(normalized);
  const body = pathname === "/" ? "" : pathname;
  return `/${locale}${body}${rest}`;
}

/**
 * Whether a path's last segment is left without a trailing slash under
 * `urls.trailingSlash`: any segment with a dot (`katalog.pdf`, a
 * `%postname%.html` permalink, but also a slug like `v1.2-noter`). It is the
 * one rule for the link (`applyTrailingSlash`), the proxy's redirect
 * (`trailingSlashRedirect`) and a merchant redirect's destination
 * (lib/redirects/match.ts), so all three agree on every slug. A dot, not a
 * file extension, because that is what the running site does: both proxies'
 * matchers skip every path with a dot (it can never be slash-redirected), Next's
 * own slash redirect added a slash only to a segment with no dot at all, and
 * Next leaves the slash off the canonical URL of `/v1.2-noter`.
 */
export function isDottedSegment(segment: string): boolean {
  return segment.includes(".");
}

/**
 * Give `path` exactly the trailing slash `urls.trailingSlash` asks for: strip
 * what it came with, then add one back when the option is on. The root stays
 * `/` either way, a query or fragment is left untouched, and a last segment
 * with a dot (`isDottedSegment`) never gets one — so a link built here is never
 * redirected by the proxy's slash rule (`trailingSlashRedirect` below), and
 * never needs a second hop.
 */
export function applyTrailingSlash(path: string): string {
  const { pathname, rest } = splitPathname(normalizePath(path));
  const bare = pathname.replace(/\/+$/, "");
  if (bare === "") return `/${rest}`;
  const lastSegment = bare.slice(bare.lastIndexOf("/") + 1);
  const wantsSlash = resolveUrlConfig().trailingSlash && !isDottedSegment(lastSegment);
  return `${wantsSlash ? `${bare}/` : bare}${rest}`;
}

/**
 * URL2 — where proxy.ts sends a request under `urls.trailingSlash`, or `null`
 * to serve it at the address as asked. next.config.ts turns Next's own slash
 * redirect off (it has no `/api` exception), so this is the only one: a GET or
 * HEAD for a path without its slash goes to the slash form. A POST is answered
 * where it was sent (a server action or a form must not be asked to resend). A
 * last segment with a dot (`isDottedSegment`), Next's own `/_next` paths and
 * `/.well-known` are not slashed pages, so all three are left alone. The proxy asks
 * only about paths it hands to the storefront — never `/api`, `/admin`,
 * `/oauth`, `/icon` or `/og`.
 */
export function trailingSlashRedirect(pathname: string, method: string): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (!resolveUrlConfig().trailingSlash) return null;
  if (!pathname.startsWith("/") || pathname.endsWith("/")) return null;
  if (/^\/(?:_|\.well-known(?:\/|$))/.test(pathname)) return null;
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return isDottedSegment(lastSegment) ? null : `${pathname}/`;
}

/** An entity that may carry a migrated address next to its slug. */
export type Linkable = { slug: string; permalink?: string | null };

/**
 * A stored permalink is the path WITHOUT the locale (`/hegn/komposithegn/x/`,
 * never `/da/hegn/...`): the locale is added by `withLocale`, exactly as for a
 * pattern, so a stored `/da/...` would be served as `/da/da/...`. A permalink
 * with a `.` or `..` segment is ignored and the pattern used instead — the
 * browser would resolve it out of the locale prefix, to a page the link never
 * named.
 */
function entityPath(entity: Linkable, pattern: string): string {
  const permalink = entity.permalink?.trim();
  if (!permalink || !resolveUrlConfig().permalinks) return pattern;
  const { pathname } = splitPathname(normalizePath(permalink));
  // `%2e` is a dot to the browser's path resolver, so `/%2e%2e/x` climbs too.
  const dotSegment = pathname
    .split("/")
    .map((seg) => seg.replace(/%2e/gi, "."))
    .some((seg) => seg === "." || seg === "..");
  return dotSegment ? pattern : permalink;
}

function finish(path: string, locale: string): string {
  return applyTrailingSlash(withLocale(path, locale));
}

/** `/${locale}/product/${slug}` — or the product's permalink when `urls.permalinks` is on. */
export function productHref(product: Linkable, locale: string): string {
  return finish(entityPath(product, `/product/${product.slug}`), locale);
}

/** `/${locale}/category/${slug}` — or the category's permalink when `urls.permalinks` is on. */
export function categoryHref(category: Linkable, locale: string): string {
  return finish(entityPath(category, `/category/${category.slug}`), locale);
}

/**
 * A CMS page: the trust aliases (`about`, `om-os`, `contact`, `privacy`) keep
 * their predictable routes, everything else lives under `/info/<slug>` — the
 * same table `lib/canonical-public-routes.ts` publishes, read through it so the
 * two can never disagree. That table always speaks WITH a locale, so its answer
 * is unprefixed here and prefixed again by the option.
 */
export function pageHref(slug: string, locale: string): string {
  const prefixed = canonicalPublicPagePath(slug, locale);
  const head = `/${locale}`;
  const unprefixed =
    prefixed === head || prefixed.startsWith(`${head}/`) ? prefixed.slice(head.length) : prefixed;
  return finish(unprefixed, locale);
}

/** `/${locale}/blog/${slug}` — the route `app/[locale]/blog/[slug]` serves. */
export function postHref(slug: string, locale: string): string {
  return finish(`/blog/${slug}`, locale);
}

/**
 * URL2-c — a fixed storefront route with no entity behind it (`/contact`,
 * `/info/terms`, `/produkter`, `/` for the locale home), linked the way the
 * helpers above link theirs: `withLocale`, then `applyTrailingSlash`. It is
 * for the links the engine used to write by hand (the footer, the visible
 * breadcrumbs and their JSON-LD steps, the 404 page), which took a 308 on a
 * shop with `trailingSlash` or `localePrefix: "never"`. With `brand.urls` unset
 * it is `/${locale}${path}` byte for byte, and `/${locale}` for the home.
 */
export function localeHref(path: string, locale: string): string {
  return finish(path, locale);
}
