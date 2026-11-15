/**
 * MIGD-4b — the Product a page's JSON-LD describes, as the facts
 * `seo.product-jsonld` compares (./checks/page.ts). Pure. A block is someone
 * else's data, so nothing here throws on one: a block that does not parse is
 * counted, and nesting past MAX_DEPTH is not read.
 *
 * It reads the shapes WooCommerce, Yoast and this engine emit: one object, an
 * array or an `@graph`; a node nested in another (`WebPage.mainEntity`) or named
 * by reference (`{"@id": …}`); offers as an Offer, an array of them, an
 * AggregateOffer, or on a ProductGroup's variants, inside it or beside it; a
 * price as a JSON number or a string, on the offer or in its `priceSpecification`.
 * A sku, currency or availability in any other shape is not read, and is named in
 * `unreadableFields` rather than taken for none. What else it cannot use, such as an
 * `image` that is a number or an `offers` entry that is no node, is dropped unnamed.
 */

type LdNode = Record<string, unknown>;

export type ProductFacts = {
  /** Null when none is written, or `unreadableFields` names it. */
  sku: string | null;
  /** The Product has an `offers` (or a variant's). */
  offered: boolean;
  /** Integer minor units, the lowest offer's. Null when no offer names a price, or `unreadablePrice` says why the lowest is not known. */
  price: number | null;
  /** What keeps the lowest from being known, for the report: the first price written that is no number ("Call for price"), the currencies when the offers name several, or a currency that cannot be read, since it sets the scale. */
  unreadablePrice: string | null;
  /** Upper case, as the offers name it. Null when they name none, so their prices are in the shop's own, or several (`severalCurrencies`), or `unreadableFields` names it. */
  currency: string | null;
  severalCurrencies: boolean;
  /** The schema.org term ("InStock"): in stock when any offer is, else the first offer's. Null when none is written, or `unreadableFields` names it: the offer not read could be the one in stock. */
  availability: string | null;
  /** How many different images the Product names; with none of its own, how many its variants name. A URL only tells two apart. */
  images: number;
  /** The fields written in a shape this reader skips: a list, an object, a value `term` cannot read. Not a blank or a null, which is no value at all. */
  unreadableFields: ("sku" | "priceCurrency" | "availability")[];
};

const MAX_DEPTH = 32;
const isNode = (v: unknown): v is LdNode => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
/** A schema.org term from any of its spellings: `https://schema.org/InStock`, `http://…`, `schema:InStock`, `InStock`. */
const term = (v: unknown) => (typeof v === "string" ? v.trim().replace(/^.*[/:#]/, "") : "");
const isType = (n: LdNode, ...names: string[]) => list(n["@type"]).some((t) => names.includes(term(t)));
const identifier = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() || null : null);
/** A blank or a null is no value, so it never hides the next one and is never unreadable. */
const isWritten = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v !== undefined && v !== null);
/** The images `v` names, each as its URL however it is written; a node naming none stands for itself. */
const imagesIn = (v: unknown) => list(v).map((i) => (typeof i === "string" ? i.trim() : isNode(i) ? (identifier(i.url) ?? identifier(i.contentUrl) ?? identifier(i["@id"]) ?? i) : "")).filter(Boolean);

/** A currency's minor-unit digits (DKK 2, JPY 0, BHD 3). A code Intl does not know is only ever compared with itself, so any scale will do. */
function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * A JSON-LD price as integer minor units, by decimal digits so no float rounds
 * it: 999 and "999.00" are 99900 in DKK. Schema.org's own form only — a decimal
 * point and no grouping — so "1.299,00" is no price (null), never 1.299.
 */
export function minorUnits(value: unknown, currency: string): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return null;
  const digits = minorDigits(currency);
  const fraction = (m[2] ?? "").padEnd(digits + 1, "0");
  const minor = Number(m[1] + fraction.slice(0, digits)) + (fraction[digits] >= "5" ? 1 : 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** What `walk` gathers: `ids` keyed by each `@id` resolved against the page (`base`), so `#offer` and the page's URL + `#offer` are one node. A blank `@id` is none, though a URL parser reads it as the page itself: it resolves to "", which `walk` stores nothing under. */
type Graph = { base: string; ids: Map<string, LdNode>; candidates: LdNode[]; lists: LdNode[] };
const resolveId = (id: string, base: string) => (id.trim() === "" ? "" : URL.canParse(id, base) ? new URL(id, base).href : id);
/** The `@id` a node only refers to: `{"@id": …}`, perhaps with its `@type`, says nothing of its own. A blank one refers to nothing. */
const refOf = (n: LdNode) => (typeof n["@id"] === "string" && Object.keys(n).every((k) => k === "@id" || k === "@type") ? n["@id"] : null);

/**
 * Every node with an `@id`, and the page's candidates for its Product: the
 * outermost ones. A product inside another (a variant, `isRelatedTo`) or inside
 * an ItemList (a cross-sell carousel) is not what the page sells.
 */
function walk(v: unknown, open: boolean, depth: number, graph: Graph): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(v)) {
    for (const item of v) walk(item, open, depth + 1, graph);
    return;
  }
  if (!isNode(v)) return;
  const stub = refOf(v) !== null;
  const id = typeof v["@id"] === "string" ? resolveId(v["@id"], graph.base) : "";
  if (id !== "" && !stub) graph.ids.set(id, v);
  const product = isType(v, "Product", "ProductGroup");
  const itemList = isType(v, "ItemList");
  if (open && product && !stub) graph.candidates.push(v);
  if (itemList) graph.lists.push(v);
  for (const item of Object.values(v)) walk(item, open && !product && !itemList, depth + 1, graph);
}

