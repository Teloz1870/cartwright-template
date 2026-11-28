import { describe, expect, it, vi } from "vitest";
import { extractPage } from "@/lib/migration/html";
import { checkPage, type PageEntry } from "@/lib/migration/checks/page";
import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";

/**
 * MIGD-WARN-DIFF-a — `url.content` counts a paragraph, link or image that a page
 * repeats once. A WooCommerce theme prints a product's description twice in the
 * DOM, as a desktop tab and a mobile accordion; the new page prints it once, so
 * counting every copy made the row `warn` with nothing lost. A paragraph that is
 * really gone still warns, and tables are still counted per `<table>`.
 */

const SRC = "https://old-shop.example";
const NEW = "https://new-shop.example";
const OLD_URL = `${SRC}/produkt/type-1/`;
const NEW_URL = `${NEW}/da/produkt/type-1/`;

const P1 = "Komposithegn Type 1 er et vedligeholdelsesfrit hegn i 180 cm.";
const P2 = `Leveres med <a href="/montering/">monteringsvejledning</a> og skruer.`;
const SPEC = `<table class="woocommerce-product-attributes shop_attributes"><tr><th>Højde</th><td>180 cm</td></tr></table>`;
/** The description as the theme prints it, the accordion's copy re-wrapped by its template. */
const DESC_TAB = `<p>${P1}</p><p>${P2}</p><img src="/wp-content/uploads/type-1.jpg" alt="Type 1">`;
const DESC_ACCORDION = `<p>\n  ${P1.replace("Type 1 ", "Type&nbsp;1\n")}\n</p><p>${P2}</p><img src="/wp-content/uploads/type-1.jpg" alt="Type 1">`;

const head = (title: string) => `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="Hegn i komposit, 180 cm."><link rel="canonical" href="${OLD_URL}">
<meta property="og:image" content="/wp-content/uploads/type-1.jpg">
<script type="application/ld+json">{"@type":"Product","sku":"HF-T1-180"}</script></head>`;

/** A WooCommerce (Flatsome-style) single product page: tabs for desktop, the same panels as an accordion for phones. */
const wooPage = (o: { desc?: string; specInAccordion?: boolean } = {}) => `${head("Komposithegn Type 1 &#8211; Hegnsfabrikken")}
<body><header><a href="/">Home</a></header><main id="main"><div class="product type-product">
<div class="woocommerce-product-gallery"><a href="${SRC}/wp-content/uploads/type-1.jpg"><img src="${SRC}/wp-content/uploads/type-1.jpg" alt=""></a></div>
<h1 class="product_title entry-title">Komposithegn Type 1</h1>
<div class="woocommerce-tabs wc-tabs-wrapper hide-for-small">
  <ul class="tabs wc-tabs" role="tablist"><li><a href="#tab-description">Beskrivelse</a></li><li><a href="#tab-additional_information">Yderligere information</a></li></ul>
  <div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--description" id="tab-description">${o.desc ?? DESC_TAB}</div>
  <div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--additional_information" id="tab-additional_information">${SPEC}</div>
</div>
<div class="accordion show-for-small">
  <div class="accordion-item"><a class="accordion-title" href="#tab-description">Beskrivelse</a><div class="accordion-inner">${o.desc ?? DESC_ACCORDION}</div></div>
  <div class="accordion-item"><a class="accordion-title" href="#tab-additional_information">Yderligere information</a><div class="accordion-inner">${o.specInAccordion ? SPEC : ""}</div></div>
</div></div></main><footer><p>CVR 12345678</p></footer></body></html>`;

/** The new page: a breadcrumb, the description once, the same image and spec table. */
const newPage = (o: { desc?: string } = {}) => `${head("Komposithegn Type 1 | Hegnsfabrikken")}
<body><main><nav><a href="/da">Forside</a><a href="/da/hegn">Hegn</a><a href="/da/hegn/komposit">Komposit</a></nav><h1>Komposithegn Type 1</h1>
<img src="/uploads/type-1.jpg" alt="Type 1">${o.desc ?? `<p>${P1}</p><p>${P2}</p>`}${SPEC}</main></body></html>`;

const answer = (url: string, body: string): MigrationResponse =>
  ({ outcome: "answer", url, status: 200, location: null, contentType: "text/html", body, truncated: false, xRobotsTag: null }) as MigrationResponse;
const table = (url: string, body: string): MigrationFetcher => vi.fn(async (u: string) => answer(u, u === url ? body : ""));
const ENTRY: PageEntry = { oldUrl: OLD_URL, parityStatus: "pass", finalUrl: NEW_URL };

async function content(oldBody: string, newBody: string) {
  const res = await checkPage("url.content", ENTRY, {
    targetOrigin: NEW, expectedHost: "old-shop.example", source: table(OLD_URL, oldBody), target: table(NEW_URL, newBody),
    notFound: "page not found|we could not find that page", currency: "DKK",
  });
  return { ...res, fields: res.findings.map((f) => `${f.field}:${f.status}`) };
}

