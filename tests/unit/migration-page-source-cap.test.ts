import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIGD-PAGE-MAX-a — the old site's page is read up to 3 MiB, through every
 * redirect hop to it; the new site's page and its 404 probe keep 1 MiB.
 * Measured on Hegnsfabrikken 2026-11-01: 13 pages over 1 MiB, the largest
 * 2.05 MiB, none over 3 MiB — at 1 MiB each of them left `url.content` on warn
 * and `seo.head` / `seo.product-jsonld` on inconclusive, so the board could not
 * turn green. Through the real `migrationFetcher` (its `readUpTo` does the
 * cutting); DNS and fetch are faked — no network.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ ...dns, default: dns }));

import { checkPage, PAGE_MAX_BYTES, probeNotFound, SOURCE_PAGE_MAX_BYTES, type PageCheckId } from "@/lib/migration/checks/page";
import { migrationFetcher } from "@/lib/migration/fetch";

const MIB = 1024 * 1024;
const HOST = "old-shop.example";
const NEW = "https://new-shop.example";
const OLD_URL = `https://${HOST}/produkt/type-1/`;
const NEW_URL = `${NEW}/da/produkt/type-1/`;
const CHECKS: PageCheckId[] = ["url.content", "seo.head", "seo.product-jsonld"];

const LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Komposithegn Type 1",
  sku: "HF-T1-180",
  image: "https://cdn.example.test/type-1.jpg",
  offers: { "@type": "Offer", price: "999.00", priceCurrency: "DKK", availability: "https://schema.org/InStock" },
});

/** Inline page-builder CSS, the bulk of a big WooCommerce page: `bytes` of it (ASCII, so bytes = chars). */
const filler = (bytes: number) => (bytes > 0 ? `<style>${".a{color:red}".repeat(Math.ceil(bytes / 12)).slice(0, bytes)}</style>` : "");
/** The same product page on both sites; `before` pads ahead of the whole head and body, `after` behind them. */
const page = (o: { before?: number; after?: number; title?: string; h1?: string } = {}) =>
  `<!doctype html><html><head>${filler(o.before ?? 0)}<title>${o.title ?? "Komposithegn Type 1"}</title>` +
  `<meta name="description" content="Hegn i komposit, 180 cm."><link rel="canonical" href="https://${HOST}/produkt/type-1/">` +
  `<meta property="og:image" content="/img/type-1.jpg"><script type="application/ld+json">${LD}</script></head>` +
  `<body><main><h1>${o.h1 ?? "Komposithegn Type 1"}</h1><p>Et hegn.</p><p>Til haven.</p><table><tr><td>180 cm</td></tr></table>` +
  `<a href="/a">A</a><img src="/1.jpg"></main>${filler(o.after ?? 0)}</body></html>`;
/** A page of exactly `total` bytes, its content and JSON-LD all past the padding. */
const paddedBefore = (total: number) => page({ before: total - page().length - "<style></style>".length });
const paddedAfter = (total: number) => page({ after: total - page().length - "<style></style>".length });

type Route = { status?: number; body?: string; location?: string };
let routes: Record<string, Route> = {};
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const href = new URL(String(input)).href;
  const r = routes[href] ?? { status: 404, body: "" };
  return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": "text/html", ...(r.location ? { location: r.location } : {}) } });
});

beforeEach(() => {
  dns.lookup.mockImplementation(async () => [{ address: "203.0.113.10", family: 4 }]);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
  routes = {};
});

const source = migrationFetcher({ allowHosts: [HOST, `www.${HOST}`] });
const target = migrationFetcher({ allowHosts: [new URL(NEW).hostname] });

async function run(checkId: PageCheckId, oldBody: string, newBody: string, oldUrl = OLD_URL) {
  routes[oldUrl] ??= { body: oldBody };
  routes[NEW_URL] = { body: newBody };
  const res = await checkPage(checkId, { oldUrl, parityStatus: "pass", finalUrl: NEW_URL }, {
    targetOrigin: NEW, expectedHost: HOST, source, target, notFound: "page not found|we could not find that page", currency: "DKK",
  });
  return { ...res, fields: res.findings.map((f) => `${f.field}:${f.status}`) };
}

/** The finding a cut page leaves on each check. */
const CUT: Record<PageCheckId, { field: string; status: string; tail: string }> = {
  "url.content": { field: "counts", status: "warn", tail: ", so paragraphs, tables, links and images were not counted" },
  "seo.head": { field: "head", status: "inconclusive", tail: ", so a robots directive or head tag past the cut could be missed" },
  "seo.product-jsonld": { field: "jsonld", status: "inconclusive", tail: ", so a variant or a Product in what was not read could be missed" },
};

