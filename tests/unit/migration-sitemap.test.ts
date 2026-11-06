import { describe, expect, it } from "vitest";

import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";
import { crawlSitemap, parseSitemapXml, SITEMAP_URL_CAP } from "@/lib/migration/sitemap";

/**
 * MIGD-1b — the sitemap freeze reader. Synthetic fixtures only (example.test):
 * a Yoast-shaped index, two urlsets with image:loc, a child sitemap on a third
 * host (refused, never fetched) and the 20k URL cap. No network.
 */

const SRC = "https://shop.example.test";

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="//shop.example.test/main-sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SRC}/product-sitemap.xml</loc><lastmod>2026-09-30T10:00:00+00:00</lastmod></sitemap>
  <sitemap>
    <loc>${SRC}/page-sitemap.xml</loc>
  </sitemap>
  <!-- <sitemap><loc>${SRC}/commented-out-sitemap.xml</loc></sitemap> -->
  <sitemap><loc>https://foreign.example.test/evil-sitemap.xml</loc></sitemap>
</sitemapindex>`;

const PRODUCTS = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SRC}/produkt/alpha/</loc>
    <lastmod>2026-09-01T08:00:00+00:00</lastmod>
    <image:image><image:loc>${SRC}/wp-content/uploads/2026/01/alpha.jpg</image:loc></image:image>
    <image:image><image:loc><![CDATA[${SRC}/wp-content/uploads/2026/01/alpha-2-scaled.jpg]]></image:loc></image:image>
  </url>
  <url><loc>${SRC}/produkt/alpha/?attribute_pa_farve=sort&amp;attribute_pa_hoejde=180</loc></url>
  <url><loc>https://foreign.example.test/produkt/beta/</loc></url>
  <url><loc>${SRC}/produkt/alpha/</loc></url>
</urlset>`;

const PAGES = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SRC}/</loc></url>
  <url><loc>${SRC}/om-os/</loc><lastmod>2026-08-15</lastmod></url>
</urlset>`;

type Route = (url: string) => MigrationResponse;
const ok =
  (body: string, contentType = "application/xml"): Route =>
  (url) => ({ outcome: "answer", url, status: 200, location: null, contentType, body, truncated: false });
const moved =
  (status: number, location: string): Route =>
  (url) => ({ outcome: "answer", url, status, location, contentType: "text/html", body: "", truncated: false });

function source(routes: Record<string, Route>): { fetch: MigrationFetcher; calls: string[] } {
  const calls: string[] = [];
  const fetch: MigrationFetcher = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return { outcome: "answer", url, status: 404, location: null, contentType: "text/html", body: "", truncated: false };
    return route(url);
  };
  return { fetch, calls };
}

const urlset = (from: number, n: number) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from(
    { length: n },
    (_, i) => `<url><loc>${SRC}/p/${from + i}/</loc></url>`,
  ).join("")}</urlset>`;