/** A blank names no path, though a URL parser reads it as the page itself. The query counts only when the page's own URL carries one (`/?product=fence`): a variant's `?attribute_*` on a query-less page's path is still that path. */
const pathOf = (u: unknown, base: string) => (typeof u === "string" && u.trim() !== "" && URL.canParse(u, base) ? new URL(u, base).pathname.replace(/\/+$/, "") + (new URL(base).search && new URL(u, base).search) : null);
/**
 * How firmly a Product names this very page. 2: by its `mainEntityOfPage` or `url`.
 * Only with no `url` does its `@id` speak: 2 as the page's own address, 1 with a
 * `#fragment`, since any node of this page can carry this page's path in one.
 */
function namesPage(n: LdNode, pageUrl: string): 0 | 1 | 2 {
  const here = (u: unknown) => pathOf(u, pageUrl) === pathOf(pageUrl, pageUrl);
  const main = list(n.mainEntityOfPage).flatMap((m) => (isNode(m) ? [m["@id"], ...list(m.url)] : [m]));
  const urls = list(n.url).filter((u) => pathOf(u, pageUrl) !== null);
  if ([...main, ...urls].some(here)) return 2;
  if (urls.length > 0 || !here(n["@id"])) return 0;
  return String(n["@id"]).includes("#") ? 1 : 2;
}

/** The nodes `v` names. A reference goes one step, so one to itself ends here; one to nothing is no node. */
const nodesIn = (graph: Graph) => (v: unknown) =>
  list(v).map((n) => {
    const ref = isNode(n) ? refOf(n) : null;
    return ref === null ? n : graph.ids.get(resolveId(ref, graph.base));
  }).filter(isNode);
type Nodes = ReturnType<typeof nodesIn>;

/** Each candidate's variants, however a flat `@graph` links them: it names them in `hasVariant`, or they name it in `isVariantOf` (Google's documented flat shape). */
function variantsByCandidate(candidates: readonly LdNode[], nodes: Nodes): Map<LdNode, LdNode[]> {
  const variants = new Map<LdNode, LdNode[]>(candidates.map((c) => [c, nodes(c.hasVariant).filter((v) => v !== c)]));
  for (const c of candidates) for (const group of nodes(c.isVariantOf)) if (group !== c) variants.get(group)?.push(c);
  return variants;
}

/**
 * The page's own Product. A flat `@graph` names by reference what a nested one
 * holds inside (see `walk`), so a variant beside its group is never it. Of the
 * rest, the one naming the page most firmly wins (`namesPage`), then one no other
 * product or list points at (a related product can point either way, so this only
 * breaks a tie), then the first.
 */
