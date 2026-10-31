import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes (as in red1-redirects-without-redis.test.ts):
// next-intl's middleware runs for real behind proxy.ts below.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";
import type { MigrationFetcher } from "@/lib/migration/fetch";

/**
 * MIGD `redirect.*` against the REAL proxy.ts, standing in for the new site: how
 * a saved redirect becomes one the site serves, with and without Upstash, and how
 * the checks read what it answers under the two URL shapes a shop can have. Each
 * request goes through the handler (its matcher applied first) and a path it hands
 * on counts as a page. Only the database and Upstash are stand-ins.
 */

const ORIGIN = "https://shop.example.test";
const findMany = vi.fn();
const redisGet = vi.fn();
const products = vi.fn();
const categories = vi.fn();
type Handler = (req: NextRequest) => Promise<Response> | Response;
type Rows = { fromPath: string; toPath: string; statusCode: number }[];

const WOO_URLS = { locales: ["da"], defaultLocale: "da", urls: { localePrefix: "never", trailingSlash: true } };
const DEFAULT_URLS = { locales: ["da", "en"], defaultLocale: "da", urls: { localePrefix: "always" } };

/** The site as a fetcher, one module graph per config: the proxy reads brand.config and UPSTASH_* once. */
async function siteOf(brandOver: Record<string, unknown>, upstash: boolean): Promise<MigrationFetcher> {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", upstash ? "https://stub.upstash.example.test" : "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", upstash ? "stub-token" : "");
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, ...brandOver } }));
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  vi.doMock("@/lib/db", () => ({ prisma: { redirect: { findMany }, product: { findMany: products }, category: { findMany: categories } } }));
  vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: redisGet }) } }));
  vi.doMock("@upstash/ratelimit", () => {
    class Ratelimit {
      static slidingWindow = () => ({});
      limit = async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 10_000 });
    }
    return { Ratelimit };
  });
  const { default: proxy, config } = await import("@/proxy");
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  const answer = (url: string, status: number, location: string | null) =>
    ({ outcome: "answer", url, status, location, contentType: "text/html", body: status === 200 ? "<html>page</html>" : "", truncated: false }) as const;
  return async (url) => {
    const target = new URL(url);
    // Next never runs the proxy here: no page in this test answers a dotted path.
    if (!matcher.test(target.pathname)) return answer(url, 404, null);
    const res = await (proxy as unknown as Handler)(Object.assign(new NextRequest(target), { auth: null }));
    return res.status >= 300 && res.status < 400 ? answer(url, res.status, res.headers.get("location")) : answer(url, 200, null);
  };
}

const checks = () => import("@/lib/migration/checks/redirect");
const toMap = (rows: Rows) => Object.fromEntries(rows.map((r) => [r.fromPath, { to: r.toPath, status: r.statusCode }]));
const hopsOf = (r: { hops: { url: string; status: number }[] }) => r.hops.map((h) => `${h.status} ${h.url.replace(ORIGIN, "")}`);
const row = (fromPath: string, toPath: string, statusCode = 301) => ({ fromPath, toPath, statusCode });

