import { createElement as h, Suspense, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { extractPage, fingerprint, inlineStreamed } from "@/lib/migration/html";
import { checkPage, mergePageSummary, probeNotFound, type PageCheckId, type PageEntry } from "@/lib/migration/checks/page";
import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";

/**
 * MIGD-4a — the page checks (`url.content`, `seo.head`) over old/new HTML pairs:
 * identical, title drift, noindex by header only, canonical on the wrong host,
 * og:image gone, a soft 404 (200 with the 404 page's body), h1/sku/table drift,
 * and the rows that are never a pass (skip, inconclusive). Pure: the two
 * fetchers are tables of answers, no network.
 */

const SRC = "https://old-shop.example";
const NEW = "https://new-shop.example";
const HOST = "old-shop.example";

type Page = { title?: string; h1?: string; description?: string | null; canonical?: string | null; robots?: string; og?: string | null; sku?: string; body?: string };
const html = (p: Page = {}) => `<!doctype html><html><head>
<title>${p.title ?? "Komposithegn Type 1 &#8211; Hegnsfabrikken"}</title>
${p.description === null ? "" : `<meta name="description" content="${p.description ?? "Hegn i komposit, 180 cm."}">`}
${p.canonical === null ? "" : `<link rel="canonical" href="${p.canonical ?? `https://${HOST}/produkt/type-1/`}">`}
${p.robots ? `<meta name="robots" content="${p.robots}">` : ""}
${p.og === null ? "" : `<meta property="og:image" content="${p.og ?? "/img/type-1.jpg"}">`}
<script type="application/ld+json">{"@type":"Product","sku":"${p.sku ?? "HF-T1-180"}"}</script>
<script>document.write("<h1>not a heading</h1>")</script>
</head><body><header><a href="/">Home</a><a href="/kontakt">Kontakt</a></header>
<main>${p.body ?? `<h1>${p.h1 ?? "Komposithegn  Type 1"}</h1><p>Et hegn.</p><p>Til haven.</p><p> </p>
<table><tr><td>180 cm</td></tr></table><a href="/a">A</a><img src="/1.jpg"><img src="/2.jpg">`}</main></body></html>`;

const NOT_FOUND = html({ title: "Page not found", body: "<h1>We could not find that page</h1>" });

const answer = (url: string, body: string, extra: Partial<MigrationResponse> = {}): MigrationResponse =>
  ({ outcome: "answer", url, status: 200, location: null, contentType: "text/html", body, truncated: false, xRobotsTag: null, ...extra }) as MigrationResponse;
const table = (pages: Record<string, MigrationResponse>): MigrationFetcher =>
  vi.fn(async (url: string) => pages[url] ?? answer(url, "", { status: 404 }));

const OLD_URL = `${SRC}/produkt/type-1/`;
const NEW_URL = `${NEW}/da/produkt/type-1/`;
const entry = (over: Partial<PageEntry> = {}): PageEntry => ({ oldUrl: OLD_URL, parityStatus: "pass", finalUrl: NEW_URL, ...over });

async function run(checkId: PageCheckId, oldPage: MigrationResponse | string, newPage: MigrationResponse | string, opts: { entry?: PageEntry; notFound?: string | null } = {}) {
  const source = table({ [OLD_URL]: typeof oldPage === "string" ? answer(OLD_URL, oldPage) : oldPage });
  const target = table({ [NEW_URL]: typeof newPage === "string" ? answer(NEW_URL, newPage) : newPage });
  const notFound = opts.notFound === undefined ? fingerprint(extractPage(NOT_FOUND, { url: NEW })) : opts.notFound;
  const res = await checkPage(checkId, opts.entry ?? entry(), { targetOrigin: NEW, expectedHost: HOST, source, target, notFound });
  return { ...res, source, target, fields: res.findings.map((f) => `${f.field}:${f.status}`) };
}

describe("extractPage", () => {
  it("reads head, h1, JSON-LD sku and the counts inside <main>, never a heading inside a script", () => {
    const p = extractPage(html(), { url: OLD_URL });
    expect(p).toEqual({
      title: "Komposithegn Type 1 – Hegnsfabrikken",
      description: "Hegn i komposit, 180 cm.",
      canonical: `https://${HOST}/produkt/type-1/`,
      noindex: false,
      ogImage: `${SRC}/img/type-1.jpg`,
      h1: "Komposithegn Type 1",
      sku: "HF-T1-180",
      counts: { paragraphs: 2, tables: 1, links: 1, images: 2 },
    });
  });

  it("noindex comes from a robots meta tag or from the X-Robots-Tag header alone", () => {
    expect(extractPage(html({ robots: "NOINDEX, follow" }), { url: OLD_URL }).noindex).toBe(true);
    expect(extractPage(html(), { url: OLD_URL, xRobotsTag: "none" }).noindex).toBe(true);
    expect(extractPage(html({ robots: "index, follow" }), { url: OLD_URL, xRobotsTag: "nofollow" }).noindex).toBe(false);
  });

  // R1: a preview limit's "none" is not the `none` directive; a per-agent one still counts.
  it.each([
    ["index, follow, max-image-preview:none", false],
    ["max-video-preview:none, max-snippet:-1", false],
    ["googlebot: noindex", true],
    ["index, none", true],
    ["noimageindex", false],
  ])("robots %j → noindex %s", (robots, noindex) => {
    expect(extractPage(html({ robots }), { url: OLD_URL }).noindex).toBe(noindex);
    expect(extractPage(html(), { url: OLD_URL, xRobotsTag: robots }).noindex).toBe(noindex);
  });

  it("inline markup inside a word keeps the word whole; a line break or block tag still separates words", () => {
    const text = (h1: string) => extractPage(html({ h1 }), { url: OLD_URL }).h1;
    expect(text("H<sub>2</sub>O og <em>C</em>O<SUP>2</SUP>")).toBe("H2O og CO2");
    expect(text("Super<span class=\"x\">hegn</span> <a href=\"/a\">Type</a> 1")).toBe("Superhegn Type 1");
    expect(text("Hegn<br>Type<br/>1")).toBe("Hegn Type 1");
    expect(text("Hegn<div>Type</div><x-tag>1</x-tag>")).toBe("Hegn Type 1");
  });

  it("decodes every HTML 4 named entity, case-sensitively, and JSON-decodes the sku", () => {
    const a = extractPage(html({ h1: "H&oslash;j &AElig;ble &euro;5 &Oslash;", sku: "HF-\\u00d8 \\\"x\\\"" }), { url: OLD_URL });
    expect(a.h1).toBe("Høj Æble €5 Ø");
    expect(a.sku).toBe('HF-Ø "x"');
    expect(extractPage(html({ h1: "&bogus; &Euro;" }), { url: OLD_URL }).h1).toBe("&bogus; &Euro;");
  });

  it("a quoted '>' does not end a tag; an inline <svg> title is not the document's", () => {
    const p = extractPage(
      html({ title: "", description: "Køb for > 500 kr.", body: `<h1>X</h1><svg><title>Kurv</title></svg><a title="Se mere ->" href="/mere">Mere</a>` }),
      { url: OLD_URL },
    );
    expect(p).toMatchObject({ title: "", description: "Køb for > 500 kr.", counts: { links: 1 } });
    const svgFirst = `<html><head><svg><title>Logo</title></svg><title>Real</title></head><body><h1>X</h1></body></html>`;
    expect(extractPage(svgFirst, { url: OLD_URL }).title).toBe("Real");
  });

  it("a commented-out <script> is a comment, and does not swallow the page up to a later </script>", () => {
    const page = `<html><head><!-- <script src="/legacy.js"> --><title>T</title></head><body><main><h1>Kept</h1><p>Body.</p></main><script>x()</script></body></html>`;
    expect(extractPage(page, { url: OLD_URL })).toMatchObject({ title: "T", h1: "Kept", counts: { paragraphs: 1 } });
  });
});

// R2: a Next.js product page streams its Suspense content (and a late <title>) after the shell, outside <main>.
describe("streamed pages", () => {
  /** A component that suspends until `ms` have passed, then renders `children`. */
  const later = (ms: number) => {
    let done = false;
    const wait = new Promise<void>((r) => setTimeout(() => { done = true; r(); }, ms));
    return function Later({ children }: { children: ReactNode }) {
      if (!done) throw wait;
      return children;
    };
  };
  async function streamedPage(): Promise<string> {
    const [Outer, Inner] = [later(20), later(40)];
    const table = (cell: string) => h("table", null, h("tbody", null, h("tr", null, h("td", null, cell))));
    const product = h(Outer, null, h("title", null, "Type 1 | Shop"), h("h1", null, "Type 1"), table("180 cm"),
      h(Suspense, { fallback: h("p", null, "Loading specs") }, h(Inner, null, table("specs"))), h("p", null, "Et hegn."));
    const app = h("html", null, h("head", null), h("body", null, h("header", null, h("a", { href: "/" }, "Home")),
      h("main", null, h(Suspense, { fallback: h("div", { className: "skeleton" }, h("p", null, "Loading")) }, product)),
      h("footer", null, h("table", null, h("tbody", null, h("tr", null, h("td", null, "footer table")))))));
    return new Response(await renderToReadableStream(app)).text();
  }

  it("puts React's streamed boundaries back where they render, so their content counts inside <main>", async () => {
    const raw = await streamedPage();
    expect(raw).toContain('<div hidden id="S:0">'); // React really streamed it after the shell
    expect(extractPage(raw, { url: NEW_URL })).toMatchObject({
      title: "Type 1 | Shop", h1: "Type 1", counts: { tables: 2, paragraphs: 1, links: 0, images: 0 },
    });
  });

  it("a placeholder swap and a fallback holding its own boundary are placed; a swap it cannot place leaves the page as sent", () => {
    const orphan = `<main><p>Shell</p></main><div hidden id="S:9"><p>Late</p></div><script>$RC("B:9","S:9")</script>`;
    expect(inlineStreamed(orphan)).toBe(orphan);
    const placeholder = `<main><template id="P:1"></template></main><div hidden id="S:1"><div><p>A</p></div><p>B</p></div><script>$RS("S:1","P:1")</script>`;
    expect(extractPage(placeholder, { url: NEW_URL }).counts.paragraphs).toBe(2);
    // The whole fallback goes, a boundary nested inside it included.
    const nested = `<main><!--$?--><template id="B:0"></template><div><!--$--><p>Skeleton</p><!--/$--><p>Skeleton 2</p></div><!--/$--></main><div hidden id="S:0"><p>Real</p></div><script>$RC("B:0","S:0")</script>`;
    expect(extractPage(nested, { url: NEW_URL }).counts.paragraphs).toBe(1);
  });

  it("a custom element named like a tag is not that tag", () => {
    const page = `<html><head><title>T</title></head><body><main><style-guide><h1>Real</h1></style-guide><style>.x{}</style>
      <table-wrapper><table><tr><td>1</td></tr></table></table-wrapper><img-slider></img-slider><a-button href="/x">X</a-button><p-card>P</p-card></main></body></html>`;
    expect(extractPage(page, { url: NEW_URL })).toMatchObject({ h1: "Real", counts: { tables: 1, images: 0, links: 0, paragraphs: 0 } });
  });
});

describe("seo.head", () => {
  it("identical pages pass — an entity re-encoded, a heading re-wrapped or only the case changed is the same page", async () => {
    const res = await run("seo.head", html(), html({ title: "KOMPOSITHEGN Type 1 – Hegnsfabrikken", h1: "Komposithegn\n  Type 1" }));
    expect(res).toMatchObject({ status: "pass", findings: [], newUrl: NEW_URL });
  });

  it("title drift is a warn, a title gone is a fail", async () => {
    expect(await run("seo.head", html(), html({ title: "Type 1 | Cartwright" }))).toMatchObject({ status: "warn", fields: ["title:warn"] });
    expect(await run("seo.head", html(), html({ title: "" }))).toMatchObject({ status: "fail", fields: ["title:fail"] });
  });

  it("noindex sent only as an X-Robots-Tag header on the new page fails", async () => {
    const res = await run("seo.head", html(), answer(NEW_URL, html(), { xRobotsTag: "noindex" }));
    expect(res).toMatchObject({ status: "fail", fields: ["noindex:fail"] });
  });

  it("a canonical on another host than the expected one fails, even when the old site's was its own", async () => {
    const res = await run("seo.head", html(), html({ canonical: `${NEW}/da/produkt/type-1/` }));
    expect(res).toMatchObject({ status: "fail", fields: ["canonical:fail"] });
    expect(res.findings[0].detail).toBe(`points at new-shop.example, expected ${HOST}`);
    expect(await run("seo.head", html(), html({ canonical: null }))).toMatchObject({ status: "fail", fields: ["canonical:fail"] });
    // On the expected host, the new URL's own path is as good as the old canonical's.
    expect(await run("seo.head", html(), html({ canonical: `https://${HOST}/da/produkt/type-1/` }))).toMatchObject({ status: "pass" });
    expect(await run("seo.head", html(), html({ canonical: `https://${HOST}/elsewhere/` }))).toMatchObject({ status: "warn", fields: ["canonical:warn"] });
  });

  it("a canonical on the expected host's www twin passes when the old page named it too, and warns when it did not", async () => {
    const www = `https://www.${HOST}/produkt/type-1/`;
    expect(await run("seo.head", html({ canonical: www }), html({ canonical: www }))).toMatchObject({ status: "pass", findings: [] });
    expect(await run("seo.head", html(), html({ canonical: www }))).toMatchObject({ status: "warn", fields: ["canonical:warn"] });
  });

  // R2: with no canonical on the old page, the old URL's path is its canonical.
  it("a canonical on another page warns even when the old page had none; a www twin on another page warns twice", async () => {
    const noCanonical = html({ canonical: null });
    expect(await run("seo.head", noCanonical, html({ canonical: `https://${HOST}/` }))).toMatchObject({ status: "warn", fields: ["canonical:warn"] });
    expect(await run("seo.head", noCanonical, html({ canonical: `https://${HOST}/produkt/type-1/` }))).toMatchObject({ status: "pass" });
    expect(await run("seo.head", noCanonical, html({ canonical: `https://${HOST}/da/produkt/type-1` }))).toMatchObject({ status: "pass" });
    expect(await run("seo.head", html(), html({ canonical: `https://www.${HOST}/` }))).toMatchObject({ status: "warn", fields: ["canonical:warn", "canonical:warn"] });
  });

  it("a page cut at the size cap is never a pass: a robots tag past the cut would go unseen", async () => {
    const res = await run("seo.head", html(), answer(NEW_URL, html(), { truncated: true }));
    expect(res).toMatchObject({ status: "inconclusive", fields: ["head:inconclusive"] });
    expect(await run("seo.head", answer(OLD_URL, html(), { truncated: true }), html({ robots: "noindex" }))).toMatchObject({ status: "fail" });
  });

  it("og:image gone is a warn; a description that changed is a warn", async () => {
    expect(await run("seo.head", html(), html({ og: null }))).toMatchObject({ status: "warn", fields: ["og:image:warn"] });
    expect(await run("seo.head", html(), html({ description: null }))).toMatchObject({ status: "warn", fields: ["description:warn"] });
  });
});

describe("url.content", () => {
  it("identical pages pass", async () => {
    expect(await run("url.content", html(), html())).toMatchObject({ status: "pass", findings: [] });
  });

  it("a 200 that looks like the new site's 404 page is a soft 404 and fails", async () => {
    const res = await run("url.content", html(), NOT_FOUND);
    expect(res.status).toBe("fail");
    expect(res.fields).toContain("soft404:fail");
  });

  it("the h1 or the sku changing fails; fewer tables fail, fewer paragraphs/links/images warn", async () => {
    expect(await run("url.content", html(), html({ h1: "Type 1" }))).toMatchObject({ status: "fail", fields: ["h1:fail"] });
    expect(await run("url.content", html(), html({ sku: "cmabc123" }))).toMatchObject({ status: "fail", fields: ["sku:fail"] });
    // A SKU is an identifier, compared as written: only its case changing is still a change.
    expect(await run("url.content", html({ sku: "Part-A" }), html({ sku: "part-a" }))).toMatchObject({ status: "fail", fields: ["sku:fail"] });
    const thin = html({ body: "<h1>Komposithegn Type 1</h1><p>Et hegn.</p>" });
    expect(await run("url.content", html(), thin)).toMatchObject({
      status: "fail", fields: ["tables:fail", "paragraphs:warn", "links:warn", "images:warn"],
    });
  });

  it("a 404 page that could not be read leaves the row inconclusive, never a pass", async () => {
    expect(await run("url.content", html(), html(), { notFound: null })).toMatchObject({ status: "inconclusive", fields: ["soft404:inconclusive"] });
  });

  it("a page past the size cap is not counted, and says so", async () => {
    const res = await run("url.content", html(), answer(NEW_URL, html({ body: "<h1>Komposithegn Type 1</h1>" }), { truncated: true }));
    expect(res).toMatchObject({ status: "warn", fields: ["counts:warn"] });
  });
});

describe("checkPage — rows that are never a pass", () => {
  it.each([
    ["url.parity did not pass it", entry({ parityStatus: "fail" })],
    ["url.parity never ran", entry({ parityStatus: null, finalUrl: null })],
    ["url.parity measured another new site", entry({ finalUrl: "https://other.example/da/produkt/type-1/" })],
  ])("skip when %s — nothing is fetched", async (_why, e) => {
    const res = await run("seo.head", html(), html(), { entry: e });
    expect(res.status).toBe("skip");
    expect(res.source).not.toHaveBeenCalled();
    expect(res.target).not.toHaveBeenCalled();
  });

  it("follows the old site's own canonicalising redirects (http→https, www twin), never one to another host", async () => {
    const httpUrl = `http://${HOST}/produkt/type-1/`;
    const wwwUrl = `https://www.${HOST}/produkt/type-1/`;
    const source = table({
      [httpUrl]: answer(httpUrl, "", { status: 301, location: wwwUrl }),
      [wwwUrl]: answer(wwwUrl, html()),
    });
    const target = table({ [NEW_URL]: answer(NEW_URL, html()) });
    const ctx = { targetOrigin: NEW, expectedHost: HOST, source, target, notFound: "x|y" };
    expect(await checkPage("seo.head", entry({ oldUrl: httpUrl }), ctx)).toMatchObject({ status: "pass" });
    expect(vi.mocked(source).mock.calls.map((c) => c[0])).toEqual([httpUrl, wwwUrl]);

    const away = table({ [OLD_URL]: answer(OLD_URL, "", { status: 301, location: "https://elsewhere.example/produkt/type-1/" }) });
    expect(await checkPage("seo.head", entry(), { ...ctx, source: away })).toMatchObject({ status: "inconclusive" });
    expect(vi.mocked(away)).toHaveBeenCalledTimes(1);
    const downgrade = table({ [OLD_URL]: answer(OLD_URL, "", { status: 301, location: httpUrl }) });
    expect(await checkPage("seo.head", entry(), { ...ctx, source: downgrade })).toMatchObject({ status: "inconclusive" });
    expect(vi.mocked(downgrade)).toHaveBeenCalledTimes(1);
  });

  it("an old site that does not answer 200 is inconclusive; a new page gone since url.parity is a fail", async () => {
    expect(await run("seo.head", { outcome: "inconclusive", url: OLD_URL, status: 503, reason: "HTTP 503" }, html())).toMatchObject({ status: "inconclusive" });
    expect(await run("seo.head", html(), answer(NEW_URL, "", { status: 404 }))).toMatchObject({ status: "fail" });
  });

  it("summaries keep fails first and count skips apart", () => {
    const s = mergePageSummary(null, [
      { oldUrl: "a", newUrl: "", status: "warn", findings: [{ field: "title", status: "warn" }] },
      { oldUrl: "b", newUrl: "", status: "skip", findings: [] },
      { oldUrl: "c", newUrl: "", status: "fail", findings: [{ field: "noindex", status: "fail" }] },
    ]);
    expect(s).toMatchObject({ processed: 3, counts: { pass: 0, warn: 1, fail: 1, skip: 1, inconclusive: 0 }, fields: { title: 1, noindex: 1 } });
    expect(s.firstErrors.map((r) => r.oldUrl)).toEqual(["c", "b", "a"]);
  });
});

describe("probeNotFound", () => {
  it("reads the new site's own 404 page, through its locale redirect", async () => {
    const fetch = vi.fn<MigrationFetcher>(async (url) =>
      url.includes("/da/") ? answer(url, NOT_FOUND, { status: 404 }) : answer(url, "", { status: 307, location: "/da/cartwright-migration-probe-t1" }));
    expect(await probeNotFound(fetch, NEW, "t1")).toBe("page not found|we could not find that page");
    expect(fetch.mock.calls.map((c) => [c[0], c[1]?.bodyOn404])).toEqual([
      [`${NEW}/cartwright-migration-probe-t1`, true],
      [`${NEW}/da/cartwright-migration-probe-t1`, true],
    ]);
  });

  it("a 404 page with neither a title nor an h1 is still read — and a 200 that looks the same is a soft 404", async () => {
    const bare = `<html><body><h2>404</h2><p>Not found</p></body></html>`;
    const notFound = await probeNotFound(vi.fn(async (url: string) => answer(url, bare, { status: 404 })), NEW, "t3");
    expect(notFound).toBe("|");
    expect(await probeNotFound(vi.fn(async (url: string) => answer(url, "", { status: 404 })), NEW, "t4")).toBe("|");
    const res = await run("url.content", html(), bare, { notFound });
    expect(res.fields).toContain("soft404:fail");
  });

  it("is null when the 404 page cannot be read", async () => {
    expect(await probeNotFound(vi.fn(async (url: string) => answer(url, "", { status: 403 })), NEW, "t2")).toBeNull();
  });
});
