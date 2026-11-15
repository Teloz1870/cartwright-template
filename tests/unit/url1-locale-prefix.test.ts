import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes, not the minimal tests/shims/next-server.ts:
// next-intl's middleware runs for real below (cookies, rewrites, redirects).
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

import { routingLocalePrefix } from "@/lib/urls";

/**
 * URL1 — `brand.urls.localePrefix: "never"` steers routing, not just the links.
 *
 * Pinned here, with next-intl's REAL middleware behind proxy.ts:
 *  1. Routing reads the option only as an explicit opt-in on a one-locale shop.
 *     A single locale alone never drops the prefix (the solbrillen canary is
 *     da-only and keeps `/da`), and the default leaves the key out entirely, so
 *     next-intl gets the config it had before.
 *  2. Under "never": `/` and `/contact` are served (200, no redirect), `/da/…` is
 *     a permanent 308 to the unprefixed form, the proxy's own redirects land in
 *     one hop, `/api` and `/admin` are untouched, and it composes with
 *     `urls.trailingSlash`. The site profile's proxy does the same.
 *  3. Every locale pattern the proxies and the redirect matcher use is built from
 *     `brand.locales`, not a hardcoded `da|en`.
 *  4. next.config.ts refuses "never" on a multi-locale shop at build.
 *  5. The canonical / og:url and both sitemaps drop the prefix, and every
 *     sitemap entry is served where it is listed.
 *
 * Every brand value a row depends on is set by the row, so the file passes in a
 * scaffold whose own brand.config differs (an en-only scaffold, for one).
 */

const ORIGIN = "https://shop.example";

const NEVER = { locales: ["da"], defaultLocale: "da", urls: { localePrefix: "never" } };
const neverWith = (urls: Record<string, unknown>) => ({ ...NEVER, urls: { ...NEVER.urls, ...urls } });
const ALWAYS = { locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } };

async function mockBrand(patch: Record<string, unknown>) {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, ...patch } }));
  return actual.brand;
}

async function mockRealNextServer() {
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
}

