import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes (as in red1-redirects-without-redis.test.ts):
// next-intl's middleware runs for real behind proxy.ts below.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";
// R6: how Next's server matches a next.config.ts redirect (filesystem.js).
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { readFileSync } from "node:fs";
import path from "node:path";
import { configRedirectPatterns, configRedirects } from "@/lib/config-redirects";
import { permalinkKey, resolvePermalinkRewrite } from "@/lib/permalinks/resolve-request";
import { PROXY_SKIPPED_PREFIXES } from "@/lib/urls";

/**
 * URL5-b — with `urls.permalinks` on, a stored permalink is SERVED: the proxy
 * rewrites it to the engine route of the product or category that stores it,
 * in the request's locale, with the query kept. Off, the map is never loaded
 * and no request changes. Pinned here end to end through proxy.ts, against a
 * fake database that returns only the selected fields.
 */

const categoryFindMany = vi.fn();
const productFindMany = vi.fn();
const redirectFindMany = vi.fn();

function mockDb() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      category: { findMany: categoryFindMany },
      product: { findMany: productFindMany },
      redirect: { findMany: redirectFindMany },
    },
  }));
}

afterEach(() => {
  for (const mod of [
    "@/lib/db",
    "@/brand.config",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
    "@/i18n/routing",
    "@upstash/redis",
    "@upstash/ratelimit",
    "@/lib/profile-capabilities",
  ]) {
    vi.doUnmock(mod);
  }
  categoryFindMany.mockReset();
  productFindMany.mockReset();
  redirectFindMany.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

const ORIGIN = "https://shop.example";
type Handler = (req: NextRequest) => Promise<Response> | Response;

type Routing = typeof import("@/i18n/routing")["routing"];

async function loadProxy(
  urls: Record<string, unknown>,
  locales = ["da", "en"],
  patchRouting?: (routing: Routing) => Routing,
  /** R5: Redis configured, holding this admin-set default locale. */
  redisDefaultLocale?: string,
): Promise<Handler> {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", redisDefaultLocale ? "https://stub.upstash.io" : "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", redisDefaultLocale ? "stub-token" : "");
  if (redisDefaultLocale) {
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({
          get: async (key: string) => (key === "cartwright_default_locale" ? redisDefaultLocale : null),
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
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({
    ...actual,
    brand: { ...actual.brand, locales, defaultLocale: locales[0], urls },
  }));
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  if (patchRouting) {
    vi.doMock("@/i18n/routing", async () => {
      const real = await vi.importActual<typeof import("@/i18n/routing")>("@/i18n/routing");
      return { ...real, routing: patchRouting(real.routing) };
    });
  }
  mockDb();
  return (await import("@/proxy")).default as unknown as Handler;
}

function catalogue() {
  categoryFindMany.mockResolvedValue([{ slug: "komposit", permalink: "/hegn/komposithegn/" }]);
  productFindMany.mockResolvedValue([
    { slug: "type-1", permalink: "https://old.example/hegn/komposithegn/type-1/" },
    { slug: "aerø", permalink: "/hegn/ærø-låge/" },
  ]);
  redirectFindMany.mockResolvedValue([{ fromPath: "/hegn/komposithegn/type-1", toPath: "/ny", statusCode: 301 }]);
}

function call(proxy: Handler, path: string, headers?: Record<string, string>) {
  return proxy(Object.assign(new NextRequest(new URL(path, ORIGIN), { headers }), { auth: null }));
}

const rewriteOf = (res: Response) => res.headers.get("x-middleware-rewrite")?.replace(ORIGIN, "");
const localeOf = (res: Response) => res.headers.get("x-middleware-request-x-next-intl-locale");

/**
 * R6: a source from next.config.ts `redirects()` compiled the way Next's
 * server compiles it (server/lib/router-utils/filesystem.js `buildCustomRoute`:
 * strict, case-insensitive, then `modifyRouteRegex` with `/_next` restricted).
 * Next answers these BEFORE proxy.ts runs, so a matching path never reaches it.
 */
function nextRedirectMatch(source: string) {
  return getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (regex) => modifyRouteRegex(regex, ["/_next"]),
  });
}

/** Next's own regex source for a redirect source, as the matcher above builds it. */
function nextRedirectRegex(source: string): string {
  let built = "";
  getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (regex) => (built = modifyRouteRegex(regex, ["/_next"])),
  });
  return built;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

describe("URL5-b — the proxy serves a stored permalink", () => {
  it("rewrites a product permalink to its PDP, in the request's locale, keeping the query", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, "/en/hegn/komposithegn/type-1/?attribute_pa_farve=sort");
    expect(rewriteOf(res)).toBe("/en/product/type-1?attribute_pa_farve=sort");
    expect(localeOf(res)).toBe("en");
    expect(res.headers.get("location")).toBeNull();
  });

  it("answers with and without the trailing slash, and serves a category", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    expect(rewriteOf(await call(proxy, "/da/hegn/komposithegn/type-1"))).toBe("/da/product/type-1");
    const cat = await call(proxy, "/da/hegn/komposithegn/");
    expect(rewriteOf(cat)).toBe("/da/category/komposit");
    expect(localeOf(cat)).toBe("da");
  });

  it("matches a percent-encoded request against a stored non-ASCII permalink", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, `/da/hegn/${encodeURIComponent("ærø-låge")}/`);
    expect(rewriteOf(res)).toBe(`/da/product/${encodeURIComponent("aerø")}`);
  });

  it("serves under localePrefix never, in the shop's only locale", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true, localePrefix: "never" }, ["da"]);
    const res = await call(proxy, "/hegn/komposithegn/type-1/");
    expect(rewriteOf(res)).toBe("/da/product/type-1");
    expect(localeOf(res)).toBe("da");
  });

  it("wins over a merchant redirect from the same path (the permalink rule runs first)", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, "/da/hegn/komposithegn/type-1/");
    expect(res.status).not.toBe(301);
    expect(rewriteOf(res)).toBe("/da/product/type-1");
  });

  it("leaves an unknown path, /api, /admin and /account to the rules after it", async () => {
    catalogue();
    categoryFindMany.mockResolvedValue([
      { slug: "a", permalink: "/account/orders" },
      { slug: "b", permalink: "/admin/x" },
      { slug: "c", permalink: "/api/x" },
    ]);
    const proxy = await loadProxy({ permalinks: true });
    expect(rewriteOf(await call(proxy, "/da/noget-andet")) ?? "").not.toMatch(/\/(product|category)\//);
    for (const path of ["/da/account/orders", "/account/orders", "/admin/x", "/da/admin/x", "/api/x", "/da/api/x"]) {
      const res = await call(proxy, path);
      expect(rewriteOf(res) ?? "").not.toMatch(/\/category\//);
    }
  });

  it("under localePrefix never, /account and /admin stay behind their gates", async () => {
    categoryFindMany.mockResolvedValue([
      { slug: "a", permalink: "/account/orders" },
      { slug: "b", permalink: "/admin/x" },
      { slug: "c", permalink: "/api/x" },
    ]);
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    const proxy = await loadProxy({ permalinks: true, localePrefix: "never" }, ["da"]);
    for (const path of ["/account/orders", "/admin/x", "/api/x"]) {
      expect(rewriteOf(await call(proxy, path)) ?? "").not.toMatch(/\/category\//);
    }
  });

  it("an old link without the locale skips the older redirect rules and goes to next-intl", async () => {
    catalogue();
    categoryFindMany.mockResolvedValue([{ slug: "komposit", permalink: "/kategori/komposit/" }]);
    const proxy = await loadProxy({ permalinks: true });
    // The merchant redirect from the same path does not win…
    const res = await call(proxy, "/hegn/komposithegn/type-1/");
    expect(res.status).not.toBe(301);
    expect(res.headers.get("location")?.replace(ORIGIN, "")).toMatch(/^\/(da|en)\/hegn\/komposithegn\/type-1\/?$/);
    // …and neither does the legacy Danish-slug 301 (/kategori → /category).
    const legacy = await call(proxy, "/kategori/komposit/");
    expect(legacy.headers.get("location")?.replace(ORIGIN, "")).toMatch(/^\/(da|en)\/kategori\/komposit\/?$/);
    // A path that is NOT a permalink keeps the legacy 301, as before.
    const other = await call(proxy, "/kategori/andet/");
    expect(other.status).toBe(301);
    expect(other.headers.get("location")?.replace(ORIGIN, "")).toBe("/category/andet/");
  });

  it("a permalink that only starts like /api, /admin or /account is served (whole segments only)", async () => {
    categoryFindMany.mockResolvedValue([
      { slug: "a", permalink: "/apikultur/" },
      { slug: "b", permalink: "/administration-hegn/" },
      { slug: "c", permalink: "/accounting/" },
    ]);
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    const never = await loadProxy({ permalinks: true, localePrefix: "never" }, ["da"]);
    expect(rewriteOf(await call(never, "/apikultur/"))).toBe("/da/category/a");
    expect(rewriteOf(await call(never, "/administration-hegn"))).toBe("/da/category/b");
    const always = await loadProxy({ permalinks: true });
    expect(rewriteOf(await call(always, "/da/accounting/"))).toBe("/da/category/c");
  });

  it("R2: an old link to /apikultur/ without the locale reaches next-intl, not the /api branch", async () => {
    categoryFindMany.mockResolvedValue([{ slug: "a", permalink: "/apikultur/" }]);
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, "/apikultur/");
    expect(res.headers.get("location")?.replace(ORIGIN, "")).toMatch(/^\/da\/apikultur\/?$/);
    // …and a real /api path is still the /api branch.
    expect((await call(proxy, "/api/health")).headers.get("location")).toBeNull();
  });

  it("R2: an old link to a permalink with /account/ inside it is not sent to the login gate", async () => {
    categoryFindMany.mockResolvedValue([{ slug: "a", permalink: "/hegn/account/x/" }]);
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, "/hegn/account/x/");
    expect(res.headers.get("location")?.replace(ORIGIN, "")).toMatch(/^\/da\/hegn\/account\/x\/?$/);
  });

  it("R2: under trailingSlash the slash rule holds — one address, the other a 308", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true, trailingSlash: true });
    const bare = await call(proxy, "/da/hegn/komposithegn/type-1?q=1");
    expect(bare.status).toBe(308);
    expect(bare.headers.get("location")?.replace(ORIGIN, "")).toBe("/da/hegn/komposithegn/type-1/?q=1");
    expect(rewriteOf(await call(proxy, "/da/hegn/komposithegn/type-1/"))).toBe("/da/product/type-1");
  });

  it("R3: the slash 308 never leaves the shop's origin, even for a //host path", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true, trailingSlash: true, localePrefix: "never" }, ["da"]);
    const url = new URL(ORIGIN);
    url.pathname = "//hegn/komposithegn/type-1";
    const res = await proxy(Object.assign(new NextRequest(url), { auth: null }));
    const location = res.headers.get("location");
    if (location) expect(new URL(location).origin).toBe(ORIGIN);
  });

  it("R3: /oauth, /icon and /og are never looked up as a permalink", async () => {
    categoryFindMany.mockResolvedValue([
      { slug: "a", permalink: "/oauth/authorize/" },
      { slug: "b", permalink: "/icon/" },
      { slug: "c", permalink: "/og/x/" },
    ]);
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    for (const [cfg, paths] of [
      [{ localePrefix: "never" }, ["/oauth/authorize/", "/icon/", "/og/x/"]],
      [{}, ["/da/oauth/authorize/", "/da/icon/", "/da/og/x/"]],
    ] as const) {
      const proxy = await loadProxy({ permalinks: true, ...cfg }, ["da"]);
      for (const path of paths) {
        expect(rewriteOf(await call(proxy, path)) ?? "").not.toMatch(/\/category\//);
      }
    }
  });

  /**
   * R4: the cookie is next-intl's own answer, so every row is compared with
   * what the proxy sends for the PATTERN address of the same page (next-intl
   * runs there) — and pinned on its own, so an empty answer on both sides
   * cannot pass for parity.
   */
  it.each([
    // [headers, next-intl sets NEXT_LOCALE to the page's locale?]
    [{ cookie: "NEXT_LOCALE=da", "sec-fetch-dest": "document" }, true],
    [{ cookie: "NEXT_LOCALE=da", "sec-fetch-dest": "empty" }, false],
    [{ cookie: "NEXT_LOCALE=en" }, false],
    // A first visit: set only when the browser's language is not the page's.
    [{}, true],
    [{ "accept-language": "da-DK,da;q=0.9" }, true],
    [{ "accept-language": "en-GB,en;q=0.9" }, false],
    [{ "accept-language": "da", "sec-fetch-dest": "image" }, false],
  ] as const)("R4: the locale cookie is the one next-intl sets for the page (%j)", async (headers, sets) => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    const permalink = await call(proxy, "/en/hegn/komposithegn/type-1/", headers);
    expect(rewriteOf(permalink)).toBe("/en/product/type-1");
    const pattern = await call(proxy, "/en/product/type-1", headers);
    expect(permalink.headers.getSetCookie()).toEqual(pattern.headers.getSetCookie());
    expect(permalink.headers.getSetCookie()).toEqual(sets ? ["NEXT_LOCALE=en; Path=/; SameSite=lax"] : []);
  });

  it("R4: under localePrefix never the cookie is the shop's one locale, as next-intl sets it", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true, localePrefix: "never" }, ["da"]);
    const rows: Record<string, string>[] = [{ cookie: "NEXT_LOCALE=en" }, { "accept-language": "en" }, {}];
    for (const headers of rows) {
      const permalink = await call(proxy, "/hegn/komposithegn/type-1/", headers);
      expect(rewriteOf(permalink)).toBe("/da/product/type-1");
      const pattern = await call(proxy, "/product/type-1", headers);
      expect(permalink.headers.getSetCookie()).toEqual(pattern.headers.getSetCookie());
    }
    const stale = await call(proxy, "/hegn/komposithegn/type-1/", { cookie: "NEXT_LOCALE=en" });
    expect(stale.headers.getSetCookie()).toEqual(["NEXT_LOCALE=da; Path=/; SameSite=lax"]);
  });

  it("R4: routing's localeCookie: false is respected — no cookie on the permalink, none on the pattern", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true }, ["da", "en"], (routing) => ({ ...routing, localeCookie: false }));
    const headers = { cookie: "NEXT_LOCALE=da", "sec-fetch-dest": "document" };
    const permalink = await call(proxy, "/en/hegn/komposithegn/type-1/", headers);
    expect(rewriteOf(permalink)).toBe("/en/product/type-1");
    expect(permalink.headers.getSetCookie()).toEqual([]);
    expect((await call(proxy, "/en/product/type-1", headers)).headers.getSetCookie()).toEqual([]);
  });

  /**
   * R5: the rewrite builds its cookie answer through the same factory as the
   * intl step (storefrontIntlMiddleware), so the default locale an admin set in
   * Redis counts there too. With no cookie and a browser language the shop does
   * not have (`fr`), next-intl compares the page's locale with the DEFAULT one:
   * an /en page on a shop whose Redis default is `en` gets no cookie, on one
   * whose default is `da` it does.
   */
  it.each([
    ["en", []],
    ["da", ["NEXT_LOCALE=en; Path=/; SameSite=lax"]],
  ] as const)("R5: the default locale set in Redis (%s) decides the cookie, as on the pattern address", async (stored, cookie) => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true }, ["da", "en"], undefined, stored);
    const headers = { "accept-language": "fr" };
    const permalink = await call(proxy, "/en/hegn/komposithegn/type-1/", headers);
    expect(rewriteOf(permalink)).toBe("/en/product/type-1");
    expect(permalink.headers.getSetCookie()).toEqual(cookie);
    expect((await call(proxy, "/en/product/type-1", headers)).headers.getSetCookie()).toEqual(cookie);
  });

  it("a failed read keeps the last map that loaded", async () => {
    vi.useFakeTimers();
    catalogue();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const proxy = await loadProxy({ permalinks: true });
    expect(rewriteOf(await call(proxy, "/da/hegn/komposithegn/type-1/"))).toBe("/da/product/type-1");
    vi.advanceTimersByTime(61_000);
    categoryFindMany.mockRejectedValue(new Error("db blip"));
    expect(rewriteOf(await call(proxy, "/da/hegn/komposithegn/type-1/"))).toBe("/da/product/type-1");
    expect(categoryFindMany).toHaveBeenCalledTimes(2);
  });

  it("off: the catalogue is never read and the redirect still answers as before", async () => {
    catalogue();
    const proxy = await loadProxy({});
    const res = await call(proxy, "/da/hegn/komposithegn/type-1");
    expect(res.status).toBe(301);
    expect(categoryFindMany).not.toHaveBeenCalled();
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("a failing database serves nothing and breaks nothing", async () => {
    categoryFindMany.mockRejectedValue(new Error("db down"));
    productFindMany.mockResolvedValue([]);
    redirectFindMany.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const proxy = await loadProxy({ permalinks: true });
    const res = await call(proxy, "/da/hegn/komposithegn/type-1/");
    expect(rewriteOf(res) ?? "").not.toMatch(/\/product\//);
  });

  it("reads only live products (not deleted, not a draft), and only the two fields it needs", async () => {
    catalogue();
    const proxy = await loadProxy({ permalinks: true });
    await call(proxy, "/da/hegn/komposithegn/type-1/");
    expect(productFindMany).toHaveBeenCalledWith({
      where: { permalink: { not: null }, status: "active", deletedAt: null },
      select: { slug: true, permalink: true },
    });
  });
});

describe("URL5-b — the link helper knows what the proxy skips", () => {
  it("PROXY_SKIPPED_PREFIXES is exactly the matcher's non-dotted exclusions", () => {
    const src = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
    const matcher = src.match(/'\/\(\(\?!([^']*)\)\.\*\)'/)?.[1];
    expect(matcher).toBeDefined();
    const parts = matcher!.split("|").filter((p) => !p.startsWith(".*")); // the dotted rule
    expect(parts).toEqual([...PROXY_SKIPPED_PREFIXES]);
  });

  /**
   * R4 — the helper and the proxy agree, both ways: a permalink is linked
   * exactly when its address passes the proxy's matcher AND the proxy rewrites
   * it to the product. Each mode also pins its own verdicts, so the parity can
   * never hold by both sides saying "no" to everything.
   */
  const CANDIDATES = [
    "/hegn/x/",
    "/heron-hegn/x/",
    "/hero/",
    "/apple-icon-hegn/",
    "/_next/staticx/",
    "/og/x/",
    "/oauth/authorize/",
    "/icon",
    "/admin/x/",
    "/api/x/",
    "/account/orders/",
    "/ogham/",
    "/icons/",
    "/apikultur/",
    "/accounting/",
    "/da/og/x/",
    "/en/api/x/",
    "/hegn/x.html",
    "/1.8m-hegn/",
    // R5: no lookup key — no path of its own, or broken percent-encoding.
    "/",
    "https://old.example/",
    "/?p=123",
    "https://old.example/?product=type-1",
    "/hegn/%E0%A4%A/",
    // R5: the matcher reads `favicon.ico` as a regex (its dot is any character).
    "/favicon-ico-hegn/",
    // R6: next.config.ts redirects `/:locale/om-os` (and under "never" `/om-os`)
    // before the proxy runs — case-insensitively, and a router may decode first
    // (`%4F` is `O`; each spelling here is its own lookup key).
    "/om-os/",
    "/OM-OS/",
    "/%4Fm-os/",
    "/da/om-os/",
    "/om-os-hegn/",
    "/info/om-os/",
    "/favicon.ico",
  ];
  const NO_KEY = ["/", "https://old.example/", "/?p=123", "https://old.example/?product=type-1", "/hegn/%E0%A4%A/"];
  const NOT_LINKED = {
    always: [
      "/og/x/",
      "/oauth/authorize/",
      "/icon",
      "/admin/x/",
      "/api/x/",
      "/account/orders/",
      "/hegn/x.html",
      "/1.8m-hegn/",
      ...NO_KEY,
      "/om-os/",
      "/OM-OS/",
      "/%4Fm-os/",
      "/favicon.ico",
    ],
    never: [
      "/heron-hegn/x/",
      "/hero/",
      "/apple-icon-hegn/",
      "/_next/staticx/",
      "/og/x/",
      "/oauth/authorize/",
      "/icon",
      "/admin/x/",
      "/api/x/",
      "/account/orders/",
      "/da/og/x/",
      "/hegn/x.html",
      "/1.8m-hegn/",
      ...NO_KEY,
      "/favicon-ico-hegn/",
      "/om-os/",
      "/OM-OS/",
      "/%4Fm-os/",
      "/da/om-os/",
      "/favicon.ico",
    ],
    // R6: a profile without the about page has no om-os redirect under
    // "never", so the shop serves — and links — a permalink there.
    "never, no about page": [
      "/heron-hegn/x/",
      "/hero/",
      "/apple-icon-hegn/",
      "/_next/staticx/",
      "/og/x/",
      "/oauth/authorize/",
      "/icon",
      "/admin/x/",
      "/api/x/",
      "/account/orders/",
      "/da/og/x/",
      "/hegn/x.html",
      "/1.8m-hegn/",
      ...NO_KEY,
      "/favicon-ico-hegn/",
      "/favicon.ico",
    ],
  };

  it.each([
    ["always", {}, ["da", "en"], true],
    ["never", { localePrefix: "never" }, ["da"], true],
    ["never, no about page", { localePrefix: "never" }, ["da"], false],
  ] as const)("R4: under %s, a permalink is linked exactly when the proxy serves it", async (mode, cfg, locales, trustPages) => {
    if (!trustPages) {
      const actual = await vi.importActual<typeof import("@/lib/profile-capabilities")>("@/lib/profile-capabilities");
      vi.doMock("@/lib/profile-capabilities", () => ({
        profileCapabilities: { ...actual.profileCapabilities, trustPages: false },
      }));
    }
    categoryFindMany.mockResolvedValue([]);
    productFindMany.mockResolvedValue(CANDIDATES.map((permalink, i) => ({ slug: `p${i}`, permalink })));
    redirectFindMany.mockResolvedValue([]);
    const proxy = await loadProxy({ permalinks: true, ...cfg }, [...locales]);
    const { config } = await import("@/proxy");
    const urls = await import("@/lib/urls");
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    // R6: next.config.ts as Next loads it for this shop (the same mocks).
    const nextConfig = (await import("@/next.config")).default;
    const redirects = (await nextConfig.redirects!()).map((r) => nextRedirectMatch(r.source));
    const notLinked: string[] = [];
    for (const [i, permalink] of CANDIDATES.entries()) {
      const product = { slug: `p${i}`, permalink };
      const linked = urls.permalinkInEffect(product);
      // The address the permalink has once it is linked.
      const address = urls.localeHref(permalink, "da");
      if (linked) expect(urls.productHref(product, "da")).toBe(address);
      const pathname = new URL(address, ORIGIN).pathname;
      // In Next's order: a config redirect (matched as asked — Next's server —
      // or decoded, as a router in front of it may), then the matcher, then
      // the proxy.
      const redirected = redirects.some((match) => match(pathname) !== false || match(safeDecode(pathname)) !== false);
      const served =
        !redirected &&
        matcher.test(pathname) &&
        rewriteOf(await call(proxy, address)) === `/da/product/p${i}`;
      expect({ permalink, linked }).toEqual({ permalink, linked: served });
      if (!linked) notLinked.push(permalink);
    }
    expect(notLinked).toEqual(NOT_LINKED[mode]);
  });

  /**
   * R6: the helper reads next.config.ts's redirects through
   * `configRedirectPatterns`; each pattern is the regex Next builds from the
   * same entry of `configRedirects`, string and flags, for every input the
   * list depends on.
   */
  it("R6: the helper's redirect patterns are the regexes Next builds from the same list", () => {
    let compared = 0;
    for (const locales of [["da", "en"], ["da"], ["de"]]) {
      for (const localePrefixNever of [false, true]) {
        for (const trailingSlash of [false, true]) {
          for (const trustPages of [false, true]) {
            const options = { locales, localePrefixNever, trailingSlash, profileCapabilities: { trustPages } };
            const sources = configRedirects(options).map((r) => r.source);
            const patterns = configRedirectPatterns(options);
            expect(patterns.map((re) => re.source)).toEqual(sources.map(nextRedirectRegex));
            for (const re of patterns) expect(re.flags).toBe("i");
            compared += patterns.length;
          }
        }
      }
    }
    // Both rules were compared, not an empty list against an empty list.
    expect(compared).toBe(3 * (8 + 4 + 2));
  });

  it("R4: off, every candidate links the pattern and the proxy never reads the catalogue", async () => {
    for (const [cfg, locales, head] of [
      [{}, ["da", "en"], "/da"],
      [{ localePrefix: "never" }, ["da"], ""],
    ] as const) {
      categoryFindMany.mockResolvedValue([]);
      productFindMany.mockResolvedValue(CANDIDATES.map((permalink, i) => ({ slug: `p${i}`, permalink })));
      redirectFindMany.mockResolvedValue([]);
      const proxy = await loadProxy({ ...cfg }, [...locales]);
      const urls = await import("@/lib/urls");
      for (const [i, permalink] of CANDIDATES.entries()) {
        expect(urls.permalinkInEffect({ slug: `p${i}`, permalink })).toBe(false);
        expect(urls.productHref({ slug: `p${i}`, permalink }, "da")).toBe(`${head}/product/p${i}`);
      }
      await call(proxy, `${head}/hegn/x/`);
      expect(productFindMany).not.toHaveBeenCalled();
    }
  });
});

