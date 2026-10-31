import type { MigrationFetcher, MigrationResponse } from "../fetch";
import { extractPage, fingerprint, jsonLdBlocks, norm, type PageExtract } from "../html";
import { readProduct, type ProductFacts } from "../jsonld";
import { isVariantQuery } from "./url";

/**
 * MIGD-4a/4b — the page checks: does a frozen URL that `url.parity` found on
 * the new site say the same thing there? All read the SAME pair of pages, the
 * old one live on the source host and the new one at the URL url.parity ended
 * on, so they need the source site still up: before the DNS switch only (the
 * frozen head extract that would let them run after it is a later slice).
 *
 *   url.content  soft 404 (the new page looks like the new site's own 404 page)  fail
 *                <h1> differs or is gone · JSON-LD sku differs or is gone        fail
 *                fewer tables inside <main>                                       fail
 *                fewer paragraphs, links or images inside <main>                 warn
 *   seo.head     noindex (meta tag OR X-Robots-Tag) on the new page, not the old   fail
 *                canonical gone, or on another host than the expected one        fail
 *                canonical on the expected host's www twin, unlike the old one   warn
 *                <title> gone                                                    fail
 *                title or meta description differs · og:image gone              warn
 *                canonical path not the old canonical's/URL's nor the new URL's  warn
 *                the old page noindex, the new one indexable                     warn
 *                a page cut at the size cap (a tag past the cut unread)  inconclusive
 *   seo.product-jsonld (frozen product URLs; ../jsonld.ts reads each page's Product)
 *                no Product on the new page · sku · priceCurrency · price
 *                availability (http, https or short: the same) differ            fail
 *                the new page makes no offer · every image gone                  fail
 *                the old page makes no offer, or names no price, and the new
 *                one does · fewer different images                               warn
 *                no Product on the old page · a variant URL (?attribute_*)        skip
 *                the old page's Product or any price unreadable, its sku, currency or
 *                availability in a shape the reader skips, its offers in two
 *                currencies, or either page cut or a block not parsing   inconclusive
 *
 * A row url.parity has not found on the new site (not run, missing, failed, or
 * measured on another target) is `skip`; a source that does not answer 200, or
 * a 404 page that cannot be read, is `inconclusive` — neither is ever a pass.
 * Pure over injected fetchers; never throws on its input.
 */

export const PAGE_CHECKS = ["url.content", "seo.head", "seo.product-jsonld"] as const;
export type PageCheckId = (typeof PAGE_CHECKS)[number];
export type PageRowStatus = "pass" | "warn" | "fail" | "skip" | "inconclusive";
export type PageFinding = { field: string; status: "warn" | "fail" | "inconclusive"; old?: string | number | null; new?: string | number | null; detail?: string };
export type PageCheckResult = { oldUrl: string; newUrl: string; status: PageRowStatus; findings: PageFinding[]; detail?: string };
/** A frozen row and what url.parity last found for it (`lastStatus`, `lastDetail.finalUrl`). */
export type PageEntry = { oldUrl: string; parityStatus: string | null; finalUrl: string | null };

/** Big enough for a WooCommerce product page; past it the counts are not compared. */
export const PAGE_MAX_BYTES = 1024 * 1024;
const WORST = ["fail", "inconclusive", "skip", "warn"] as const;
export const worstOf = (statuses: Iterable<PageRowStatus>): PageRowStatus => {
  const all = new Set(statuses);
  return WORST.find((s) => all.has(s)) ?? "pass";
};

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
/** A host without its `www.` — the freeze treats a host and its www twin as one site (store.ts `bareHost`). */
const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
const pathOf = (u: string | null) => (u && URL.canParse(u) ? stripSlash(new URL(u).pathname) : null);

export function judgeContent(old: PageExtract, neu: PageExtract, ctx: { notFound: string | null; truncated: boolean }): PageFinding[] {
  const out: PageFinding[] = [];
  const mine = fingerprint(neu);
  if (ctx.notFound === null) out.push({ field: "soft404", status: "inconclusive", detail: "the new site's 404 page could not be read, so a soft 404 is not ruled out" });
  else if (mine === ctx.notFound && fingerprint(old) !== ctx.notFound) out.push({ field: "soft404", status: "fail", new: neu.title, detail: "answers 200 but looks like the new site's 404 page" });
  if (norm(old.h1) && norm(neu.h1) !== norm(old.h1)) out.push({ field: "h1", status: "fail", old: old.h1, new: neu.h1 || null });
  // Exact: a SKU is an identifier (lib/acp looks it up as written), so "Part-A" → "part-a" is a change.
  if (old.sku && neu.sku !== old.sku) out.push({ field: "sku", status: "fail", old: old.sku, new: neu.sku });
  if (ctx.truncated) {
    out.push({ field: "counts", status: "warn", detail: `a page is over ${PAGE_MAX_BYTES / 1024} KB, so paragraphs, tables, links and images were not counted` });
    return out;
  }
  for (const k of ["tables", "paragraphs", "links", "images"] as const) {
    if (neu.counts[k] < old.counts[k]) out.push({ field: k, status: k === "tables" ? "fail" : "warn", old: old.counts[k], new: neu.counts[k] });
  }
  return out;
}

