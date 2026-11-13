import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { brand as shippedBrand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";
import { matchRedirect, type RedirectMap } from "@/lib/redirects/match";
import { resolveAbsoluteUrlWithPathname } from "next/dist/lib/metadata/resolvers/resolve-url";

import { isEngineCheckout } from "../guards/_shared";

/**
 * URL2 — `brand.urls.trailingSlash` steers routing, not just the links.
 *
 * Pinned here:
 *  1. next.config.ts hands Next `trailingSlash` AND `skipTrailingSlashRedirect`
 *     only when the option is a literal `true`, and leaves both keys OUT
 *     otherwise — so every canary (the option is `false`) gets the config it had
 *     before. Next's own slash redirect has no `/api` exception: it 308'd every
 *     Vercel Cron path, webhook and OAuth callback (triad R2).
 *  2. The proxy's own rule (`trailingSlashRedirect`) and its WIRING in proxy.ts
 *     and proxy.static.ts: storefront pages get the slash, `/api`, `/admin`,
 *     `/oauth`, `/icon`, `/og` and a POST never do, and every redirect the proxy
 *     issues already carries the slash (one hop).
 *  3. A link lib/urls.ts builds is a fixed point of that rule, and a merchant
 *     redirect matches with or without the slash.
 *  4. The sitemap — DB-backed entries included, and the site profile's static
 *     one — never points at a 308.
 *  5. One "has a dot" rule decides the slash for the link, the proxy's redirect,
 *     a merchant redirect's destination and Next's own canonical URL.
 *
 * THIS FILE SHIPS. create-cartwright copies tests/unit into every light and
 * full scaffold and runs it there, against the scaffold's own brand.config.ts:
 * `locales: ["en"]`, `defaultLocale: "en"` out of the box, never the engine's
 * da + en. Pinning `/da/...` there turned the release scaffold gate red (run
 * 38062030203, 7 tests, light and full). So:
 *  - anything the proxy, next-intl or a sitemap routes by locale is built from
 *    the shipped `brand.locales` / `brand.defaultLocale` (`LOCALES`, `L`), and
 *    the next-intl stand-in routes by the config each proxy hands it;
 *  - the sitemaps are pinned by structure: with the option on, every entry
 *    carries the slash and the proxy serves it as listed; off, they are the
 *    same entries without it;
 *  - the one engine-only fact (the option ships off on every canary) sits
 *    behind `isEngineCheckout()`.
 * `matchRedirect` is no exception: since URL1 it strips a locale from
 * `brand.locales` (`LOCALE_RE` in lib/redirects/match.ts), not a fixed
 * `(da|en)`, so its fixtures are built from `L` and `OTHER` too. Its `/da/...`
 * fixtures failed 11 tests on an en-only tree after URL1. Only the slash
 * rule's own tests (`trailingSlashRedirect`, `applyTrailingSlash`) keep literal
 * `/da/...` paths: that rule ignores locales, so those strings hold in any tree.
 */

/** The tree's own locales: `["en"]` / `"en"` in a fresh scaffold, `["da", "en"]` / `"da"` in the engine. */
const LOCALES: readonly string[] = [...shippedBrand.locales];
const L: string = shippedBrand.defaultLocale;

/**
 * A configured locale other than the default (`en` in the engine), or the
 * default itself in a single-language tree, so a lookup under a second prefix
 * is pinned wherever the tree has one.
 *
 * Every prefix in this file comes from `brand.locales`, because every matcher
 * it drives does too since URL1: the merchant-redirect lookup (`LOCALE_RE`),
 * the legacy-slug map (`LEGACY_SLUG_RE` in proxy.ts and proxy.static.ts) and
 * next-intl's routing.
 */
const OTHER: string = LOCALES.find((locale) => locale !== L) ?? L;

type Urls = Record<string, unknown> | undefined;

async function mockBrand(urls: Urls, extra: Record<string, unknown> = {}) {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({
    ...actual,
    brand: { ...actual.brand, ...extra, urls },
  }));
  return actual;
}

/**
 * `brand.urls` with only the option under test changed. The other two options
 * are set to their defaults, not read from the tree, because a customer may
 * set them in their own brand.config.ts. The defaults are what the engine
 * ships, so the engine runs exactly the config it did before.
 */
const withSlash = (trailingSlash: boolean) => ({
  permalinks: false,
  localePrefix: "always",
  trailingSlash,
});

