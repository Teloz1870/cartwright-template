import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { matchRedirect, type RedirectMap } from "@/lib/redirects/match";
import { createWooClient, type WooRequestInit } from "@/lib/woo/client";
import {
  ENGINE_LEGACY_SEGMENTS,
  buildWooRedirectCsv,
  readWooRedirectLinks,
  type WooRedirectCsv,
} from "@/lib/woo/redirects-csv";
import { STORE_URL, fixtureTransport, wooRedirectLinks, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-6a — the redirect CSV for the WooCommerce addresses with no page of
 * their own. Every CSV is judged by the redirect importer's OWN parser and
 * planner (lib/redirects/import.ts), never by a copy of their rules.
 *
 * Ships in light/full scaffolds (`locales: ["en"]`): the locale prefix is the
 * tree's own default locale, never a literal.
 */

// The planner's module reaches the store, which imports the database client; nothing here touches either.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ withAudit: vi.fn() }));

const L: string = brand.defaultLocale;
const SHOP = "https://shop.example.test";
/** The feed files answer only without a locale, so their rows are absolute on the engine's origin. */
const BLOG_FEED = `${SHOP}/blog/feed.xml`;
const PRODUCT_FEED = `${SHOP}/feed/google.xml`;

/** The importer's verdict on a CSV: what it would save, and every row it refuses. */
async function plan(csv: string, existing: RedirectMap = {}) {
  const { parseRedirectCsv, planRedirectImport } = await import("@/lib/redirects/import");
  const parsed = parseRedirectCsv(csv);
  expect(parsed.error).toBeNull();
  return planRedirectImport(parsed.rows, existing);
}

const pairs = (r: WooRedirectCsv) => r.rows.map((row) => [row.from, row.to]);

describe("buildWooRedirectCsv — the fixture shop", () => {
  it("redirects the system pages, shipping classes and feeds, and nothing the engine serves", () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    expect(pairs(r)).toEqual([
      ["/kasse/", "/checkout"],
      ["/min-konto/", "/account"],
      ["/butik/", "/produkter"],
      ["/fragtklasse/fragtfri/", "/produkter"],
      ["/fragtklasse/palle/", "/produkter"],
      ["/feed/", BLOG_FEED],
      ["/feed/rss/", BLOG_FEED],
      ["/feed/rss2/", BLOG_FEED],
      ["/feed/atom/", BLOG_FEED],
      ["/feed/rdf/", BLOG_FEED],
      ["/comments/feed/", "/"],
      ["/butik/feed/", PRODUCT_FEED],
      ["/lamper/bordlamper/bordlampe-ida/feed/", "/lamper/bordlamper/bordlampe-ida/"],
      ["/lamper/loftlampe-bo/feed/", "/lamper/loftlampe-bo/"],
      ["/sk%c3%a6rme/lampes%c3%a6t-duo/feed/", "/sk%c3%a6rme/lampes%c3%a6t-duo/"],
      ["/lamper/feed/", "/lamper/"],
      ["/lamper/bordlamper/feed/", "/lamper/bordlamper/"],
      ["/lamper/bordlamper/messing/feed/", "/lamper/bordlamper/messing/"],
      ["/sk%c3%a6rme/feed/", "/sk%c3%a6rme/"],
      ["/nye-lamper-til-foraaret/feed/", "/nye-lamper-til-foraaret/"],
    ]);
    // A content page (`om-os`) and the product/category pages themselves answer 200 at their address: never a source.
    const sources = new Set(r.rows.map((row) => row.from));
    for (const p of [...wooSnapshot().products, ...wooSnapshot().categories]) {
      expect(sources.has(new URL(p.permalink).pathname)).toBe(false);
    }
    expect(sources.has("/om-os/")).toBe(false);
    expect(r.rows.every((row) => row.status === 301)).toBe(true);
  });

  it("leaves /kurv/ to the engine, whose legacy map already answers it", () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    expect(r.skipped).toEqual([{ path: "/kurv/", kind: "system-page", reason: "engine-legacy" }]);
  });

  it("passes the importer's planner whole: no refused row, no chain, no loop", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    const p = await plan(r.csv);
    expect(p.errors).toEqual([]);
    expect(p.summary).toMatchObject({ rows: r.rows.length, valid: r.rows.length, invalid: 0 });
  });

  it("is still judged against what is saved: a saved redirect on a destination is reported as the chain it is", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    const p = await plan(r.csv, { "/checkout": { to: "/somewhere", status: 301 } });
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0].reason).toMatch(/\/checkout is itself redirected/);
  });

  it("keeps the reader's locale: destinations carry none, the matcher adds it back", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    const p = await plan(r.csv);
    const map: RedirectMap = Object.fromEntries(p.valid.map((v) => [v.fromPath, { to: v.toPath, status: v.status }]));
    expect(matchRedirect("/kasse/", map)).toEqual({ to: "/checkout", status: 301 });
    expect(matchRedirect(`/${L}/min-konto`, map)).toEqual({ to: `/${L}/account`, status: 301 });
    expect(matchRedirect("/fragtklasse/palle/", map, { trailingSlash: true })).toEqual({ to: "/produkter/", status: 301 });
  });

  it("sends a feed to its locale-less file whatever locale the request carries (W21-live-6a R3)", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks());
    const p = await plan(r.csv);
    const map: RedirectMap = Object.fromEntries(p.valid.map((v) => [v.fromPath, { to: v.toPath, status: v.status }]));
    // `app/blog/feed.xml` and `app/feed/google.xml` have no `[locale]` twin: a prefixed destination is a 404.
    for (const prefix of ["", `/${L}`]) {
      for (const opts of [{}, { trailingSlash: true }]) {
        expect(matchRedirect(`${prefix}/feed/`, map, opts)).toEqual({ to: BLOG_FEED, status: 301 });
        expect(matchRedirect(`${prefix}/butik/feed/`, map, opts)).toEqual({ to: PRODUCT_FEED, status: 301 });
      }
    }
    // A feed whose page stays live keeps the reader's locale: the page has one.
    expect(matchRedirect(`/${L}/lamper/feed/`, map)).toEqual({ to: `/${L}/lamper/`, status: 301 });
  });

  it("writes the feed files on the engine's origin when the owner gives one", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks(), { origin: "https://www.shop.example.test/" });
    expect(pairs(r)).toContainEqual(["/feed/", "https://www.shop.example.test/blog/feed.xml"]);
    expect(pairs(r)).toContainEqual(["/butik/feed/", "https://www.shop.example.test/feed/google.xml"]);
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("quotes a cell the CSV would otherwise split, and the importer reads it back whole", async () => {
    const links = wooRedirectLinks();
    links.shippingClasses = [{ id: 1, slug: "a-b", link: `${SHOP}/fragtklasse/a,b/` }];
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.csv).toContain(`"/fragtklasse/a,b/",/produkter,301`);
    const p = await plan(r.csv);
    expect(p.errors).toEqual([]);
    expect(p.valid.map((v) => v.fromPath)).toContain("/fragtklasse/a,b");
  });
});