export function judgeHead(old: PageExtract, neu: PageExtract, ctx: { expectedHost: string; oldUrl: string; newUrl: string; truncated: boolean }): PageFinding[] {
  const out: PageFinding[] = [];
  if (ctx.truncated) {
    out.push({ field: "head", status: "inconclusive", detail: `a page is over ${PAGE_MAX_BYTES / 1024} KB, so a robots directive or head tag past the cut could be missed` });
  }
  if (neu.noindex && !old.noindex) out.push({ field: "noindex", status: "fail", detail: "the new page tells search engines not to index it (robots meta tag or X-Robots-Tag)" });
  if (old.noindex && !neu.noindex) out.push({ field: "noindex", status: "warn", detail: "the old page was noindex, the new one is indexable" });
  const host = neu.canonical ? new URL(neu.canonical).hostname.toLowerCase() : null;
  if (!host) {
    if (old.canonical) out.push({ field: "canonical", status: "fail", old: old.canonical, new: null });
  } else if (bareHost(host) !== bareHost(ctx.expectedHost)) {
    out.push({ field: "canonical", status: "fail", new: neu.canonical, detail: `points at ${host}, expected ${ctx.expectedHost}` });
  } else {
    if (host !== ctx.expectedHost.toLowerCase() && (!old.canonical || new URL(old.canonical).hostname.toLowerCase() !== host)) {
      // The www twin of the expected host: the same site, but not the host the old page named.
      out.push({ field: "canonical", status: "warn", old: old.canonical, new: neu.canonical, detail: `points at ${host}, expected ${ctx.expectedHost}` });
    }
    // Its path is the old canonical's, or (with none) the old URL's, or the new URL's own.
    if (![pathOf(old.canonical ?? ctx.oldUrl), pathOf(ctx.newUrl)].includes(pathOf(neu.canonical))) {
      out.push({ field: "canonical", status: "warn", old: old.canonical, new: neu.canonical, detail: "points at another page" });
    }
  }
  if (norm(old.title) && !norm(neu.title)) out.push({ field: "title", status: "fail", old: old.title, new: null });
  else if (norm(neu.title) !== norm(old.title)) out.push({ field: "title", status: "warn", old: old.title, new: neu.title });
  if (norm(neu.description) !== norm(old.description)) out.push({ field: "description", status: "warn", old: old.description, new: neu.description });
  if (old.ogImage && !neu.ogImage) out.push({ field: "og:image", status: "warn", old: old.ogImage, new: null });
  return out;
}

/**
 * What the new page's Product holds against the old one's. Images by count, never by URL: their
 * URLs change by design until the media import. The new page's sku falls back to the product's id,
 * so a product without a SKU here reads as a different one, as in judgeContent.
 */
export function judgeProduct(old: ProductFacts, neu: ProductFacts, shopCurrency: string): PageFinding[] {
  const out: PageFinding[] = [];
  const newPrice = neu.unreadablePrice ?? neu.price;
  if (old.sku && neu.sku !== old.sku) out.push({ field: "sku", status: "fail", old: old.sku, new: neu.sku });
  if (!neu.offered) out.push({ field: "offers", status: "fail", detail: "the new page makes no offer, and the product is not marked lead-only" });
  else if (!old.offered) out.push({ field: "offers", status: "warn", new: newPrice, detail: "the old page makes no offer, the new one does" });
  else {
    // A side naming no currency is in the shop's own, as its prices were scaled. Offers in several, or in one that cannot be read, have no one currency: on the old page that holds the new one to nothing, on the new it is the difference.
    const oneCurrency = (f: ProductFacts) => !f.severalCurrencies && !f.unreadableFields.includes("priceCurrency");
    const [oldIn, newIn] = [old.currency ?? shopCurrency, oneCurrency(neu) ? (neu.currency ?? shopCurrency) : null];
    if (oneCurrency(old) && newIn !== oldIn) out.push({ field: "priceCurrency", status: "fail", old: oldIn, new: newIn ?? neu.unreadablePrice, detail: "a page naming no currency counts as in the shop's own" });
    if (old.unreadablePrice) out.push({ field: "price", status: "inconclusive", old: old.unreadablePrice, detail: "the old page's price cannot be read as one number, so it cannot be compared" });
    // An offer naming no price is the no-offer case above in another shape: a product imported without one would show Google 0.00 silently.
    else if (old.price === null && newPrice !== null) out.push({ field: "price", status: "warn", new: newPrice, detail: "the old page's offer names no price, the new one does" });
    // Two currencies that differ have no price to compare: priceCurrency has said so.
    else if (old.price !== null && neu.price !== old.price && (newIn === null || newIn === oldIn)) {
      out.push({ field: "price", status: "fail", old: old.price, new: newPrice, detail: "in integer minor units" });
    }
    if (old.availability && neu.availability?.toLowerCase() !== old.availability.toLowerCase()) out.push({ field: "availability", status: "fail", old: old.availability, new: neu.availability });
  }
  if (neu.images < old.images) out.push({ field: "image", status: neu.images === 0 ? "fail" : "warn", old: old.images, new: neu.images });
  // A field the reader skipped on the old page holds the new one to nothing above: unknown, never a pass. On the new page, our own, it reads as gone and fails above against an old value, as an unreadable price does.
  for (const field of old.unreadableFields) out.push({ field, status: "inconclusive", detail: "the old page writes this field in a shape that is not read, so it cannot be compared" });
  return out;
}