afterEach(() => {
  for (const mod of ["@/lib/db", "@upstash/redis", "@upstash/ratelimit", "@/brand.config", "next/server", "next-auth", "@/lib/auth.config"]) vi.doUnmock(mod);
  for (const fn of [findMany, redisGet, products, categories]) fn.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("a saved redirect on the URL shape a moved Woo shop has (no locale prefix, a trailing slash)", () => {
  const rows = [row("/old", "/new"), row("/campaign", "/new", 302)];

  it("without Upstash the proxy serves it from the table: one hop, then the page, so redirect.imported passes and redirect.active finds it", async () => {
    findMany.mockResolvedValue(rows);
    const fetch = await siteOf(WOO_URLS, false);
    const { classifyRedirect, probeRedirect } = await checks();
    const r = await classifyRedirect(rows[0], { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "landed", status: "pass" });
    expect(hopsOf(r)).toEqual(["301 /old", "200 /new/"]);
    expect(await classifyRedirect(rows[1], { targetOrigin: ORIGIN, fetch })).toMatchObject({ class: "landed", status: "pass" });
    expect(await probeRedirect(rows[0], { targetOrigin: ORIGIN, fetch })).toMatchObject({ answer: "served" });
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("with Upstash the proxy serves it from the Redis map, and the table is not read", async () => {
    redisGet.mockResolvedValue(JSON.stringify(toMap(rows)));
    const fetch = await siteOf(WOO_URLS, true);
    const { classifyRedirect } = await checks();
    expect(await classifyRedirect(rows[0], { targetOrigin: ORIGIN, fetch })).toMatchObject({ class: "landed", status: "pass" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("with Upstash and no map in Redis a row saved in the table is not served: that is what both checks report", async () => {
    findMany.mockResolvedValue(rows);
    redisGet.mockResolvedValue(null);
    const fetch = await siteOf(WOO_URLS, true);
    const { classifyRedirect, probeRedirect, judgeRedirectActive } = await checks();
    // Never redirected to its target: the proxy adds the slash and hands the path on.
    const r = await classifyRedirect(rows[0], { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "wrong-status", status: "fail", http: 308 });
    const { readRedirectStore } = await import("@/lib/redirects/load");
    const { store, map } = await readRedirectStore();
    expect({ store, map }).toEqual({ store: "redis", map: {} });
    const probes = [await probeRedirect(rows[0], { targetOrigin: ORIGIN, fetch })];
    expect(probes[0].answer).toBe("not-served");
    expect(judgeRedirectActive({ saved: rows, store, served: map, probes, sample: 1 })).toMatchObject({ status: "warn", state: "saved-not-active", notActive: { count: 2 } });
  });

  it("without Upstash and a database the proxy cannot read, nothing is served: the map fails soft to empty, which only the site's own answer shows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    findMany.mockRejectedValue(new Error("db down"));
    const fetch = await siteOf(WOO_URLS, false);
    const { probeRedirect } = await checks();
    expect(await probeRedirect(rows[0], { targetOrigin: ORIGIN, fetch })).toMatchObject({ answer: "not-served", detail: expect.stringContaining("HTTP 308") });
  });

  it("a redirect into the sign-in gate is a chain: the CSV's default /account target", async () => {
    const saved = row("/min-konto", "/account");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(WOO_URLS, false);
    const { classifyRedirect } = await checks();
    const r = await classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "chain", status: "fail" });
    expect(hopsOf(r)).toEqual(["301 /min-konto", "307 /account/", "308 /account/login", "200 /account/login/"]);
    // Pointed straight at the page a visitor ends on, it lands.
    const direct = row("/min-konto", "/account/login");
    findMany.mockResolvedValue([direct]);
    const again = await siteOf(WOO_URLS, false);
    expect(await (await checks()).classifyRedirect(direct, { targetOrigin: ORIGIN, fetch: again })).toMatchObject({ class: "landed", status: "pass" });
  });

  it("a source under a legacy slug, in a dotted path, or under /api never answers as saved: the proxy's own rules come first", async () => {
    const saved = [row("/produkt/x", "/new"), row("/old.html", "/new"), row("/api/x", "/new"), row("/q?x=1", "/new")];
    findMany.mockResolvedValue(saved);
    const fetch = await siteOf(WOO_URLS, false);
    const { classifyRedirect } = await checks();
    const [legacy, dotted, api, query] = await Promise.all(saved.map((s) => classifyRedirect(s, { targetOrigin: ORIGIN, fetch })));
    expect(legacy).toMatchObject({ class: "wrong-target", status: "fail" });
    expect(legacy.detail).toContain(`redirects to ${ORIGIN}/product/x/; saved: /new`);
    expect(dotted).toMatchObject({ class: "wrong-status", status: "fail", http: 404 });
    expect(api).toMatchObject({ class: "wrong-status", status: "fail", http: 200 });
    expect(query).toMatchObject({ class: "wrong-status", status: "fail" });
  });

  it("a saved target on another site answers as saved and is left unmeasured", async () => {
    const saved = row("/partner", "https://partner.example.test/x");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(WOO_URLS, false);
    const r = await (await checks()).classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "external", status: "inconclusive" });
    expect(hopsOf(r)).toEqual(["301 /partner"]);
  });

  it("a saved http target on the domain that moves answers as saved, and is left unmeasured too", async () => {
    const saved = row("/feed", "http://old.example.test/feed/google.xml");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(WOO_URLS, false);
    const r = await (await checks()).classifyRedirect(saved, { targetOrigin: ORIGIN, fetch, movingHost: "old.example.test" });
    expect(r).toMatchObject({ class: "external", status: "inconclusive" });
    expect(hopsOf(r)).toEqual(["301 /feed"]);
  });

  it("the same domain on https is measured on the new site, and lands", async () => {
    const saved = row("/feed", "https://old.example.test/news/");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(WOO_URLS, false);
    const r = await (await checks()).classifyRedirect(saved, { targetOrigin: ORIGIN, fetch, movingHost: "old.example.test" });
    expect(r).toMatchObject({ class: "landed", status: "pass" });
    expect(hopsOf(r)).toEqual(["301 /feed", "200 /news/"]);
  });
});

describe("redirect.legacy-shadow reads what the proxy does", () => {
  it("with the permalink branch on, only a stored permalink answers before the legacy slug: a path nothing stores still gets its 301", async () => {
    findMany.mockResolvedValue([]);
    categories.mockResolvedValue([]);
    products.mockResolvedValue([{ slug: "x", permalink: "/produkt/x/" }]);
    const fetch = await siteOf({ ...WOO_URLS, urls: { ...WOO_URLS.urls, permalinks: true } }, false);
    expect(await fetch(`${ORIGIN}/produkt/x/`)).toMatchObject({ status: 200 });
    expect(await fetch(`${ORIGIN}/produkt/y/`)).toMatchObject({ status: 301, location: `${ORIGIN}/product/y/` });
    expect(await fetch(`${ORIGIN}/kontakt/`)).toMatchObject({ status: 301, location: `${ORIGIN}/contact/` });
    const { judgeLegacyShadow } = await checks();
    const { loadPermalinkMap, readPermalinkMap } = await import("@/lib/permalinks/resolve-request");
    const permalinks = await readPermalinkMap();
    expect(permalinks).toEqual(await loadPermalinkMap());
    expect(judgeLegacyShadow({ paths: ["/produkt/x/", "/produkt/y/", "/kontakt/"], permalinks })).toMatchObject({
      status: "fail", permalinkBranch: true, servedByPermalink: 1,
      shadowed: { count: 2, first: [{ path: "/produkt/y/", segment: "produkt" }, { path: "/kontakt/", segment: "kontakt" }] },
    });
  });

  it("with it off, the stored permalink changes nothing: every path under a slug gets the 301", async () => {
    findMany.mockResolvedValue([]);
    const fetch = await siteOf(WOO_URLS, false);
    expect(await fetch(`${ORIGIN}/produkt/x/`)).toMatchObject({ status: 301, location: `${ORIGIN}/product/x/` });
    expect(products).not.toHaveBeenCalled();
    const { judgeLegacyShadow } = await checks();
    expect(judgeLegacyShadow({ paths: ["/produkt/x/"], permalinks: null })).toMatchObject({ status: "fail", permalinkBranch: false, shadowed: { count: 1 } });
  });
});

describe("a saved redirect on the default URL shape (a locale prefix on every page)", () => {
  it("is two hops, 301 then next-intl's 307, so redirect.imported names it a chain, as url.parity does the frozen paths", async () => {
    const saved = row("/old", "/new");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(DEFAULT_URLS, false);
    const { classifyRedirect, probeRedirect } = await checks();
    const r = await classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "chain", status: "fail" });
    expect(hopsOf(r)).toEqual(["301 /old", "307 /new", "200 /da/new"]);
    // The site does serve it, so redirect.active has nothing to say about it.
    expect(await probeRedirect(saved, { targetOrigin: ORIGIN, fetch })).toMatchObject({ answer: "served" });
  });

  it("a saved source with a locale prefix, from before the importer refused one: its target keeps that locale, and it lands", async () => {
    const saved = row("/da/old", "/new");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(DEFAULT_URLS, false);
    const r = await (await checks()).classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "landed", status: "pass" });
    expect(hopsOf(r)).toEqual(["301 /da/old", "200 /da/new"]);
  });

  it("a locale saved in the target is the proxy's to keep, so the row lands on that locale", async () => {
    const saved = row("/uk", "/en/news");
    findMany.mockResolvedValue([saved]);
    const fetch = await siteOf(DEFAULT_URLS, false);
    const r = await (await checks()).classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "landed", status: "pass" });
    expect(hopsOf(r)).toEqual(["301 /uk", "200 /en/news"]);
  });

  it("a Redis map sending that row to another locale is a wrong target, not a landing, however that locale answers", async () => {
    const saved = row("/uk", "/en/news");
    redisGet.mockResolvedValue(JSON.stringify(toMap([row("/uk", "/da/news")])));
    const fetch = await siteOf(DEFAULT_URLS, true);
    expect(await fetch(`${ORIGIN}/da/news`)).toMatchObject({ status: 200 });
    const { classifyRedirect, probeRedirect } = await checks();
    const r = await classifyRedirect(saved, { targetOrigin: ORIGIN, fetch });
    expect(r).toMatchObject({ class: "wrong-target", status: "fail", detail: `redirects to ${ORIGIN}/da/news; saved: /en/news` });
    expect(hopsOf(r)).toEqual(["301 /uk"]);
    expect(await probeRedirect(saved, { targetOrigin: ORIGIN, fetch })).toMatchObject({ answer: "not-served" });
  });
});