describe("buildWooRedirectCsv — never a guess", () => {
  it("leaves a role out when two pages claim it, with its shop feed", () => {
    const links = wooRedirectLinks();
    links.pages.push({ id: 99, slug: "shop", link: `${SHOP}/shop/` });
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.skipped.filter((s) => s.reason === "ambiguous").map((s) => s.path)).toEqual([`${SHOP}/butik/`, `${SHOP}/shop/`]);
    expect(r.rows.some((row) => row.from.startsWith("/butik/") || row.from.startsWith("/shop/"))).toBe(false);
  });

  it("takes the owner's slug for a renamed page, and only that one", () => {
    const links = wooRedirectLinks();
    links.pages.push({ id: 99, slug: "sortiment", link: `${SHOP}/sortiment/` });
    const r = buildWooRedirectCsv(wooSnapshot(), links, { systemPages: { shop: "sortiment" } });
    expect(pairs(r)).toContainEqual(["/sortiment/", "/produkter"]);
    expect(pairs(r)).toContainEqual(["/sortiment/feed/", PRODUCT_FEED]);
    expect(r.rows.some((row) => row.from.startsWith("/butik/"))).toBe(false);
  });

  it("makes no system-page row for a role the source has no page for", () => {
    const links = wooRedirectLinks();
    links.pages = links.pages.filter((p) => p.slug !== "kasse");
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.rows.some((row) => row.to === "/checkout")).toBe(false);
  });

  it("skips a page the engine serves at the same address (an English Woo install's /checkout/)", () => {
    const links = wooRedirectLinks();
    links.pages = links.pages.map((p) => (p.slug === "kasse" ? { ...p, slug: "checkout", link: `${SHOP}/checkout/` } : p));
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.skipped).toContainEqual({ path: "/checkout/", kind: "system-page", reason: "engine-serves" });
    expect(r.rows.some((row) => row.from === "/checkout/")).toBe(false);
  });

  it("lists what the path-only matcher can never answer instead of writing a dead row", () => {
    const snap = wooSnapshot();
    snap.products[0].permalink = `${SHOP}/lamper/1.5m-lampe/`;
    snap.categories[0].permalink = `https://elsewhere.example.test/lamper/`;
    snap.categories[1].permalink = `${SHOP}/${L}/bordlamper/`;
    const links = wooRedirectLinks();
    links.shippingClasses = [{ id: 1, slug: "palle", link: `${SHOP}/?product_shipping_class=palle` }];
    const r = buildWooRedirectCsv(snap, links);
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        { path: `${SHOP}/?product_shipping_class=palle`, kind: "shipping-class", reason: "query-form" },
        { path: `${SHOP}/lamper/1.5m-lampe/`, kind: "feed", reason: "dotted-path" },
        { path: "https://elsewhere.example.test/lamper/", kind: "feed", reason: "foreign-host" },
        { path: `${SHOP}/${L}/bordlamper/`, kind: "feed", reason: "locale-segment" },
      ]),
    );
    expect(r.rows.some((row) => row.kind === "shipping-class")).toBe(false);
  });

  it("writes no shipping-class row when the source could not list them", () => {
    const links = wooRedirectLinks();
    links.shippingClasses = null;
    expect(buildWooRedirectCsv(wooSnapshot(), links).rows.some((row) => row.kind === "shipping-class")).toBe(false);
  });

  it("sends a feed whose engine twin is off to the homepage", () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks(), { targets: { blogFeed: null, productFeed: null } });
    expect(pairs(r)).toContainEqual(["/feed/", "/"]);
    expect(pairs(r)).toContainEqual(["/butik/feed/", "/"]);
  });
});