type PageAnswer = Extract<MigrationResponse, { outcome: "answer" }>;

/** seo.product-jsonld over two pages that answered. `readProduct` merges every block into one graph, so what a cut page or a block that does not parse leaves out can be a cheaper variant or the page's own Product: never a pass, inconclusive unless a difference shows. */
function productRow(old: PageAnswer, neu: PageAnswer, currency: string): Pick<PageCheckResult, "status" | "findings" | "detail"> {
  const notWhole = (side: string, truncated: boolean, unreadableBlocks: number): PageFinding[] =>
    [...(truncated ? [`the ${side} page is over ${PAGE_MAX_BYTES / 1024} KB`] : []), ...(unreadableBlocks > 0 ? [`a JSON-LD block on the ${side} page does not parse`] : [])]
      .map((why) => ({ field: "jsonld", status: "inconclusive", detail: `${why}, so a variant or a Product in what was not read could be missed` }));
  const a = readProduct(jsonLdBlocks(old.body), { url: old.url, currency });
  const oldUnread = notWhole("old", old.truncated, a.unreadableBlocks);
  if (!a.product) return oldUnread.length > 0 ? { status: "inconclusive", findings: oldUnread } : { status: "skip", findings: [], detail: "the old page has no Product structured data to compare" };
  const b = readProduct(jsonLdBlocks(neu.body), { url: neu.url, currency });
  const newUnread = notWhole("new", neu.truncated, b.unreadableBlocks);
  if (!b.product) {
    if (neu.truncated) return { status: "inconclusive", findings: newUnread };
    const detail = b.unreadableBlocks > 0 ? "a JSON-LD block on the new page does not parse, and no other holds a Product" : "the new page has no Product structured data";
    return { status: "fail", findings: [{ field: "product", status: "fail", old: a.product.sku, new: null, detail }] };
  }
  const findings = [...judgeProduct(a.product, b.product, currency), ...oldUnread, ...newUnread];
  return { status: worstOf(findings.map((f) => f.status)), findings };
}

/** A redirect that stays on the same origin. */
const sameOrigin = (from: URL, to: URL) => to.origin === from.origin;
/**
 * A redirect the old site makes to canonicalise itself: to its www twin and/or
 * from http to https, on the default port. The source fetcher's allowlist (the
 * host and its twin) and SSRF guard still judge every hop.
 */
export const sourceHop = (from: URL, to: URL) =>
  bareHost(to.hostname) === bareHost(from.hostname) &&
  (to.protocol === from.protocol || (from.protocol === "http:" && to.protocol === "https:")) &&
  (to.port === from.port || to.port === "");

/** Follow at most 3 redirects to a page, each one `follows` allows. */
async function getPage(
  fetch: MigrationFetcher,
  url: string,
  opts: { bodyOn404?: boolean } = {},
  follows: (from: URL, to: URL) => boolean = sameOrigin,
): Promise<MigrationResponse> {
  let res = await fetch(url, { maxBytes: PAGE_MAX_BYTES, ...opts });
  for (let hop = 0; hop < 3 && res.outcome === "answer" && res.status >= 300 && res.status < 400 && res.location; hop++) {
    const next = URL.canParse(res.location, res.url) ? new URL(res.location, res.url) : null;
    if (!next || !follows(new URL(res.url), next)) break;
    res = await fetch(next.href, { maxBytes: PAGE_MAX_BYTES, ...opts });
  }
  return res;
}

