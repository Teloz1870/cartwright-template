/**
 * The redirects next.config.ts hands Next (`redirects()`), kept here so the two
 * files that must agree on them read one list (URL5-b R6).
 *
 * Next answers a config redirect BEFORE proxy.ts runs (it applies them ahead of
 * middleware and the filesystem), so a request whose path matches a `source`
 * below is redirected and the proxy never sees it. A stored permalink at such
 * an address (`/om-os/`) can therefore never be served, and lib/urls.ts links
 * it at the pattern instead — which it can only know by reading this same list.
 * next.config.ts builds `redirects()` from `configRedirects`, lib/urls.ts asks
 * `matchesConfigRedirect`, and both derive from `rules` below: a redirect added
 * here is honoured by the link helper the moment it exists.
 *
 * NO imports, not even `@/`: next.config.ts loads this file through Next's own
 * SWC require hook, which resolves a sibling .ts by its relative path but not
 * the tsconfig alias (see the import note there). The callers hand in what they
 * read from brand.config.ts, and lib/profile-capabilities.ts's object as is.
 */

/** What the redirects depend on, as each caller reads it. */
export type ConfigRedirectOptions = {
  /** `brand.locales`, the list i18n/routing.ts routes by. */
  locales: readonly string[];
  /** `brand.urls.localePrefix` is "never". */
  localePrefixNever: boolean;
  /** `brand.urls.trailingSlash` is on. */
  trailingSlash: boolean;
  /** lib/profile-capabilities.ts's object: `trustPages` says the `/about` page exists. */
  profileCapabilities: { readonly trustPages: boolean };
};

/** One entry of `redirects()`, exactly as Next receives it. */
export type ConfigRedirect = { source: string; destination: string; permanent: true };

type Rule = {
  /** A locale segment in front of `path`: none, required, or optional. */
  locale: "none" | "required" | "optional";
  /** The rest of the source: literal text, no parameters. */
  path: string;
  destination: string;
};

function rules(options: ConfigRedirectOptions): Rule[] {
  const { localePrefixNever, trailingSlash, profileCapabilities } = options;
  const list: Rule[] = [
    // `app/icon.tsx` replaced the static favicon, so the conventional
    // `/favicon.ico` every browser and crawler asks for by habit answered
    // with an HTML page instead of an image (lib/locale-exempt.ts). The
    // proxy matcher already excludes `favicon.ico`, so nothing else changes.
    { locale: "none", path: "/favicon.ico", destination: "/icon" },
  ];
  // `om-os` is the Danish alias of the canonical `/about` page
  // (lib/canonical-public-routes.ts), yet `/:locale/om-os` had no route and
  // answered 404. Restricted to the configured locales — `brand.locales` is
  // the single source i18n/routing.ts reads too — so `/xx/om-os` stays a
  // 404 and `/:locale/info/om-os` (three segments) is untouched.
  // With `urls.trailingSlash` on, the destination carries the slash the
  // proxy would add, so `/da/om-os` and `/da/om-os/` both land in one hop
  // (URL2; Next matches a config source with or without its slash).
  // URL1: under `localePrefix: "never"` the page is `/about` and the alias is
  // asked for with or without the locale, so both forms land there in one
  // hop — in a profile that has the page at all.
  if (!localePrefixNever) {
    list.push({ locale: "required", path: "/om-os", destination: trailingSlash ? "/:locale/about/" : "/:locale/about" });
  } else if (Boolean(profileCapabilities.trustPages)) {
    list.push({ locale: "optional", path: "/om-os", destination: trailingSlash ? "/about/" : "/about" });
  }
  return list;
}

/** The `redirects()` array next.config.ts returns. */
export function configRedirects(options: ConfigRedirectOptions): ConfigRedirect[] {
  const locales = options.locales.join("|");
  return rules(options).map((rule) => ({
    source:
      rule.locale === "none"
        ? rule.path
        : `/:locale(${locales})${rule.locale === "optional" ? "?" : ""}${rule.path}`,
    destination: rule.destination,
    permanent: true,
  }));
}

/**
 * Each source as Next's server matches it: compiled by its path-to-regexp
 * (`strict`, case-INsensitive — `/DA/OM-OS` is redirected too) and widened by
 * `modifyRouteRegex` (an optional trailing slash, never `/_next`).
 * `tests/unit/url5b-serve-permalinks.test.ts` pins these patterns to the ones
 * Next builds from `configRedirects`, string for string.
 */
export function configRedirectPatterns(options: ConfigRedirectOptions): RegExp[] {
  const locales = options.locales.join("|");
  return rules(options).map((rule) => {
    const head =
      rule.locale === "none" ? "" : `(?:\\/(${locales}))${rule.locale === "optional" ? "?" : ""}`;
    // path-to-regexp's own escape set, so the pattern is the one Next builds.
    const literal = rule.path.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
    return new RegExp(`^(?!\\/_next)${head}${literal}(?:\\/)?$`, "i");
  });
}

/**
 * Whether Next redirects `pathname` before the proxy runs. Read as asked AND
 * percent-decoded: Next's own server matches the raw path, but a platform
 * router in front of it may decode first (`/da/%6Fm-os` is `/da/om-os`), so a
 * link is kept only when neither spelling is redirected.
 */
export function matchesConfigRedirect(pathname: string, options: ConfigRedirectOptions): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Broken encoding: the raw spelling is the only one.
  }
  return configRedirectPatterns(options).some((re) => re.test(pathname) || re.test(decoded));
}