describe("a page that prints its description twice (tab + accordion)", () => {
  it("counts each paragraph, link and image once; the other fields are read as before", () => {
    expect(extractPage(wooPage(), { url: OLD_URL })).toEqual({
      title: "Komposithegn Type 1 – Hegnsfabrikken",
      description: "Hegn i komposit, 180 cm.",
      canonical: OLD_URL,
      noindex: false,
      ogImage: `${SRC}/wp-content/uploads/type-1.jpg`,
      h1: "Komposithegn Type 1",
      sku: "HF-T1-180",
      // 2 paragraphs (4 copies); the gallery link, both tab anchors, /montering/ (8 tags); one image, written absolute and relative (3 tags).
      counts: { paragraphs: 2, tables: 1, links: 4, images: 1 },
    });
  });

  it("against a new page that prints it once, url.content passes", async () => {
    expect(extractPage(newPage(), { url: NEW_URL }).counts).toEqual({ paragraphs: 2, tables: 1, links: 4, images: 1 });
    const res = await content(wooPage(), newPage());
    expect(res).toMatchObject({ status: "pass", findings: [] });
  });

  it("a paragraph that is really gone from the new page still warns", async () => {
    const res = await content(wooPage(), newPage({ desc: `<p>${P1}</p><a href="/montering/">monteringsvejledning</a>` }));
    expect(res.findings).toContainEqual({ field: "paragraphs", status: "warn", old: 2, new: 1 });
    expect(res.status).toBe("warn");
  });

  it("tables are still counted per <table>: the spec table in the tab and the accordion is two, so one on the new page fails", async () => {
    expect(extractPage(wooPage({ specInAccordion: true }), { url: OLD_URL }).counts.tables).toBe(2);
    const res = await content(wooPage({ specInAccordion: true }), newPage());
    expect(res.findings).toContainEqual({ field: "tables", status: "fail", old: 2, new: 1 });
    expect(res.status).toBe("fail");
  });
});

describe("what counts as the same link or image", () => {
  const counts = (main: string) => extractPage(`<html><body><main>${main}</main></body></html>`, { url: OLD_URL }).counts;

  it("a link is its resolved href: relative and absolute spellings of one URL are one link, two URLs are two", () => {
    expect(counts(`<a href="/a/">A</a><a href="${SRC}/a/">A</a><a href="  /a/ ">A</a>`).links).toBe(1);
    expect(counts(`<a href="/a/">A</a><a href="/b/">B</a><a href="/a/#x">A</a>`).links).toBe(3);
    expect(counts(`<a href="">none</a><a name="top">anchor</a>`).links).toBe(0);
  });

  it("an image is its URL — a lazy loader's real one behind a data: placeholder — and one with no URL counts every time", () => {
    const placeholder = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    expect(counts(`<img src="${placeholder}" data-src="/1.jpg"><img src="${placeholder}" data-lazy-src="/2.jpg"><img src="/1.jpg">`).images).toBe(2);
    expect(counts(`<img src="${placeholder}"><img src="${placeholder}"><img alt="no source"><img alt="no source">`).images).toBe(4);
    expect(counts(`<img src="/1.jpg"><img src="/1.jpg?v=2">`).images).toBe(2);
  });

  it("a lazy loader's real URL wins over its placeholder, also when the placeholder is a file every image shares", () => {
    // a3 Lazy Load: src is one shared placeholder file, data-src the real image. Five images stay five.
    const gif = `${SRC}/wp-content/plugins/a3-lazy-load/assets/images/lazy_placeholder.gif`;
    const a3 = [1, 2, 3, 4, 5].map((n) => `<img class="lazy lazy-hidden" src="${gif}" data-lazy-type="image" data-src="/g/${n}.jpg">`).join("");
    expect(counts(a3).images).toBe(5);
    // WP Rocket / Jetpack (data-lazy-src) and jQuery lazyload (data-original) behind the same shared placeholder.
    expect(counts(`<img src="/blank.gif" data-lazy-src="/1.jpg"><img src="/blank.gif" data-lazy-src="/2.jpg">`).images).toBe(2);
    expect(counts(`<img src="/blank.gif" data-original="/1.jpg"><img src="/blank.gif" data-original="/2.jpg">`).images).toBe(2);
    // One image printed twice, lazy-loaded in one copy only (WP Rocket skips the first images): still one.
    expect(counts(`<img src="/1.jpg"><img src="/blank.gif" data-lazy-src="/1.jpg">`).images).toBe(1);
    expect(counts(`<img src="data:image/gif;base64,R0lGOD" data-lazy-src="/1.jpg"><img src="data:image/gif;base64,R0lGOD" data-lazy-src="${SRC}/1.jpg">`).images).toBe(1);
  });

  it("losing the real images behind a shared placeholder still warns", async () => {
    const gif = "/wp-content/plugins/a3-lazy-load/assets/images/lazy_placeholder.gif";
    const gallery = [1, 2, 3, 4, 5].map((n) => `<img src="${gif}" data-src="/g/${n}.jpg">`).join("");
    // Old: the product image + five gallery images. New: the product image + the first gallery image.
    const res = await content(wooPage({ desc: `<p>${P1}</p><p>${P2}</p>${gallery}` }), newPage({ desc: `<p>${P1}</p><p>${P2}</p><img src="/g/1.jpg">` }));
    expect(res.findings).toContainEqual({ field: "images", status: "warn", old: 6, new: 2 });
    expect(res.status).toBe("warn");
  });

  it("a paragraph is its normalised text: case, entities and wrapping do not make it another one; empty ones do not count", () => {
    expect(counts(`<p>Et hegn.</p><p>ET&nbsp;HEGN.</p><p>Et\n  <b>hegn</b>.</p><p> </p><p><img src="/1.jpg"></p>`).paragraphs).toBe(1);
  });

  it("the trade-off: a page that repeats a paragraph and loses one copy no longer warns", async () => {
    const twice = `<p>${P1}</p><p>${P2}</p><p>${P1}</p>`;
    expect(extractPage(newPage({ desc: twice }), { url: NEW_URL }).counts.paragraphs).toBe(2);
    expect((await content(newPage({ desc: twice }), newPage())).findings).toEqual([]);
  });
});