function ownProduct({ base, candidates, lists }: Graph, variants: ReadonlyMap<LdNode, LdNode[]>, nodes: Nodes): LdNode | null {
  const isVariant = new Set([...variants.values()].flat());
  const pointedAt = new Set([
    ...candidates.flatMap((c) => [c.isRelatedTo, c.isSimilarTo].flatMap(nodes)),
    ...lists.flatMap((l) => nodes(l.itemListElement)).flatMap((item) => [item, ...nodes(item.item)]),
  ]);
  const rank = (n: LdNode) => (isVariant.has(n) ? 0 : 8) + namesPage(n, base) * 2 + (pointedAt.has(n) ? 0 : 1);
  return candidates.reduce<LdNode | null>((best, n) => (best && rank(best) >= rank(n) ? best : n), null);
}

/** A price as written, for the report. An object or a list is only named: printing someone else's can throw. */
const asWritten = (price: unknown) => (typeof price === "object" ? "(an object or a list)" : String(price).slice(0, 80));

function factsOf(product: LdNode, variants: readonly LdNode[], nodes: Nodes, shopCurrency: string): ProductFacts {
  const specs = (offer: LdNode) => nodes(offer.priceSpecification);
  // The first price an offer writes. A blank one is no price, so it never hides the next.
  const priceOf = (offer: LdNode) => [offer.lowPrice, offer.price, ...specs(offer).map((s) => s.price)].find(isWritten);
  const offers = [product, ...variants].flatMap((c) => nodes(c.offers));
  const everyOffer = [...offers, ...offers.flatMap((o) => nodes(o.offers))];
  // An AggregateOffer's lowPrice speaks for the offers inside it; with no price of its own, they speak.
  const written = offers.flatMap((o) => (priceOf(o) !== undefined ? [priceOf(o)] : nodes(o.offers).map(priceOf))).filter((p) => p !== undefined);

  const named = everyOffer.flatMap((o) => [o.priceCurrency, ...specs(o).map((s) => s.priceCurrency)]).filter(isWritten);
  const currencies = [...new Set(named.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : "")).filter(Boolean))];
  const currencyUnread = named.some((c) => typeof c !== "string");
  const currency = currencies.length === 1 && !currencyUnread ? currencies[0] : null;
  const minors = written.map((p) => minorUnits(p, currency ?? shopCurrency));
  const prices = minors.filter((p) => p !== null);
  // The lowest needs every price read, in one currency: the one left out could be it.
  const unreadable = currencies.length > 1 ? `offers in ${currencies.join(" and ")}` : currencyUnread ? "a currency that cannot be read" : written.find((_, i) => minors[i] === null);
  const stock = everyOffer.map((o) => o.availability).filter(isWritten).map(term);
  const stockUnread = stock.includes("");
  // A productGroupID stands in only where no sku is written, so it never hides one that cannot be read.
  const sku = [product.sku, product.productGroupID].find(isWritten);
  const skuUnread = sku !== undefined && identifier(sku) === null;
  return {
    sku: identifier(sku),
    offered: offers.length > 0,
    price: unreadable === undefined && prices.length > 0 ? prices.reduce((low, p) => Math.min(low, p)) : null,
    unreadablePrice: unreadable === undefined ? null : asWritten(unreadable),
    currency,
    severalCurrencies: currencies.length > 1,
    availability: stockUnread ? null : (stock.find((s) => s.toLowerCase() === "instock") ?? stock[0] ?? null),
    // The same image named twice is one, so a group whose images sit on its variants has as many as differ, not as many as it has variants.
    images: new Set(imagesIn(product.image)).size || new Set(variants.flatMap((v) => imagesIn(v.image))).size,
    unreadableFields: [...(skuUnread ? ["sku" as const] : []), ...(currencyUnread ? ["priceCurrency" as const] : []), ...(stockUnread ? ["availability" as const] : [])],
  };
}

/** The Product these `application/ld+json` bodies describe (`ownProduct`), and how many bodies did not parse. */
export function readProduct(blocks: readonly string[], page: { url: string; currency: string }): { product: ProductFacts | null; unreadableBlocks: number } {
  const graph: Graph = { base: page.url, ids: new Map(), candidates: [], lists: [] };
  let unreadableBlocks = 0;
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      unreadableBlocks++;
      continue;
    }
    walk(parsed, true, 0, graph);
  }
  const nodes = nodesIn(graph);
  const variants = variantsByCandidate(graph.candidates, nodes);
  const own = ownProduct(graph, variants, nodes);
  return { product: own ? factsOf(own, variants.get(own) ?? [], nodes, page.currency) : null, unreadableBlocks };
}