describe("the caps", () => {
  it("the old site's page is read up to 3 MiB, the new site's up to 1 MiB", () => {
    expect(SOURCE_PAGE_MAX_BYTES).toBe(3 * MIB);
    expect(PAGE_MAX_BYTES).toBe(MIB);
  });

  it.each(CHECKS)("%s: the same small page on both sites passes (the fixture's control)", async (check) => {
    expect(await run(check, page(), page())).toMatchObject({ status: "pass", findings: [] });
  });
});

describe("a 2.05 MiB old page, its content and JSON-LD past 1 MiB", () => {
  const big = paddedBefore(Math.round(2.05 * MIB));

  it("is that page: 2.05 MiB, the <title>, the JSON-LD and <main> all past the first MiB", () => {
    expect(Buffer.byteLength(big)).toBe(Math.round(2.05 * MIB));
    for (const marker of ["<title>", "application/ld+json", "<main>"]) expect(big.indexOf(marker), marker).toBeGreaterThan(MIB);
  });

  it.each(CHECKS)("%s: no size finding, the row passes", async (check) => {
    expect(await run(check, big, page())).toMatchObject({ status: "pass", findings: [] });
  });

  it.each(CHECKS)("%s: read through the old site's own redirect (http → https www twin) with the same cap", async (check) => {
    const httpUrl = `http://${HOST}/produkt/type-1/`;
    const wwwUrl = `https://www.${HOST}/produkt/type-1/`;
    routes[httpUrl] = { status: 301, location: wwwUrl };
    routes[wwwUrl] = { body: big };
    expect(await run(check, "", page(), httpUrl)).toMatchObject({ status: "pass", findings: [] });
    expect(fetchMock.mock.calls.map((c) => new URL(String(c[0])).href)).toContain(wwwUrl);
  });

  it("a real difference past the first MiB is still found", async () => {
    expect(await run("url.content", paddedBefore(Math.round(2.05 * MIB)), page({ h1: "Type 1" }))).toMatchObject({ status: "fail", fields: ["h1:fail"] });
  });
});

describe("an old page over 3 MiB is still cut", () => {
  const over = paddedAfter(3 * MIB + 1024);

  it.each(CHECKS)("%s: says the old page is over 3072 KB", async (check) => {
    const res = await run(check, over, page());
    const cut = CUT[check];
    expect(res.status).toBe(cut.status);
    expect(res.findings).toEqual([{ field: cut.field, status: cut.status, detail: `the old page is over 3072 KB${cut.tail}` }]);
  });

  it("exactly 3 MiB is read whole", async () => {
    expect(await run("url.content", paddedAfter(3 * MIB), page())).toMatchObject({ status: "pass", findings: [] });
  });
});

describe("the new site's page keeps its 1 MiB cap", () => {
  const over = paddedAfter(MIB + 1024);

  it.each(CHECKS)("%s: a new page over 1 MiB is cut and says the new page is over 1024 KB", async (check) => {
    const res = await run(check, page(), over);
    const cut = CUT[check];
    expect(res.status).toBe(cut.status);
    expect(res.findings).toEqual([{ field: cut.field, status: cut.status, detail: `the new page is over 1024 KB${cut.tail}` }]);
  });

  it("both cut: the finding names both sides, each at its own cap", async () => {
    const res = await run("url.content", paddedAfter(3 * MIB + 1024), over);
    expect(res.findings).toEqual([{ field: "counts", status: "warn", detail: `the old page is over 3072 KB and the new page is over 1024 KB${CUT["url.content"].tail}` }]);
  });

  it("the 404 probe reads the new site's 404 page up to 1 MiB, not the source's 3 MiB", async () => {
    const probe = `${NEW}/cartwright-migration-probe-cap`;
    routes[probe] = { status: 404, body: page({ before: MIB, title: "Page not found", h1: "We could not find that page" }) };
    // The title and h1 sit past the first MiB: cut there, the probe reads a page with neither.
    expect(await probeNotFound(target, NEW, "cap")).toBe("|");
    routes[probe] = { status: 404, body: page({ title: "Page not found", h1: "We could not find that page" }) };
    expect(await probeNotFound(target, NEW, "cap")).toBe("page not found|we could not find that page");
  });
});