afterEach(() => {
  for (const mod of [
    "@/brand.config",
    "@/lib/db",
    "@/lib/brand",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
    "@upstash/redis",
    "@upstash/ratelimit",
  ]) {
    vi.doUnmock(mod);
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ── 1. routing ────────────────────────────────────────────────────────────────

describe("routingLocalePrefix — an explicit opt-in on a one-locale shop, nothing else", () => {
  it('is "never" only for a literal "never" with exactly one locale', () => {
    expect(routingLocalePrefix({ locales: ["da"], urls: { localePrefix: "never" } })).toBe("never");
  });

  it("is never inferred from a single locale (the da-only canary keeps /da)", () => {
    for (const urls of [undefined, null, {}, { localePrefix: "always" as const }]) {
      expect(routingLocalePrefix({ locales: ["da"], urls }), JSON.stringify(urls)).toBeUndefined();
    }
  });

  it("does not throw on a multi-locale shop — next.config.ts and the first link refuse it", () => {
    expect(routingLocalePrefix({ locales: ["da", "en"], urls: { localePrefix: "never" } })).toBeUndefined();
    expect(routingLocalePrefix({ locales: [], urls: { localePrefix: "never" } })).toBeUndefined();
  });
});

async function loadRouting(patch: Record<string, unknown>) {
  vi.resetModules();
  await mockBrand(patch);
  return (await import("@/i18n/routing")).routing as Record<string, unknown>;
}

describe("i18n/routing.ts — next-intl gets localePrefix only under an explicit never", () => {
  it("leaves the key out by default, so the config is the one it was", async () => {
    for (const patch of [ALWAYS, { locales: ["da"], defaultLocale: "da", urls: undefined }]) {
      const routing = await loadRouting(patch);
      expect(Object.keys(routing).sort()).toEqual(["defaultLocale", "locales"]);
    }
  });

  it("leaves it out with the shipped brand.config (every canary)", async () => {
    vi.resetModules();
    const { brand } = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    const { routing } = await import("@/i18n/routing");
    if ((brand.urls as { localePrefix?: string } | undefined)?.localePrefix !== "never") {
      expect("localePrefix" in routing).toBe(false);
    }
  });

  it('passes "never" on a one-locale shop that opts out', async () => {
    const routing = await loadRouting(NEVER);
    expect(routing.localePrefix).toBe("never");
  });

  it("imports cleanly, and keeps the prefix, when never is set on two locales", async () => {
    const routing = await loadRouting({ ...ALWAYS, urls: { localePrefix: "never" } });
    expect("localePrefix" in routing).toBe(false);
  });
});

// ── 2. the proxies, with next-intl's real middleware ───────────────────────────

type Handler = (req: NextRequest) => Promise<Response> | Response;

const request = (path: string, method = "GET") =>
  Object.assign(new NextRequest(new URL(path, ORIGIN), { method }), { auth: null });

const strip = (value: string | null) => (value ? value.replace(ORIGIN, "") : null);

async function hit(proxy: Handler, path: string, method = "GET") {
  const res = await proxy(request(path, method));
  return {
    status: res.status,
    location: strip(res.headers.get("location")),
    rewrite: strip(res.headers.get("x-middleware-rewrite")),
  };
}

async function loadProxy(patch: Record<string, unknown>): Promise<Handler> {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  await mockRealNextServer();
  await mockBrand(patch);
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
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

async function loadStaticProxy(patch: Record<string, unknown>): Promise<Handler> {
  vi.resetModules();
  await mockRealNextServer();
  await mockBrand(patch);
  return (await import("@/proxy.static")).default as unknown as Handler;
}

describe('proxy.ts under localePrefix: "never" — pages answer without the locale', () => {
  it("serves / and every storefront path directly — no redirect to /da", async () => {
    const proxy = await loadProxy(NEVER);
    expect(await hit(proxy, "/")).toEqual({ status: 200, location: null, rewrite: "/da" });
    expect(await hit(proxy, "/contact")).toEqual({ status: 200, location: null, rewrite: "/da/contact" });
    expect((await hit(proxy, "/product/komposit-x")).rewrite).toBe("/da/product/komposit-x");
    expect((await hit(proxy, "/account/login")).rewrite).toBe("/da/account/login");
  });

  it("sends a prefixed address to its unprefixed form with a permanent 308, query kept", async () => {
    const proxy = await loadProxy(NEVER);
    expect(await hit(proxy, "/da/contact?ref=x")).toMatchObject({ status: 308, location: "/contact?ref=x" });
    expect(await hit(proxy, "/da")).toMatchObject({ status: 308, location: "/" });
    expect(await hit(proxy, "/da/")).toMatchObject({ status: 308, location: "/" });
  });

  it("its own redirects drop the locale too, so each lands in one hop", async () => {
    const proxy = await loadProxy(NEVER);
    for (const from of ["/da/info/om-os", "/info/om-os"]) {
      expect(await hit(proxy, from), from).toMatchObject({ status: 301, location: "/about" });
    }
    expect(await hit(proxy, "/da/kurv?x=1")).toMatchObject({ status: 301, location: "/cart?x=1" });
    expect(await hit(proxy, "/kurv")).toMatchObject({ status: 301, location: "/cart" });
    expect(await hit(proxy, "/da/gammel")).toMatchObject({ status: 301, location: "/ny" });
    expect(await hit(proxy, "/gammel")).toMatchObject({ status: 301, location: "/ny" });
  });

  it("leaves /api alone and still gates /admin and /account", async () => {
    const proxy = await loadProxy(NEVER);
    expect(await hit(proxy, "/api/health")).toEqual({ status: 200, location: null, rewrite: null });
    expect(await hit(proxy, "/api/webhook/stripe", "POST")).toEqual({ status: 200, location: null, rewrite: null });
    expect((await hit(proxy, "/admin")).location).toBe("/account/login");
    expect((await hit(proxy, "/account/orders")).location).toBe("/account/login");
  });

  it("composes with urls.trailingSlash: one hop to the unprefixed slash form", async () => {
    // next-intl reads Next's trailingSlash from this variable, which its plugin
    // sets from next.config.ts at build.
    vi.stubEnv("_next_intl_trailing_slash", "true");
    const proxy = await loadProxy(neverWith({ trailingSlash: true }));
    expect(await hit(proxy, "/da/contact")).toMatchObject({ status: 308, location: "/contact/" });
    expect(await hit(proxy, "/contact")).toMatchObject({ status: 308, location: "/contact/" });
    expect(await hit(proxy, "/contact/")).toMatchObject({ status: 200, location: null });
    expect(await hit(proxy, "/")).toMatchObject({ status: 200, location: null });
    expect((await hit(proxy, "/da/info/om-os")).location).toBe("/about/");
    expect((await hit(proxy, "/da/kurv")).location).toBe("/cart/");
    expect((await hit(proxy, "/gammel")).location).toBe("/ny/");
    expect((await hit(proxy, "/api/cron/backup")).location).toBeNull();
  });
});

describe('proxy.ts under "always" — every response is what it was', () => {
  it("redirects a locale-less path to the default locale and serves the prefixed one", async () => {
    const proxy = await loadProxy(ALWAYS);
    expect(await hit(proxy, "/")).toMatchObject({ status: 307, location: "/da" });
    expect(await hit(proxy, "/contact")).toMatchObject({ status: 307, location: "/da/contact" });
    expect(await hit(proxy, "/da/contact")).toEqual({ status: 200, location: null, rewrite: null });
    expect((await hit(proxy, "/da/info/om-os")).location).toBe("/da/about");
    expect((await hit(proxy, "/da/kurv")).location).toBe("/da/cart");
    expect((await hit(proxy, "/da/gammel")).location).toBe("/da/ny");
  });

  it("a one-locale shop that did not opt out keeps /da (the solbrillen canary)", async () => {
    for (const urls of [undefined, { localePrefix: "always" }]) {
      const proxy = await loadProxy({ locales: ["da"], defaultLocale: "da", urls });
      expect(await hit(proxy, "/"), JSON.stringify(urls)).toMatchObject({ status: 307, location: "/da" });
      expect((await hit(proxy, "/da/contact")).location).toBeNull();
    }
  });
});

describe("proxy.static.ts — the site profile routes the same way", () => {
  it('serves unprefixed pages and 308s prefixed ones under "never"', async () => {
    const proxy = await loadStaticProxy(NEVER);
    expect(await hit(proxy, "/")).toEqual({ status: 200, location: null, rewrite: "/da" });
    expect(await hit(proxy, "/da/contact")).toMatchObject({ status: 308, location: "/contact" });
    expect((await hit(proxy, "/info/om-os")).location).toBe("/about");
    expect((await hit(proxy, "/da/kurv")).location).toBe("/cart");
  });

  it('is unchanged under "always"', async () => {
    const proxy = await loadStaticProxy(ALWAYS);
    expect(await hit(proxy, "/")).toMatchObject({ status: 307, location: "/da" });
    expect((await hit(proxy, "/da/contact")).location).toBeNull();
  });
});

// ── 3. locale patterns come from brand.locales ─────────────────────────────────

describe("locale patterns — built from brand.locales, never a hardcoded da|en", () => {
  const GERMAN = { locales: ["de"], defaultLocale: "de", urls: undefined };

  it("the redirect matcher strips and keeps the shop's own locale", async () => {
    vi.resetModules();
    await mockBrand(GERMAN);
    const { matchRedirect, LOCALE_RE } = await import("@/lib/redirects/match");
    const map = { "/gammel": { to: "/ny", status: 301 } };
    expect(matchRedirect("/de/gammel", map)?.to).toBe("/de/ny");
    expect(matchRedirect("/da/gammel", map)).toBeNull();
    expect(LOCALE_RE.test("/de/x")).toBe(true);
    expect(LOCALE_RE.test("/da/x")).toBe(false);
  });

  it("the proxy's legacy-slug and /admin rules read it too", async () => {
    const proxy = await loadProxy(GERMAN);
    expect(await hit(proxy, "/de/kurv")).toMatchObject({ status: 301, location: "/de/cart" });
    expect((await hit(proxy, "/de/admin")).location).toBe("/account/login");
    const site = await loadStaticProxy(GERMAN);
    expect((await hit(site, "/de/kurv")).location).toBe("/de/cart");
  });
});

describe("withoutLocalePrefix — the address an engine path is served at", () => {
  it('drops a leading locale under "never" and nothing else', async () => {
    vi.resetModules();
    await mockBrand(NEVER);
    const { withoutLocalePrefix } = await import("@/lib/urls");
    expect(withoutLocalePrefix("/da/about")).toBe("/about");
    expect(withoutLocalePrefix("/da")).toBe("/");
    expect(withoutLocalePrefix("/da/")).toBe("/");
    expect(withoutLocalePrefix("/da?x=1")).toBe("/?x=1");
    for (const path of ["/dansk", "/about", "/", "https://example.com/da/x"]) {
      expect(withoutLocalePrefix(path), path).toBe(path);
    }
  });

  it('is the identity under "always"', async () => {
    vi.resetModules();
    await mockBrand(ALWAYS);
    const { withoutLocalePrefix } = await import("@/lib/urls");
    expect(withoutLocalePrefix("/da/about")).toBe("/da/about");
  });
});

// ── 4. next.config.ts ──────────────────────────────────────────────────────────

type NextConfigLike = { redirects?: () => Promise<{ source: string; destination: string }[]> };

async function loadNextConfig(patch: Record<string, unknown>): Promise<NextConfigLike> {
  vi.resetModules();
  await mockBrand(patch);
  return (await import("@/next.config")).default as NextConfigLike;
}

describe("next.config.ts — the build refuses never on two locales", () => {
  it("throws, naming the fix", async () => {
    await expect(loadNextConfig({ ...ALWAYS, urls: { localePrefix: "never" } })).rejects.toThrow(
      /localePrefix: "never" needs exactly one locale/,
    );
  });

  it("points the om-os alias at /about with or without the locale, in one hop", async () => {
    for (const [patch, destination] of [
      [NEVER, "/about"],
      [neverWith({ trailingSlash: true }), "/about/"],
    ] as const) {
      const redirects = await (await loadNextConfig(patch)).redirects!();
      const omOs = redirects.find((r) => r.source.endsWith("/om-os"))!;
      expect(omOs.destination).toBe(destination);
      // Next's own matcher for config redirects.
      const match = getPathMatch(omOs.source, { removeUnnamedParams: true, strict: true });
      expect(match("/om-os")).not.toBe(false);
      expect(match("/da/om-os")).not.toBe(false);
      expect(match("/en/om-os")).toBe(false);
    }
  });

  it("sends the alias nowhere in a profile without the about page (trust-pages pruned)", async () => {
    vi.resetModules();
    const actual = await vi.importActual<typeof import("@/lib/profile-capabilities")>("@/lib/profile-capabilities");
    vi.doMock("@/lib/profile-capabilities", () => ({
      profileCapabilities: { ...actual.profileCapabilities, trustPages: false },
    }));
    await mockBrand(NEVER);
    const config = (await import("@/next.config")).default as NextConfigLike;
    expect((await config.redirects!()).map((r) => r.source)).toEqual(["/favicon.ico"]);
    vi.doUnmock("@/lib/profile-capabilities");
  });

  it('keeps the locale-preserving om-os redirect under "always"', async () => {
    const redirects = await (await loadNextConfig(ALWAYS)).redirects!();
    expect(redirects.find((r) => r.source.endsWith("/om-os"))).toEqual({
      source: "/:locale(da|en)/om-os",
      destination: "/:locale/about",
      permanent: true,
    });
  });
});

// ── 5. canonical, og:url and the sitemaps ───────────────────────────────────────

describe("canonical and og:url drop the prefix under never", () => {
  async function load(patch: Record<string, unknown>) {
    vi.resetModules();
    await mockBrand(patch);
    vi.doMock("@/lib/brand", () => ({
      getBrand: async () => ({
        storeName: "Example Shop",
        url: `${ORIGIN}/`,
        metadata: { title: "Example Shop", description: "A description." },
      }),
    }));
    return {
      ...(await import("@/lib/localized-page-metadata")),
      ...(await import("@/lib/homepage-metadata")),
      ...(await import("@/lib/contact-metadata")),
    };
  }

  const pageInput = {
    locale: "da",
    pathTemplate: "/{locale}/services/hegn",
    baseUrl: ORIGIN,
    siteName: "Example Shop",
    title: "Hegn",
    description: "Hegn på mål.",
  };

  it("never: the canonical is the unprefixed address the shop serves", async () => {
    const m = await load(NEVER);
    const page = m.buildLocalizedPageMetadata(pageInput);
    expect(page.alternates?.canonical).toBe(`${ORIGIN}/services/hegn`);
    expect((page.openGraph as { url?: string }).url).toBe(`${ORIGIN}/services/hegn`);
    expect(m.buildLocalizedPageMetadata({ ...pageInput, pathTemplate: "/{locale}" }).alternates?.canonical).toBe(
      `${ORIGIN}/`,
    );
    const home = await m.buildHomepageMetadata("da");
    expect(home.alternates?.canonical).toBe(`${ORIGIN}/`);
    expect((home.openGraph as { url?: string }).url).toBe(`${ORIGIN}/`);
    expect((await m.buildContactMetadata("da")).alternates?.canonical).toBe(`${ORIGIN}/contact`);
  });

  it("always: every canonical is the string it was", async () => {
    const m = await load(ALWAYS);
    expect(m.buildLocalizedPageMetadata(pageInput).alternates?.canonical).toBe(`${ORIGIN}/da/services/hegn`);
    expect(m.buildLocalizedPageMetadata({ ...pageInput, pathTemplate: "/{locale}" }).alternates?.canonical).toBe(
      `${ORIGIN}/da`,
    );
    expect((await m.buildHomepageMetadata("da")).alternates?.canonical).toBe(`${ORIGIN}/da`);
    expect((await m.buildContactMetadata("da")).alternates?.canonical).toBe(`${ORIGIN}/da/contact`);
  });
});

describe("llms.txt and JSON-LD carry the addresses the shop serves", () => {
  async function llmsTxt(patch: Record<string, unknown>): Promise<string> {
    vi.resetModules();
    await mockBrand(patch);
    vi.doMock("@/lib/brand", () => ({
      getBrand: async () => ({
        url: ORIGIN,
        storeName: "Test Shop",
        defaultLocale: "da",
        locales: patch.locales,
        tagline: "A test shop",
        metadata: { description: "A test shop" },
        policies: { currency: "DKK", country: "DK" },
        ecommerceEnabled: true,
        features: { mcpPublic: true, webMcp: true, acp: false, a2a: false, merchantFeed: false },
      }),
    }));
    vi.doMock("@/lib/feature-flags/status", () => ({ getFeatureView: async () => ({ features: [] }) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        brandingSettings: { findUnique: async () => null },
        page: { findMany: async () => [] },
      },
    }));
    const { GET } = await import("@/app/llms.txt/route");
    return (await GET()).text();
  }

  it("never: every page link in llms.txt is unprefixed", async () => {
    const text = await llmsTxt(NEVER);
    for (const path of ["/produkter", "/developers", "/webmcp-check", "/contact", "/info/terms"]) {
      expect(text, path).toContain(`](${ORIGIN}${path})`);
    }
    expect(text).not.toContain(`${ORIGIN}/da/`);
  });

  it("never + trailingSlash: each llms.txt page link is the form the proxy serves", async () => {
    const text = await llmsTxt(neverWith({ trailingSlash: true }));
    for (const path of ["/produkter/", "/developers/", "/contact/", "/info/terms/"]) {
      expect(text, path).toContain(`](${ORIGIN}${path})`);
    }
  });

  it("always: llms.txt links keep the prefix", async () => {
    const text = await llmsTxt(ALWAYS);
    expect(text).toContain(`](${ORIGIN}/da/produkter)`);
    expect(text).toContain(`](${ORIGIN}/da/contact)`);
  });

  it("the Service JSON-LD and its breadcrumbs follow the option", async () => {
    const opts = { title: "Hegn", description: "", brandUrl: ORIGIN, brandName: "Shop", locale: "da" };
    const urlsOf = (ld: Array<Record<string, unknown>>) => JSON.stringify(ld).match(/https:\/\/shop\.example[^"]*/g);
    for (const [patch, prefix] of [[NEVER, ""], [ALWAYS, "/da"]] as const) {
      vi.resetModules();
      await mockBrand(patch);
      const { buildServiceJsonLd } = await import("@/lib/service-jsonld");
      const ld = buildServiceJsonLd({ slug: "hegn", heroImage: null }, opts);
      expect(urlsOf(ld)).toEqual(
        expect.arrayContaining([`${ORIGIN}${prefix}/services/hegn`, `${ORIGIN}${prefix}/services`]),
      );
      if (!prefix) expect(JSON.stringify(ld)).not.toContain(`${ORIGIN}/da`);
    }
  });
});

describe("sitemaps — every entry is served where it is listed", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  const ROWS: Record<string, unknown[]> = {
    category: [{ slug: "hegn" }],
    product: [{ slug: "komposit-x", createdAt: at }],
    page: [{ slug: "levering", updatedAt: at, title: "Levering", metaDescription: null, translations: null }],
    post: [{ slug: "nyhed", updatedAt: at }],
  };

  async function sitemapPaths(patch: Record<string, unknown>, file: "@/app/sitemap" | "@/app/sitemap.static") {
    vi.resetModules();
    const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    await mockBrand({
      ...patch,
      ecommerceEnabled: true,
      mode: "webshop",
      features: { ...actual.brand.features, blog: true, webshop: true },
    });
    vi.doMock("@/lib/db", () => ({
      prisma: new Proxy(
        {},
        { get: (_target, model) => ({ findMany: async () => ROWS[String(model)] ?? [] }) },
      ),
    }));
    const { default: sitemap } = await import(file);
    return (await sitemap()).map((entry: { url: string }) => new URL(entry.url).pathname) as string[];
  }

  it("never: no entry carries the locale, and the proxy serves each one directly", async () => {
    const paths = await sitemapPaths(NEVER, "@/app/sitemap");
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/about", "/info/levering", "/blog/nyhed", "/product/komposit-x", "/category/hegn"]),
    );
    expect(paths.filter((p) => p === "/da" || p.startsWith("/da/"))).toEqual([]);
    const proxy = await loadProxy(NEVER);
    for (const path of paths) {
      expect((await hit(proxy, path)).location, `${path} is redirected`).toBeNull();
    }
  });

  it("never + trailingSlash: every entry is the unprefixed slash form", async () => {
    const paths = await sitemapPaths(neverWith({ trailingSlash: true }), "@/app/sitemap");
    expect(paths).toEqual(expect.arrayContaining(["/", "/about/", "/product/komposit-x/", "/blog/nyhed/"]));
    expect(paths.filter((p) => p.startsWith("/da") || !p.endsWith("/"))).toEqual([]);
  });

  it("the site profile's sitemap: unprefixed, and served by proxy.static.ts as listed", async () => {
    const paths = await sitemapPaths(NEVER, "@/app/sitemap.static");
    expect(paths).toEqual(expect.arrayContaining(["/", "/info/terms", "/info/cookies"]));
    expect(paths.filter((p) => p === "/da" || p.startsWith("/da/"))).toEqual([]);
    const proxy = await loadStaticProxy(NEVER);
    for (const path of paths) {
      expect((await hit(proxy, path)).location, `${path} is redirected`).toBeNull();
    }
  });

  it("always: the entries are the strings they were", async () => {
    const paths = await sitemapPaths(ALWAYS, "@/app/sitemap");
    expect(paths).toEqual(
      expect.arrayContaining(["/da", "/en", "/da/about", "/da/info/levering", "/en/blog/nyhed", "/da/product/komposit-x"]),
    );
  });
});