describe("readPermalinkMap", () => {
  it("is never cached, and a failure is thrown, while the proxy's own read keeps its 60 s copy and fails soft", async () => {
    await siteOf(WOO_URLS, false);
    categories.mockResolvedValue([]);
    products.mockResolvedValue([{ slug: "x", permalink: "/hegn/x/" }]);
    const { loadPermalinkMap, readPermalinkMap } = await import("@/lib/permalinks/resolve-request");
    const stored = await loadPermalinkMap();
    expect(Object.keys(stored)).toHaveLength(1);
    await loadPermalinkMap();
    expect(products).toHaveBeenCalledTimes(1);

    products.mockResolvedValue([]);
    expect(Object.keys(await readPermalinkMap())).toEqual([]);
    expect(Object.keys(await readPermalinkMap())).toEqual([]);
    expect(products).toHaveBeenCalledTimes(3);
    expect(await loadPermalinkMap()).toBe(stored);

    products.mockRejectedValue(new Error("db down"));
    await expect(readPermalinkMap()).rejects.toThrow("db down");
    expect(await loadPermalinkMap()).toBe(stored);
  });
});

describe("readRedirectStore", () => {
  it("no Upstash: the Redirect table", async () => {
    findMany.mockResolvedValue([row("/a", "/b", 302)]);
    await siteOf(WOO_URLS, false);
    const { readRedirectStore } = await import("@/lib/redirects/load");
    expect(await readRedirectStore()).toEqual({ store: "database", map: { "/a": { to: "/b", status: 302 } } });
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("Upstash: only the Redis map, a string or a parsed value", async () => {
    await siteOf(WOO_URLS, true);
    const { readRedirectStore } = await import("@/lib/redirects/load");
    redisGet.mockResolvedValueOnce(JSON.stringify({ "/a": { to: "/b", status: 301 } }));
    expect(await readRedirectStore()).toEqual({ store: "redis", map: { "/a": { to: "/b", status: 301 } } });
    redisGet.mockResolvedValueOnce({ "/c": { to: "/d", status: 301 } });
    expect(await readRedirectStore()).toEqual({ store: "redis", map: { "/c": { to: "/d", status: 301 } } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is never cached, and a failure is said out loud, unlike the proxy's own read", async () => {
    await siteOf(WOO_URLS, true);
    const { readRedirectStore, loadRedirectMap } = await import("@/lib/redirects/load");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    redisGet.mockRejectedValue(new Error("connection refused"));
    expect(await loadRedirectMap()).toEqual({});
    expect(await readRedirectStore()).toEqual({ store: "redis", map: null });
    expect(redisGet).toHaveBeenCalledTimes(2);
    redisGet.mockResolvedValue("not json");
    expect(await readRedirectStore()).toEqual({ store: "redis", map: null });
  });

  it("a table that cannot be read is said out loud too", async () => {
    await siteOf(WOO_URLS, false);
    const { readRedirectStore } = await import("@/lib/redirects/load");
    findMany.mockRejectedValue(new Error("db down"));
    expect(await readRedirectStore()).toEqual({ store: "database", map: null });
  });
});