describe("URL5-b — permalinkKey and resolvePermalinkRewrite", () => {
  it("one key for every spelling of the same path", () => {
    for (const raw of ["/hegn/x/", "/hegn/x", "hegn//x", "https://old.example/hegn/x/?p=1#a", "\\hegn\\x"]) {
      expect(permalinkKey(raw)).toBe("/hegn/x");
    }
  });

  it("no key for a dot segment, an encoded slash, bad encoding or the root", () => {
    for (const raw of [
      "/a/../b",
      "/a/%2e%2e/b",
      "/a%2Fb",
      "/%E0%A4%A",
      "/",
      "",
      // R5: WooCommerce "Plain" permalinks — a query on the root, no path.
      "/?p=123",
      "https://old.example/?product=type-1",
      "https://old.example/",
    ]) {
      expect(permalinkKey(raw)).toBeNull();
    }
  });

  it("a permalink asked for without a locale is flagged, anything else without one is null", () => {
    const map = { "/hegn/x": { kind: "product" as const, slug: "x" } };
    const routing = { locales: ["da"], defaultLocale: "da" };
    expect(resolvePermalinkRewrite("/hegn/x/", map, routing)).toEqual({ unprefixed: true });
    expect(resolvePermalinkRewrite("/hegn/y", map, routing)).toBeNull();
  });
});