afterEach(() => {
  for (const mod of [
    "@/brand.config",
    "@/lib/db",
    "next-auth",
    "@/lib/auth.config",
    "next-intl/middleware",
    "@upstash/redis",
    "@upstash/ratelimit",
  ]) {
    vi.doUnmock(mod);
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

type NextConfigLike = {
  trailingSlash?: boolean;
  skipTrailingSlashRedirect?: boolean;
  redirects?: () => Promise<{ source: string; destination: string }[]>;
};

async function loadNextConfig(urls: Urls): Promise<NextConfigLike> {
  vi.resetModules();
  await mockBrand(urls);
  const { default: config } = await import("@/next.config");
  return config as NextConfigLike;
}

describe("next.config — trailingSlash follows brand.urls, and Next never redirects for it", () => {
  it("the shipped config has both keys exactly when its option is a literal true (off on every canary)", async () => {
    const on = shippedBrand.urls?.trailingSlash === true;
    // Engine-only: the engine and the three canaries ship the option off. A
    // customer's tree may turn it on (a WooCommerce migration does), so there
    // only the config's agreement with brand.config.ts is pinned.
    if (isEngineCheckout()) expect(on, "the engine ships urls.trailingSlash off").toBe(false);
    vi.resetModules();
    const { default: config } = await import("@/next.config");
    expect("trailingSlash" in config).toBe(on);
    expect("skipTrailingSlashRedirect" in config).toBe(on);
  });

  it("leaves both keys out when the block or the field is absent", async () => {
    for (const urls of [undefined, {}]) {
      const config = await loadNextConfig(urls);
      expect("trailingSlash" in config).toBe(false);
      expect("skipTrailingSlashRedirect" in config).toBe(false);
    }
  });

  it("a literal true turns the option on with Next's own redirect off; nothing else does", async () => {
    const on = await loadNextConfig({ trailingSlash: true });
    expect(on.trailingSlash).toBe(true);
    // Without this, Next 308s /api/cron/* to the slash form and Vercel Cron stops.
    expect(on.skipTrailingSlashRedirect).toBe(true);
    for (const notTrue of [false, "true", 1, null]) {
      const config = await loadNextConfig({ trailingSlash: notTrue });
      expect("trailingSlash" in config, JSON.stringify(notTrue)).toBe(false);
      expect("skipTrailingSlashRedirect" in config, JSON.stringify(notTrue)).toBe(false);
    }
  });

  it("its om-os redirect lands on the slash form with the option on, and is unchanged off", async () => {
    const on = await (await loadNextConfig({ trailingSlash: true })).redirects!();
    expect(on.map((r) => r.destination).sort()).toEqual(["/:locale/about/", "/icon"]);
    const off = await (await loadNextConfig({ trailingSlash: false })).redirects!();
    expect(off.map((r) => r.destination).sort()).toEqual(["/:locale/about", "/icon"]);
  });
});

async function loadUrls(trailingSlash: boolean) {
  vi.resetModules();
  await mockBrand(withSlash(trailingSlash));
  return import("@/lib/urls");
}

describe("trailingSlashRedirect — the proxy's one slash rule", () => {
  it("sends a GET or HEAD for a page without its slash to the slash form", async () => {
    const { trailingSlashRedirect } = await loadUrls(true);
    expect(trailingSlashRedirect("/da/contact", "GET")).toBe("/da/contact/");
    expect(trailingSlashRedirect("/da", "HEAD")).toBe("/da/");
    expect(trailingSlashRedirect("/hegn/komposit/x", "GET")).toBe("/hegn/komposit/x/");
  });

  it("leaves the slash form, files, Next internals, .well-known and other methods alone", async () => {
    const { trailingSlashRedirect } = await loadUrls(true);
    for (const path of [
      "/",
      "/da/contact/",
      "/da/info/katalog.pdf",
      "/da/blog/v1.2-noter",
      "/_next/webpack-hmr",
      "/__nextjs_original-stack-frames",
      "/.well-known/x",
      "/.well-known",
    ]) {
      expect(trailingSlashRedirect(path, "GET"), path).toBeNull();
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(trailingSlashRedirect("/da/contact", method), method).toBeNull();
    }
  });

  it("is a no-op with the option off", async () => {
    const { trailingSlashRedirect } = await loadUrls(false);
    expect(trailingSlashRedirect("/da/contact", "GET")).toBeNull();
  });

  it("every link applyTrailingSlash builds is already its target (no second hop)", async () => {
    const { applyTrailingSlash, trailingSlashRedirect } = await loadUrls(true);
    for (const path of [
      "/da/product/hegn",
      "/da/category/komposit",
      "/hegn/komposithegn/x",
      "/da/info/katalog.pdf",
      "/da/blog/v1.2-noter",
      "/da/product/a.b",
      "/da",
      "/da/product/x?farve=sort#top",
    ]) {
      const link = applyTrailingSlash(path).replace(/[?#].*$/, "");
      expect(trailingSlashRedirect(link, "GET"), `${link} would be redirected`).toBeNull();
    }
  });
});

describe("a dotted last segment — one rule for the link, the redirect and the canonical", () => {
  // `v1.2-noter` and `node.js` are slugs, not files, but they carry a dot. The
  // link, the proxy's redirect and a merchant redirect's destination must give
  // each the same form, or a link lands on an address that is never redirected
  // to it (two forms answering 200). The rule is the dot: both proxies' matchers
  // skip every dotted path, and Next leaves the slash off its canonical URL.
  const SEGMENTS = ["hegn", "komposit-x", "katalog.pdf", "side.html", "v1.2-noter", "node.js", "a.b"];

  it.each(SEGMENTS)("%s gets the same form everywhere", async (segment) => {
    const { applyTrailingSlash, isDottedSegment, trailingSlashRedirect } = await loadUrls(true);
    const path = `/${L}/blog/${segment}`;
    const link = applyTrailingSlash(path);
    const slashed = link.endsWith("/");
    expect(slashed).toBe(!isDottedSegment(segment));
    // The proxy's redirect goes exactly where the link points, or nowhere.
    expect(trailingSlashRedirect(path, "GET")).toBe(slashed ? link : null);
    // A merchant redirect to the same page lands on the link.
    const map: RedirectMap = { "/gammel": { to: `/blog/${segment}`, status: 301 } };
    expect(matchRedirect(`/${L}/gammel`, map, { trailingSlash: true })?.to).toBe(link);
    // Next's metadata resolver under `trailingSlash: true` writes the canonical.
    const canonical = resolveAbsoluteUrlWithPathname(path, new URL(ORIGIN), "/", {
      trailingSlash: true,
      isStaticMetadataRouteFile: false,
    });
    expect(canonical).toBe(`${ORIGIN}${link}`);
  });
});

describe("matchRedirect — both forms of a path are one source (URL2)", () => {
  const MAP: RedirectMap = {
    "/gammel": { to: "/ny", status: 301 },
    "/hegn/komposit": { to: "/category/komposit?sort=pris#top", status: 301 },
    "/fil": { to: "/filer/katalog.pdf", status: 302 },
    "/ekstern": { to: "https://example.com/x", status: 301 },
    "/forside": { to: "/", status: 301 },
  };

  it("finds a source stored without a slash when the request carries one", () => {
    expect(matchRedirect("/gammel/", MAP)).toEqual({ to: "/ny", status: 301 });
    expect(matchRedirect(`/${L}/gammel/`, MAP)).toEqual({ to: `/${L}/ny`, status: 301 });
    expect(matchRedirect(`/${OTHER}/hegn/komposit/`, MAP)?.to).toBe(
      `/${OTHER}/category/komposit?sort=pris#top`,
    );
  });

  it("is unchanged for a request without a slash, and the root is still the root", () => {
    expect(matchRedirect("/gammel", MAP)).toEqual({ to: "/ny", status: 301 });
    expect(matchRedirect(`/${L}/gammel`, MAP)).toEqual({ to: `/${L}/ny`, status: 301 });
    expect(matchRedirect("/", MAP)).toBeNull();
    expect(matchRedirect(`/${L}/`, MAP)).toBeNull();
    expect(matchRedirect("/andet/", MAP)).toBeNull();
  });

  it("without the option a destination keeps the form it was stored in", () => {
    expect(matchRedirect(`/${L}/hegn/komposit/`, MAP)?.to).toBe(
      `/${L}/category/komposit?sort=pris#top`,
    );
    expect(matchRedirect(`/${L}/forside`, MAP)?.to).toBe(`/${L}/`);
  });

  it("with the option a relative destination is already the proxy rule's target", async () => {
    const on = { trailingSlash: true };
    expect(matchRedirect(`/${L}/gammel`, MAP, on)?.to).toBe(`/${L}/ny/`);
    expect(matchRedirect(`/${L}/gammel/`, MAP, on)?.to).toBe(`/${L}/ny/`);
    expect(matchRedirect(`/${L}/hegn/komposit/`, MAP, on)?.to).toBe(
      `/${L}/category/komposit/?sort=pris#top`,
    );
    // A file keeps its bare form, the root stays the root, an absolute URL is untouched.
    expect(matchRedirect(`/${L}/fil/`, MAP, on)).toEqual({
      to: `/${L}/filer/katalog.pdf`,
      status: 302,
    });
    expect(matchRedirect(`/${L}/forside/`, MAP, on)?.to).toBe(`/${L}/`);
    expect(matchRedirect("/ekstern/", MAP, on)?.to).toBe("https://example.com/x");

    const { trailingSlashRedirect } = await loadUrls(true);
    for (const from of [`/${L}/gammel`, `/${L}/hegn/komposit/`, `/${L}/fil/`, `/${L}/forside/`]) {
      const to = matchRedirect(from, MAP, on)!.to.replace(/[?#].*$/, "");
      expect(trailingSlashRedirect(to, "GET"), `${to} would take a second hop`).toBeNull();
    }
  });
});

// ── The wiring: proxy.ts and its site-profile twin ─────────────────────────────

const ORIGIN = "https://shop.example";

type IntlRouting = { locales: readonly string[]; defaultLocale: string };

/**
 * A stand-in for next-intl's middleware, as it behaves for routing. It is built
 * from the config each proxy passes to `createMiddleware`, which comes from
 * brand.config.ts, never from a locale list in this file. A path under a
 * configured locale passes. A locale-less path is redirected to the default
 * locale, with the slash.
 */
const intlMiddleware =
  ({ locales, defaultLocale }: IntlRouting) =>
  (req: NextRequest) => {
    const { pathname } = req.nextUrl;
    if (locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))) {
      return NextResponse.next();
    }
    return NextResponse.redirect(
      new URL(`/${defaultLocale}${pathname === "/" ? "" : pathname}/`, ORIGIN),
    );
  };

const request = (path: string, method = "GET") =>
  Object.assign(new NextRequest(new URL(path, ORIGIN), { method }), { auth: null });

type Handler = (req: ReturnType<typeof request>) => Promise<Response> | Response;

const location = (res: Response) => {
  const value = res.headers.get("location");
  return value ? value.replace(ORIGIN, "") : null;
};

async function loadProxy(trailingSlash: boolean): Promise<Handler> {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  await mockBrand(withSlash(trailingSlash));
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  vi.doMock("next-intl/middleware", () => ({ default: intlMiddleware }));
  // A merchant redirect map, served the way lib/redirects/store.ts writes it.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
  vi.doMock("@upstash/redis", () => ({
    Redis: {
      fromEnv: () => ({
        get: async (key: string) =>
          key === "cartwright_redirects" ? { "/gammel": { to: "/ny", status: 301 } } : null,
      }),
    },
  }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      class {
        limit = async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 10_000 });
      },
      { slidingWindow: () => ({}) },
    ),
  }));
  return (await import("@/proxy")).default as unknown as Handler;
}

async function loadStaticProxy(trailingSlash: boolean): Promise<Handler> {
  vi.resetModules();
  await mockBrand(withSlash(trailingSlash));
  vi.doMock("next-intl/middleware", () => ({ default: intlMiddleware }));
  return (await import("@/proxy.static")).default as unknown as Handler;
}

describe("proxy.ts — the slash rule's wiring (URL2)", () => {
  it.each([
    ["GET", "/api/cron/backup"],
    ["GET", "/api/cron/reconcile-stripe"],
    ["POST", "/api/webhook/stripe"],
    ["GET", "/api/auth/callback/google?code=x&state=y"],
    ["POST", "/api/mcp"],
    ["POST", "/oauth/token"],
    ["GET", "/icon"],
    ["GET", "/og?title=x"],
  ])("%s %s answers where it was sent, never with a slash redirect", async (method, path) => {
    const proxy = await loadProxy(true);
    const res = await proxy(request(path, method));
    expect(location(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it("/admin is not slash-redirected — the session check answers it", async () => {
    const proxy = await loadProxy(true);
    const res = await proxy(request("/admin/konto"));
    expect(location(res)).toBe("/account/login");
  });

  it("a storefront page without its slash gets a 308 to the slash form, query kept", async () => {
    const proxy = await loadProxy(true);
    for (const method of ["GET", "HEAD"]) {
      const res = await proxy(request(`/${L}/contact?ref=x`, method));
      expect(res.status, method).toBe(308);
      expect(location(res), method).toBe(`/${L}/contact/?ref=x`);
    }
    const home = await proxy(request(`/${L}`));
    expect([home.status, location(home)]).toEqual([308, `/${L}/`]);
  });

  it("the slash form is served, and a POST is never redirected", async () => {
    const proxy = await loadProxy(true);
    expect(location(await proxy(request(`/${L}/contact/`)))).toBeNull();
    expect(location(await proxy(request(`/${L}/contact`, "POST")))).toBeNull();
  });

  it("a locale-less path takes next-intl's one redirect, not two", async () => {
    const proxy = await loadProxy(true);
    expect(location(await proxy(request("/contact")))).toBe(`/${L}/contact/`);
  });

  it("every redirect the proxy issues itself carries the slash (one hop)", async () => {
    const proxy = await loadProxy(true);
    // Merchant redirect — fails if proxy.ts stops forwarding REDIRECT_OPTIONS.
    expect(location(await proxy(request(`/${L}/gammel`)))).toBe(`/${L}/ny/`);
    expect(location(await proxy(request(`/${L}/gammel/`)))).toBe(`/${L}/ny/`);
    // Trust-page alias (under a configured locale) and legacy Danish slug.
    expect(location(await proxy(request(`/${L}/info/om-os`)))).toBe(`/${L}/about/`);
    expect(location(await proxy(request(`/${L}/kurv?x=1`)))).toBe(`/${L}/cart/?x=1`);
  });

  it("with the option off every response is what it was", async () => {
    const proxy = await loadProxy(false);
    expect(location(await proxy(request(`/${L}/contact`)))).toBeNull();
    expect(location(await proxy(request(`/${L}/gammel`)))).toBe(`/${L}/ny`);
    expect(location(await proxy(request(`/${L}/info/om-os`)))).toBe(`/${L}/about`);
    expect(location(await proxy(request(`/${L}/kurv?x=1`)))).toBe(`/${L}/cart?x=1`);
  });
});

describe("proxy.static.ts — the site profile gets the same rule (URL2)", () => {
  it("slashes pages and its own redirects, never /api or an asset", async () => {
    const proxy = await loadStaticProxy(true);
    const res = await proxy(request(`/${L}/contact`));
    expect([res.status, location(res)]).toEqual([308, `/${L}/contact/`]);
    expect(location(await proxy(request(`/${L}/kurv`)))).toBe(`/${L}/cart/`);
    expect(location(await proxy(request(`/${L}/info/om-os`)))).toBe(`/${L}/about/`);
    expect(location(await proxy(request("/api/inquiries", "POST")))).toBeNull();
    expect(location(await proxy(request("/icon")))).toBeNull();
    expect(location(await proxy(request(`/${L}/contact`, "POST")))).toBeNull();
  });

  it("a locale-less path takes next-intl's one redirect, not two", async () => {
    const proxy = await loadStaticProxy(true);
    expect(location(await proxy(request("/contact")))).toBe(`/${L}/contact/`);
    expect(location(await proxy(request("/")))).toBe(`/${L}/`);
  });

  it("changes nothing with the option off", async () => {
    const proxy = await loadStaticProxy(false);
    expect(location(await proxy(request(`/${L}/contact`)))).toBeNull();
    expect(location(await proxy(request(`/${L}/kurv`)))).toBe(`/${L}/cart`);
  });
});

// ── The sitemap ────────────────────────────────────────────────────────────────

describe("sitemap — no entry points at a 308 (URL2)", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  const ROWS: Record<string, unknown[]> = {
    category: [{ slug: "hegn" }],
    product: [{ slug: "komposit-x", createdAt: at }],
    page: [{ slug: "levering", updatedAt: at, title: "Levering", metaDescription: null, translations: null }],
    post: [{ slug: "nyhed", updatedAt: at }],
  };

  async function sitemapUrls(trailingSlash: boolean): Promise<string[]> {
    vi.resetModules();
    // Blog and shop on, so the DB-backed entries (CMS page, post, product,
    // category) all run through the sitemap, not only the static ones.
    await mockBrand(withSlash(trailingSlash), {
      ecommerceEnabled: true,
      mode: "webshop",
      features: {
        ...(await vi.importActual<typeof import("@/brand.config")>("@/brand.config")).brand.features,
        blog: true,
        webshop: true,
      },
    });
    vi.doMock("@/lib/db", () => ({
      prisma: new Proxy(
        {},
        { get: (_target, model) => ({ findMany: async () => ROWS[String(model)] ?? [] }) },
      ),
    }));
    const { default: sitemap } = await import("@/app/sitemap");
    return (await sitemap()).map((entry) => new URL(entry.url).pathname);
  }

  /**
   * Per configured locale: the home page, the blog index and one entry for each
   * DB-backed kind (CMS page, post, product, category), from `ROWS`. Which other
   * static routes a tree lists (`/changelog`, `/developers`, ...) depends on its
   * profile and flags, so the tests do not pin them. The checks below cover
   * every entry anyway.
   */
  const pinnedEntries = (locale: string) => [
    `/${locale}`,
    `/${locale}/info/levering`,
    `/${locale}/blog`,
    `/${locale}/blog/nyhed`,
    `/${locale}/product/komposit-x`,
    `/${locale}/category/hegn`,
  ];

  /** The entry the option-off sitemap lists in place of `path`: the same one, without the slash. */
  const bare = (path: string) => (path === "/" ? path : path.replace(/\/+$/, ""));

  it("every entry — DB-backed ones included — carries the slash when the option is on, and proxy.ts serves it as listed", async () => {
    const paths = await sitemapUrls(true);
    expect(paths).toEqual(
      expect.arrayContaining(LOCALES.flatMap(pinnedEntries).map((path) => `${path}/`)),
    );
    expect(paths.filter((p) => !p.endsWith("/"))).toEqual([]);
    const proxy = await loadProxy(true);
    for (const path of paths) {
      expect(location(await proxy(request(path))), `${path} is redirected`).toBeNull();
    }
  });

  /** The site profile's sitemap (copied over app/sitemap.ts by the materializer). */
  async function staticSitemapUrls(trailingSlash: boolean): Promise<string[]> {
    vi.resetModules();
    await mockBrand(withSlash(trailingSlash));
    vi.doMock("@/lib/db", () => ({ prisma: new Proxy({}, { get: () => ({}) }) }));
    const { default: sitemap } = await import("@/app/sitemap.static");
    return (await sitemap()).map((entry) => new URL(entry.url).pathname);
  }

  /**
   * Everything the site profile's sitemap lists for one locale: home, `/about`
   * and `/privacy` (only with the trust-pages module, `profileCapabilities`),
   * `/info/terms` and `/info/cookies`. That is five per locale in the engine and
   * in a light or full scaffold.
   */
  const staticEntries = (locale: string) => [
    `/${locale}`,
    ...(Boolean(profileCapabilities.trustPages) ? [`/${locale}/about`, `/${locale}/privacy`] : []),
    `/${locale}/info/terms`,
    `/${locale}/info/cookies`,
  ];

  it("the site profile's sitemap: every entry is served by proxy.static.ts as listed", async () => {
    const paths = await staticSitemapUrls(true);
    expect([...paths].sort()).toEqual(
      LOCALES.flatMap(staticEntries)
        .map((path) => `${path}/`)
        .sort(),
    );
    const proxy = await loadStaticProxy(true);
    for (const path of paths) {
      expect(location(await proxy(request(path))), `${path} is redirected`).toBeNull();
    }
  });

  it("the site profile's sitemap is unchanged with the option off", async () => {
    const on = await staticSitemapUrls(true);
    const off = await staticSitemapUrls(false);
    expect([...off].sort()).toEqual(LOCALES.flatMap(staticEntries).sort());
    expect(off).toEqual(on.map(bare));
  });

  it("and none does with the option off: the same entries, none with the slash", async () => {
    const on = await sitemapUrls(true);
    const off = await sitemapUrls(false);
    expect(off).toEqual(expect.arrayContaining(LOCALES.flatMap(pinnedEntries)));
    expect(off.filter((p) => p.endsWith("/"))).toEqual([]);
    // The option only adds the slash. It never adds or drops an entry.
    expect(off).toEqual(on.map(bare));
  });
});