/**
 * The new site's own not-found page, as a fingerprint — what a soft 404 looks
 * like there. A path no site has; a 200 answer (a catch-all) counts too. Null
 * only when it does not answer 404 or 200: no soft 404 can then be ruled out.
 */
export async function probeNotFound(target: MigrationFetcher, targetOrigin: string, token: string): Promise<string | null> {
  const res = await getPage(target, `${new URL(targetOrigin).origin}/cartwright-migration-probe-${token}`, { bodyOn404: true });
  if (res.outcome !== "answer" || (res.status !== 404 && res.status !== 200) || (res.status === 200 && !res.body)) return null;
  // A 404 page without a title or h1 (or any body) is still the site's 404 page: "|".
  return fingerprint(extractPage(res.body, { url: res.url }));
}

export async function checkPage(
  checkId: PageCheckId,
  entry: PageEntry,
  ctx: { targetOrigin: string; expectedHost: string; source: MigrationFetcher; target: MigrationFetcher; notFound: string | null; currency: string },
): Promise<PageCheckResult> {
  const row = (status: PageRowStatus, findings: PageFinding[] = [], detail?: string): PageCheckResult =>
    ({ oldUrl: entry.oldUrl, newUrl: entry.finalUrl ?? "", status, findings, ...(detail ? { detail } : {}) });
  const reachable = (entry.parityStatus === "pass" || entry.parityStatus === "warn") && !!entry.finalUrl && URL.canParse(entry.finalUrl);
  if (!reachable || new URL(entry.finalUrl!).origin !== new URL(ctx.targetOrigin).origin) {
    return row("skip", [], "url.parity has not found this URL on the new site; run url.parity first");
  }
  if (!URL.canParse(entry.oldUrl)) return row("fail", [], "the frozen URL is not a URL");
  if (checkId === "seo.product-jsonld" && isVariantQuery(new URL(entry.oldUrl))) {
    return row("skip", [], "a variant URL (?attribute_*): the variant it selects is not compared yet");
  }
  const [old, neu] = await Promise.all([getPage(ctx.source, entry.oldUrl, {}, sourceHop), ctx.target(entry.finalUrl!, { maxBytes: PAGE_MAX_BYTES })]);
  if (old.outcome !== "answer" || old.status !== 200) {
    return row("inconclusive", [], `the old page did not answer 200 (${old.outcome === "answer" ? `HTTP ${old.status}` : old.reason})`);
  }
  if (neu.outcome === "inconclusive") return row("inconclusive", [], `the new page did not answer (${neu.reason})`);
  if (neu.outcome !== "answer" || neu.status !== 200) {
    return row("fail", [], `the new page no longer answers 200 (${neu.outcome === "answer" ? `HTTP ${neu.status}` : neu.reason}); run url.parity again`);
  }
  if (checkId === "seo.product-jsonld") {
    const product = productRow(old, neu, ctx.currency.trim().toUpperCase());
    return row(product.status, product.findings, product.detail);
  }
  const a = extractPage(old.body, { url: old.url, xRobotsTag: old.xRobotsTag });
  const b = extractPage(neu.body, { url: neu.url, xRobotsTag: neu.xRobotsTag });
  const findings = checkId === "url.content"
    ? judgeContent(a, b, { notFound: ctx.notFound, truncated: old.truncated || neu.truncated })
    : judgeHead(a, b, { expectedHost: ctx.expectedHost, oldUrl: old.url, newUrl: neu.url, truncated: old.truncated || neu.truncated });
  return row(worstOf(findings.map((f) => f.status)), findings);
}

export type PageCheckSummary = {
  counts: Record<PageRowStatus, number>;
  /** Non-passing findings per field ("title": 40). */
  fields: Record<string, number>;
  processed: number;
  /** At most 20 non-pass rows: fails, inconclusive, skips, then warns. */
  firstErrors: PageCheckResult[];
};

/** `rows` added to the run so far (`prev`). */
export function mergePageSummary(prev: PageCheckSummary | null, rows: readonly PageCheckResult[]): PageCheckSummary {
  const counts: Record<PageRowStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0, inconclusive: 0, ...prev?.counts };
  const fields: Record<string, number> = { ...prev?.fields };
  for (const r of rows) {
    counts[r.status]++;
    for (const f of r.findings) fields[f.field] = (fields[f.field] ?? 0) + 1;
  }
  const errors = [...(prev?.firstErrors ?? []), ...rows];
  const firstErrors = WORST.flatMap((s) => errors.filter((r) => r.status === s)).slice(0, 20);
  return { counts, fields, processed: (prev?.processed ?? 0) + rows.length, firstErrors };
}