const indexOf = (...locs: string[]) =>
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((l) => `<sitemap><loc>${l}</loc></sitemap>`)
    .join("")}</sitemapindex>`;

describe("parseSitemapXml", () => {
  it("reads a sitemap index (comments ignored, lastmod kept)", () => {
    const parsed = parseSitemapXml(INDEX);
    expect(parsed).toEqual({
      kind: "index",
      sitemaps: [
        { loc: `${SRC}/product-sitemap.xml`, lastmod: "2026-09-30T10:00:00+00:00" },
        { loc: `${SRC}/page-sitemap.xml` },
        { loc: "https://foreign.example.test/evil-sitemap.xml" },
      ],
    });
  });

  it("reads a urlset with image:loc (CDATA and &amp; decoded)", () => {
    const parsed = parseSitemapXml(PRODUCTS);
    expect(parsed.kind).toBe("urlset");
    if (parsed.kind !== "urlset") return;
    expect(parsed.urls[0]).toEqual({
      loc: `${SRC}/produkt/alpha/`,
      lastmod: "2026-09-01T08:00:00+00:00",
      images: [`${SRC}/wp-content/uploads/2026/01/alpha.jpg`, `${SRC}/wp-content/uploads/2026/01/alpha-2-scaled.jpg`],
    });
    expect(parsed.urls[1]).toEqual({
      loc: `${SRC}/produkt/alpha/?attribute_pa_farve=sort&attribute_pa_hoejde=180`,
      images: [],
    });
  });

  it("a cut-off document is invalid, never a shorter list", () => {
    const cut = [
      // Codex's case: the index stops inside its first entry.
      `<sitemapindex><sitemap><loc>${SRC}/child.xml</loc>`,
      // Every entry closed, the root never is.
      `<urlset><url><loc>${SRC}/a/</loc></url>`,
      // The root is closed but an entry inside it is not.
      `<urlset><url><loc>${SRC}/a/</loc></url><url><loc>${SRC}/b/</loc></urlset>`,
      // A closed entry without a <loc>.
      `<urlset><url><loc>${SRC}/a/</loc></url><url><lastmod>2026-09-01</lastmod></url></urlset>`,
      `<sitemapindex><sitemap><lastmod>2026-09-01</lastmod></sitemap></sitemapindex>`,
    ];
    for (const xml of cut) expect(parseSitemapXml(xml).kind, xml).toBe("invalid");
    // …while an empty sitemap is still a sitemap.
    expect(parseSitemapXml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`)).toEqual({ kind: "urlset", urls: [] });
    expect(parseSitemapXml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`)).toEqual({ kind: "urlset", urls: [] });
  });

  it.each([
    ["</url >", `<urlset><url><loc>${SRC}/a/</loc></url ></urlset>`, { loc: `${SRC}/a/`, images: [] }],
    ["</loc >", `<urlset><url><loc>${SRC}/a/</loc\t></url></urlset>`, { loc: `${SRC}/a/`, images: [] }],
    [
      "</image:loc >",
      `<urlset><url><loc>${SRC}/a/</loc><image:image><image:loc>${SRC}/a.jpg</image:loc\n></image:image></url></urlset>`,
      { loc: `${SRC}/a/`, images: [`${SRC}/a.jpg`] },
    ],
    ["</urlset >", `<urlset><url><loc>${SRC}/a/</loc><lastmod>2026-09-01</lastmod ></url></urlset >`, { loc: `${SRC}/a/`, lastmod: "2026-09-01", images: [] }],
  ])("an end tag may carry whitespace before its > (%s), in pairing and counting alike", (_name, xml, url) => {
    expect(parseSitemapXml(xml)).toEqual({ kind: "urlset", urls: [url] });
  });

  it("…and so may an index's </sitemap > and </loc >", () => {
    expect(parseSitemapXml(`<sitemapindex><sitemap><loc>${SRC}/a.xml</loc ></sitemap\r\n></sitemapindex>`)).toEqual({
      kind: "index",
      sitemaps: [{ loc: `${SRC}/a.xml` }],
    });
  });

  it("anything else is not a sitemap", () => {
    expect(parseSitemapXml("<!doctype html><html><body>Not here</body></html>")).toEqual({ kind: "unknown" });
  });
});

describe("parseSitemapXml — one linear pass, whatever the input", () => {
  const MB = 1024 * 1024;
  const timed = (xml: string) => {
    const t = performance.now();
    const parsed = parseSitemapXml(xml);
    return { ms: performance.now() - t, kind: parsed.kind };
  };

  it("2 MB of unmatched <url> inside a closed <urlset> is rejected in well under a second", () => {
    const { ms, kind } = timed(`<urlset>${"<url>".repeat((2 * MB) / 5)}</urlset>`);
    expect(kind).toBe("invalid");
    expect(ms).toBeLessThan(1000);
  });

  it("other 2 MB cut-off shapes are rejected in well under a second too", () => {
    const shapes = {
      "unterminated comments": `<urlset>${"<!--".repeat((2 * MB) / 4)}`,
      "tags with no >": `<urlset>${"<url".repeat((2 * MB) / 4)}</urlset>`,
      "unclosed <loc>s": `<urlset><url>${"<loc>".repeat((2 * MB) / 5)}</url></urlset>`,
      "stray </url>s": `<urlset>${"</url>".repeat((2 * MB) / 6)}</urlset>`,
    };
    for (const [name, xml] of Object.entries(shapes)) {
      const { ms, kind } = timed(xml);
      expect(kind, name).toBe("invalid");
      expect(ms, name).toBeLessThan(1000);
    }
  });

  it("a full read grows linearly: four times the document is not sixteen times the time", () => {
    const doc = (n: number) =>
      `<urlset>${Array.from(
        { length: n },
        (_, i) =>
          `<url><loc>${SRC}/p/${i}/</loc><!-- c --><image:image><image:loc><![CDATA[${SRC}/i/${i}.jpg]]></image:loc></image:image></url>`,
      ).join("")}</urlset>`;
    const best = (xml: string) => Math.min(...[0, 1, 2].map(() => timed(xml).ms));
    const small = doc(20_000);
    const large = doc(80_000);
    expect(timed(large).kind).toBe("urlset");
    const ratio = best(large) / Math.max(best(small), 0.5);
    expect(ratio).toBeLessThan(10);
  });
});

describe("crawlSitemap", () => {
  it("follows the index on the same host only and keeps variant URLs as their own entries", async () => {
    const src = source({
      [`${SRC}/sitemap_index.xml`]: ok(INDEX),
      [`${SRC}/product-sitemap.xml`]: ok(PRODUCTS),
      [`${SRC}/page-sitemap.xml`]: ok(PAGES),
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: src.fetch });

    expect(crawl.urls.map((u) => u.loc)).toEqual([
      `${SRC}/produkt/alpha/`,
      `${SRC}/produkt/alpha/?attribute_pa_farve=sort&attribute_pa_hoejde=180`,
      `${SRC}/`,
      `${SRC}/om-os/`,
    ]);
    expect(crawl.urls[0]).toMatchObject({ sitemap: `${SRC}/product-sitemap.xml` });
    expect(crawl.urls[0].images).toHaveLength(2);
    expect(crawl.urls[3]).toMatchObject({ lastmod: "2026-08-15", sitemap: `${SRC}/page-sitemap.xml` });

    // The third-host child sitemap is reported and never requested.
    expect(src.calls).not.toContain("https://foreign.example.test/evil-sitemap.xml");
    expect(crawl.sitemaps).toContainEqual({
      url: "https://foreign.example.test/evil-sitemap.xml",
      status: "refused",
      detail: "foreign-host",
    });
    // A third-host <loc> in a urlset is reported, not frozen.
    expect(crawl.foreign).toEqual({
      count: 1,
      first: [{ loc: "https://foreign.example.test/produkt/beta/", sitemap: `${SRC}/product-sitemap.xml` }],
    });
    // A refused child means part of the map was not read.
    expect(crawl.complete).toBe(false);
    expect(crawl.capped).toBe(false);
  });

  it("a clean same-host crawl is complete, and the root may redirect once on its own host", async () => {
    const src = source({
      [`${SRC}/sitemap.xml`]: moved(301, "/sitemap_index.xml"),
      [`${SRC}/sitemap_index.xml`]: ok(indexOf(`${SRC}/page-sitemap.xml`)),
      [`${SRC}/page-sitemap.xml`]: ok(PAGES),
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap.xml`, { fetch: src.fetch });
    expect(crawl.urls.map((u) => u.loc)).toEqual([`${SRC}/`, `${SRC}/om-os/`]);
    expect(crawl.complete).toBe(true);
    expect(crawl.sitemaps.every((s) => s.status === "ok")).toBe(true);
  });

  it("a root that redirects to a third host is refused there, not followed", async () => {
    const src = source({ [`${SRC}/sitemap.xml`]: moved(301, "https://foreign.example.test/sitemap.xml") });
    const crawl = await crawlSitemap(`${SRC}/sitemap.xml`, { fetch: src.fetch });
    expect(src.calls).toEqual([`${SRC}/sitemap.xml`]);
    expect(crawl.sitemaps).toEqual([{ url: `${SRC}/sitemap.xml`, status: "refused", detail: "foreign-host" }]);
    expect(crawl.complete).toBe(false);
  });

  it("a child that does not answer is inconclusive; a child that is HTML is an error; both leave it incomplete", async () => {
    const src = source({
      [`${SRC}/sitemap_index.xml`]: ok(indexOf(`${SRC}/a.xml`, `${SRC}/b.xml`, `${SRC}/c.xml`)),
      [`${SRC}/a.xml`]: (url) => ({ outcome: "inconclusive", url, status: 503, reason: "HTTP 503" }),
      [`${SRC}/b.xml`]: ok("<!doctype html><title>Soft 404</title>", "text/html"),
      [`${SRC}/c.xml`]: ok(PAGES),
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: src.fetch });
    expect(crawl.sitemaps.find((s) => s.url.endsWith("/a.xml"))).toMatchObject({ status: "inconclusive" });
    expect(crawl.sitemaps.find((s) => s.url.endsWith("/b.xml"))).toMatchObject({ status: "error" });
    expect(crawl.urls).toHaveLength(2);
    expect(crawl.complete).toBe(false);
  });

  it("a sitemap cut off with a 200 and a normal end is an error, never a partial list", async () => {
    const src = source({
      [`${SRC}/sitemap_index.xml`]: ok(`<sitemapindex><sitemap><loc>${SRC}/child.xml</loc>`),
      [`${SRC}/child.xml`]: ok(PAGES),
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: src.fetch });
    expect(src.calls).toEqual([`${SRC}/sitemap_index.xml`]);
    expect(crawl.sitemaps).toEqual([{ url: `${SRC}/sitemap_index.xml`, status: "error", detail: expect.stringMatching(/not closed/) }]);
    expect(crawl.urls).toEqual([]);
    expect(crawl.complete).toBe(false);

    const urls = source({ [`${SRC}/sitemap.xml`]: ok(`<urlset><url><loc>${SRC}/a/</loc></url><url><loc>${SRC}/b/</loc>`) });
    const cut = await crawlSitemap(`${SRC}/sitemap.xml`, { fetch: urls.fetch });
    expect(cut.urls).toEqual([]);
    expect(cut.sitemaps[0]).toMatchObject({ status: "error" });
    expect(cut.complete).toBe(false);
  });

  it("child sitemaps and redirects stay on the root's origin: another port or an https→http downgrade is refused unsent", async () => {
    const elsewhere = [`http://shop.example.test:8080/a.xml`, `http://shop.example.test/b.xml`, `https://shop.example.test:8443/c.xml`];
    const src = source({
      [`${SRC}/sitemap_index.xml`]: ok(indexOf(...elsewhere, `${SRC}/page-sitemap.xml`)),
      [`${SRC}/page-sitemap.xml`]: ok(PAGES),
      ...Object.fromEntries(elsewhere.map((u) => [u, ok(PAGES)])),
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: src.fetch });
    expect(src.calls).toEqual([`${SRC}/sitemap_index.xml`, `${SRC}/page-sitemap.xml`]);
    for (const u of elsewhere) expect(crawl.sitemaps).toContainEqual({ url: u, status: "refused", detail: "foreign-origin" });
    expect(crawl.complete).toBe(false);

    for (const location of [`http://shop.example.test:8080/sitemap.xml`, `http://shop.example.test/sitemap_index.xml`]) {
      const redirected = source({ [`${SRC}/sitemap.xml`]: moved(301, location), [location]: ok(PAGES) });
      const r = await crawlSitemap(`${SRC}/sitemap.xml`, { fetch: redirected.fetch });
      expect(redirected.calls, location).toEqual([`${SRC}/sitemap.xml`]);
      expect(r.sitemaps, location).toEqual([{ url: `${SRC}/sitemap.xml`, status: "refused", detail: "foreign-origin" }]);
    }
  });

  it("the one exception: an http root may upgrade to https on the same host and default port", async () => {
    const HTTP = "http://shop.example.test";
    const src = source({
      [`${HTTP}/sitemap.xml`]: moved(301, `${SRC}/sitemap_index.xml`),
      [`${SRC}/sitemap_index.xml`]: ok(indexOf(`${SRC}/page-sitemap.xml`)),
      [`${SRC}/page-sitemap.xml`]: ok(PAGES),
    });
    const crawl = await crawlSitemap(`${HTTP}/sitemap.xml`, { fetch: src.fetch });
    expect(crawl.urls.map((u) => u.loc)).toEqual([`${SRC}/`, `${SRC}/om-os/`]);
    expect(crawl.complete).toBe(true);

    // …but not on another port, and never the other way round.
    const port = source({ [`http://shop.example.test:8080/sitemap.xml`]: moved(301, `https://shop.example.test:8080/sitemap.xml`) });
    const r = await crawlSitemap(`http://shop.example.test:8080/sitemap.xml`, { fetch: port.fetch });
    expect(port.calls).toHaveLength(1);
    expect(r.sitemaps[0]).toMatchObject({ status: "refused", detail: "foreign-origin" });
  });

  it("a sitemap larger than the read cap is an error, never a partial list", async () => {
    const src = source({
      [`${SRC}/sitemap.xml`]: (url) => ({ ...(ok(PAGES)(url) as object), truncated: true }) as MigrationResponse,
    });
    const crawl = await crawlSitemap(`${SRC}/sitemap.xml`, { fetch: src.fetch });
    expect(crawl.urls).toEqual([]);
    expect(crawl.sitemaps[0]).toMatchObject({ status: "error" });
  });

  it("caps at 20,000 URLs: exactly 20,000 is complete, 20,001 is capped", async () => {
    expect(SITEMAP_URL_CAP).toBe(20_000);
    const twoHalves = (second: number) =>
      source({
        [`${SRC}/sitemap_index.xml`]: ok(indexOf(`${SRC}/one.xml`, `${SRC}/two.xml`)),
        [`${SRC}/one.xml`]: ok(urlset(0, 10_000)),
        [`${SRC}/two.xml`]: ok(urlset(10_000, second)),
      });

    const exact = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: twoHalves(10_000).fetch });
    expect(exact.urls).toHaveLength(20_000);
    expect(exact.capped).toBe(false);
    expect(exact.complete).toBe(true);

    const over = await crawlSitemap(`${SRC}/sitemap_index.xml`, { fetch: twoHalves(10_001).fetch });
    expect(over.urls).toHaveLength(20_000);
    expect(over.capped).toBe("urls");
    expect(over.complete).toBe(false);
  });
});