describe("buildWooRedirectCsv — shop shapes the review found (W21-live-6a R1)", () => {
  it("lists a shop page set as the front page instead of redirecting the site root", async () => {
    const links = wooRedirectLinks();
    links.pages = links.pages.map((p) => (p.slug === "butik" ? { ...p, link: `${SHOP}/` } : p));
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.skipped).toContainEqual({ path: `${SHOP}/`, kind: "system-page", reason: "site-root" });
    expect(r.rows.some((row) => row.from === "/")).toBe(false);
    // `/feed/` stays the site feed — the shop's archive feed is not folded onto it.
    expect(pairs(r)).toContainEqual(["/feed/", BLOG_FEED]);
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("writes the site feeds under a subdirectory install's base path", async () => {
    const BASE = "https://example.test/wp";
    const snap = { ...wooSnapshot(), storeUrl: `${BASE}/`, products: [], categories: [] };
    const links = {
      pages: [
        { id: 1, slug: "kasse", link: `${BASE}/kasse/` },
        { id: 2, slug: "home", link: `${BASE}/` },
      ],
      posts: [],
      shippingClasses: [],
    };
    const r = buildWooRedirectCsv(snap, links);
    expect(pairs(r)).toEqual([
      ["/wp/kasse/", "/checkout"],
      ["/wp/feed/", "https://example.test/blog/feed.xml"],
      ["/wp/feed/rss/", "https://example.test/blog/feed.xml"],
      ["/wp/feed/rss2/", "https://example.test/blog/feed.xml"],
      ["/wp/feed/atom/", "https://example.test/blog/feed.xml"],
      ["/wp/feed/rdf/", "https://example.test/blog/feed.xml"],
      ["/wp/comments/feed/", "/"],
    ]);
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("takes only a top-level page for a role: a child page sharing the slug is content", () => {
    const links = wooRedirectLinks();
    links.pages.push({ id: 50, slug: "butik", link: `${SHOP}/om-os/butik/` });
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(pairs(r)).toContainEqual(["/butik/", "/produkter"]);
    expect(r.skipped.some((s) => s.reason === "ambiguous")).toBe(false);
    expect(r.rows.some((row) => row.from.startsWith("/om-os/"))).toBe(false);
    // With the real shop page renamed away, the child page is still never taken.
    links.pages = links.pages.filter((p) => p.id !== 6);
    expect(buildWooRedirectCsv(wooSnapshot(), links).rows.some((row) => row.from.startsWith("/om-os/"))).toBe(false);
  });

  it("matches the owner's non-ASCII slug however it is written", () => {
    for (const own of ["køb", "k%C3%B8b", "k%c3%b8b"]) {
      const links = wooRedirectLinks();
      links.pages.push({ id: 99, slug: "k%c3%b8b", link: `${SHOP}/k%c3%b8b/` });
      const r = buildWooRedirectCsv(wooSnapshot(), links, { systemPages: { shop: own } });
      expect(pairs(r), own).toContainEqual(["/k%c3%b8b/", "/produkter"]);
    }
  });

  it("never takes an address that keeps answering 200: no row on it, no chain through it", async () => {
    const snap = wooSnapshot();
    snap.products[0].permalink = `${SHOP}/lamper/feed/`;
    const links = wooRedirectLinks();
    links.shippingClasses = [{ id: 1, slug: "x", link: `${SHOP}/nye-lamper-til-foraaret/` }];
    const r = buildWooRedirectCsv(snap, links);
    expect(r.rows.some((row) => row.from === "/lamper/feed/")).toBe(false);
    expect(r.rows.some((row) => row.from === "/nye-lamper-til-foraaret/")).toBe(false);
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        { path: "/lamper/feed/", kind: "feed", reason: "live-page" },
        { path: "/nye-lamper-til-foraaret/", kind: "shipping-class", reason: "live-page" },
      ]),
    );
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("writes no shop feed for a shop page that was itself left out", () => {
    const links = wooRedirectLinks();
    links.pages.push({ id: 99, slug: "produkt", link: `${SHOP}/produkt/` });
    const r = buildWooRedirectCsv(wooSnapshot(), links, { systemPages: { shop: "produkt" } });
    expect(r.skipped.filter((s) => s.path.startsWith("/produkt/"))).toEqual([
      { path: "/produkt/", kind: "system-page", reason: "engine-legacy" },
    ]);
  });

  it("never takes a path the engine answers at as a source, so no row chains through it", async () => {
    const r = buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks(), { targets: { shop: "/kasse" } });
    // The owner put the engine's shop at /kasse: the old checkout page there is the engine's now.
    expect(r.skipped).toContainEqual({ path: "/kasse/", kind: "system-page", reason: "engine-serves" });
    expect(pairs(r)).toContainEqual(["/butik/", "/kasse"]);
    expect(r.skipped.some((s) => s.reason === "chain")).toBe(false);
    expect((await plan(r.csv)).errors).toEqual([]);
  });
});

describe("buildWooRedirectCsv — shop shapes the review found (W21-live-6a R2)", () => {
  it("keeps the shop feed when the shop page already sits at the engine's address", async () => {
    const links = wooRedirectLinks();
    links.pages = links.pages.map((p) => (p.slug === "butik" ? { ...p, slug: "produkter", link: `${SHOP}/produkter/` } : p));
    const r = buildWooRedirectCsv(wooSnapshot(), links, { systemPages: { shop: "produkter" } });
    expect(r.skipped).toContainEqual({ path: "/produkter/", kind: "system-page", reason: "engine-serves" });
    expect(pairs(r)).toContainEqual(["/produkter/feed/", PRODUCT_FEED]);
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("counts only top-level pages on the shop's own address toward a role", () => {
    for (const child of [
      `${SHOP}/${L}/om-os/butik/`,
      `${SHOP}/v2.0/butik/`,
      `${SHOP}/om-os/butik/?lang=x`,
      `https://elsewhere.example.test/butik/`,
    ]) {
      const links = wooRedirectLinks();
      links.pages.push({ id: 50, slug: "butik", link: child });
      const r = buildWooRedirectCsv(wooSnapshot(), links);
      expect(r.skipped.some((s) => s.reason === "ambiguous"), child).toBe(false);
      expect(pairs(r), child).toContainEqual(["/butik/", "/produkter"]);
      expect(pairs(r), child).toContainEqual(["/butik/feed/", PRODUCT_FEED]);
    }
  });

  it("takes no page outside a subdirectory install's base path for a role", () => {
    const snap = { ...wooSnapshot(), storeUrl: "https://example.test/wp/", products: [], categories: [] };
    const links = { pages: [{ id: 50, slug: "butik", link: "https://example.test/om/butik/" }], posts: [], shippingClasses: [] };
    const r = buildWooRedirectCsv(snap, links);
    expect(r.rows.some((row) => row.kind === "system-page")).toBe(false);
  });

  it("keeps every page of an ambiguous role a live page: nothing else lands on it", () => {
    const links = wooRedirectLinks();
    links.pages.push({ id: 99, slug: "shop", link: `${SHOP}/shop/` });
    links.shippingClasses = [{ id: 41, slug: "shop", link: `${SHOP}/shop/` }];
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.rows.some((row) => row.from === "/shop/")).toBe(false);
    expect(r.skipped).toContainEqual({ path: "/shop/", kind: "shipping-class", reason: "live-page" });
  });

  it("writes no row over an engine route another row points at", async () => {
    const links = wooRedirectLinks();
    links.shippingClasses = [{ id: 41, slug: "checkout", link: `${SHOP}/checkout/` }];
    const r = buildWooRedirectCsv(wooSnapshot(), links);
    expect(r.skipped).toContainEqual({ path: "/checkout/", kind: "shipping-class", reason: "engine-serves" });
    expect(pairs(r)).toContainEqual(["/kasse/", "/checkout"]);
    expect((await plan(r.csv)).errors).toEqual([]);
  });

  it("refuses a target with a locale prefix instead of writing a row the importer refuses", () => {
    expect(() => buildWooRedirectCsv(wooSnapshot(), wooRedirectLinks(), { targets: { shop: `/${L}/produkter` } })).toThrow(
      /locale prefix/,
    );
  });
});

describe("readWooRedirectLinks", () => {
  function client(calls: RecordedCall[], opts: Parameters<typeof fixtureTransport>[1] = {}) {
    return createWooClient({
      storeUrl: STORE_URL,
      siteUrl: "https://cartwright.example.test",
      transport: fixtureTransport(calls, opts),
      assertHostPublic: async () => {},
      sleep: async () => {},
    });
  }

  it("reads pages, posts and shipping classes from wp/v2 with GET only", async () => {
    const calls: RecordedCall[] = [];
    const links = await readWooRedirectLinks(client(calls));
    expect(links).toEqual(wooRedirectLinks());
    expect(calls.map((c) => c.url.pathname)).toEqual([
      "/wp-json/wp/v2/pages",
      "/wp-json/wp/v2/posts",
      "/wp-json/wp/v2/product_shipping_class",
    ]);
    expect(calls.every((c) => (c.init as WooRequestInit).method === "GET")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("_fields") === "id,slug,link")).toBe(true);
  });

  it("answers null shipping classes when the taxonomy has no REST route, and fails on a server error", async () => {
    expect((await readWooRedirectLinks(client([], { shippingClassStatus: 404 }))).shippingClasses).toBeNull();
    await expect(readWooRedirectLinks(client([], { shippingClassStatus: 500 }))).rejects.toThrow(/HTTP 500/);
  });
});

describe("ENGINE_LEGACY_SEGMENTS", () => {
  it("names exactly the first segments both proxies' LEGACY_SLUG_MAP answers", () => {
    for (const file of ["proxy.ts", "proxy.static.ts"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      const block = source.slice(source.indexOf("LEGACY_SLUG_MAP: Record<string, string> = {"));
      const keys = [...block.slice(0, block.indexOf("};")).matchAll(/"([a-z/]+)":/g)].map((m) => m[1].split("/")[0]);
      expect([...new Set(keys)].sort(), file).toEqual([...ENGINE_LEGACY_SEGMENTS].sort());
    }
  });
});
