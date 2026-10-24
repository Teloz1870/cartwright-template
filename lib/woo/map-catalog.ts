import { createHash } from "node:crypto";

import { SLUG_RULE, slugifyOrEmpty } from "@/lib/tools/slug";
import { permalinkKey } from "@/lib/urls";
import type { WooSnapshot, WooStoreCategory, WooStoreProduct, WooWpProduct } from "@/lib/woo/types";

/**
 * W21-live — a Woo catalogue mapped to the Category and Product fields the
 * importer OWNS. Pure. The plan fingerprints these projections and a run will
 * write them. Images, variants, compare-at price and stock are not projected
 * yet: each joins with its own slice and a `WOO_MAPPING_VERSION` bump.
 */

/** Bump on any mapping change, so every fingerprint changes with it. */
export const WOO_MAPPING_VERSION = 1;
export const WOO_SOURCE = "woocommerce";

export type WooWarning = { code: "slugRewritten" | "primaryCategoryFallback" | "noPrice" | "permalinkUnset" | "extraCategoryDropped"; externalId: string; detail: string };

export type MappedCategory = {
  externalId: string;
  slug: string;
  name: string;
  /** Woo's own pathname, trailing slash and all; null when it has no path (`/?product=x`). */
  permalink: string | null;
  parentExternalId: string | null;
  description: string;
};

export type MappedProduct = {
  externalId: string;
  slug: string;
  name: string;
  permalink: string | null;
  sku: string | null;
  /** Øre, scaled from the currency's minor unit; a variable product's is Woo's min price. */
  priceDkk: number;
  /**
   * From wp/v2, each on its own. Absent = not in this snapshot (wp/v2 did not
   * answer for the product; for the SEO pair, it sent no Yoast head) — NOT
   * removed at the source: the plan keeps the stored value.
   */
  status?: "active" | "draft";
  categoryExternalId: string | null;
  extraCategoryExternalIds: string[];
  description: string;
  answerSummary: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  attributes: Record<string, string[]>;
};

/** Every HTML character reference — named (`&aelig;`), decimal, hex — decoded once, by the HTML parser's own rules. */
export type HtmlDecode = (text: string) => string;

let decoder: Promise<HtmlDecode> | null = null;

/**
 * The decoder is jsdom's HTML parser: a `<textarea>` parses its content as
 * RCDATA, so references are decoded and nothing else is. jsdom is LOADED
 * lazily, as in lib/v0/transform/sanitize-strict.ts — importing it crosses a
 * CJS→ESM boundary, and lib/woo will sit behind the tool registry.
 */
export function htmlDecoder(): Promise<HtmlDecode> {
  decoder ??= import("jsdom").then(
    ({ JSDOM }) => {
      const area = new JSDOM("").window.document.createElement("textarea");
      return (text: string) => {
        area.innerHTML = text;
        return area.value;
      };
    },
    (err: unknown) => {
      decoder = null; // a failed load is retried on the next call
      throw err;
    },
  );
  return decoder;
}

/** Woo HTML → plain text (the sanitised HTML itself is W21-live-4's): tags out, then references decoded. */
function textOf(html: string, decode: HtmlDecode): string {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * The query vars WordPress and WooCommerce address an entry by when pretty
 * permalinks are off — `get_permalink` (`?p=`), `get_page_link` (`?page_id=`),
 * `get_post_permalink` (`?product=<slug>`, or `?post_type=product&p=` while
 * unpublished), `get_term_link` (`?product_cat=<slug>`, `?taxonomy=&term=`),
 * `get_category_link`/`get_tag_link` (`?cat=`, `?tag=`) — under whatever
 * path WordPress is installed at (`/wordpress/?product=x`).
 */
const PLAIN_PERMALINK_VARS = ["p", "page_id", "attachment_id", "post_type", "cat", "tag", "taxonomy", "term", "product", "product_cat", "product_tag", "product_brand"];

/** The pathname as Woo sent it, or null (the slug pattern applies) for a plain permalink, whose path is only the install's: it would put one address on every row. */
function storedPermalink(raw: string, externalId: string, warnings: WooWarning[]): string | null {
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    // not absolute: kept as sent
  }
  const path = url ? url.pathname : raw;
  const plain = url !== null && PLAIN_PERMALINK_VARS.some((name) => url.searchParams.has(name));
  if (!plain && permalinkKey(path) !== null) return path;
  warnings.push({ code: "permalinkUnset", externalId, detail: `${raw} has no path of its own; the slug pattern applies` });
  return null;
}

/** Woo sends an `æ/ø/å` slug percent-encoded: decode; keep it if it meets the rule, else rewrite it and say so. */
function storedSlug(raw: string, externalId: string, warnings: WooWarning[]): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // undecodable: the rule below rewrites it
  }
  if (SLUG_RULE.test(decoded)) return decoded;
  const slug = slugifyOrEmpty(decoded) || `woo-${externalId}`;
  warnings.push({ code: "slugRewritten", externalId, detail: `${raw} → ${slug}` });
  return slug;
}

/** The DEEPEST of the product's categories whose permalink is a path prefix of its own; else the first listed, with a warning. */
function primaryCategory(product: WooStoreProduct, permalinks: ReadonlyMap<number, string>, warnings: WooWarning[]): number | null {
  const own = permalinkKey(product.permalink) ?? "";
  let best: { id: number; depth: number } | null = null;
  for (const ref of product.categories) {
    const key = permalinkKey(permalinks.get(ref.id) ?? ref.link ?? "");
    if (!key || !own.startsWith(`${key}/`)) continue;
    const depth = key.split("/").length;
    if (!best || depth > best.depth) best = { id: ref.id, depth };
  }
  if (best) return best.id;
  const first = product.categories[0];
  if (first) {
    const detail = `no category permalink is a prefix of ${product.permalink}; using ${first.slug}`;
    warnings.push({ code: "primaryCategoryFallback", externalId: String(product.id), detail });
  }
  return first?.id ?? null;
}

export function mapCategory(category: WooStoreCategory, warnings: WooWarning[], decode: HtmlDecode): MappedCategory {
  const externalId = String(category.id);
  return {
    externalId,
    slug: storedSlug(category.slug, externalId, warnings),
    name: textOf(category.name, decode),
    permalink: storedPermalink(category.permalink, externalId, warnings),
    parentExternalId: category.parent ? String(category.parent) : null,
    description: textOf(category.description ?? "", decode),
  };
}

export function mapProduct(
  product: WooStoreProduct,
  ctx: { categoryPermalinks: ReadonlyMap<number, string>; wp?: WooWpProduct; decode: HtmlDecode },
  warnings: WooWarning[],
): MappedProduct {
  const externalId = String(product.id);
  const text = (html: string) => textOf(html, ctx.decode);
  const primary = primaryCategory(product, ctx.categoryPermalinks, warnings);
  const { price, currency_minor_unit: minor } = product.prices;
  if (!/^\d+$/.test(price)) warnings.push({ code: "noPrice", externalId, detail: `price "${price}"` });
  const attributes: Record<string, string[]> = {};
  if (product.tags.length) attributes.tags = product.tags.map((t) => text(t.name ?? t.slug));
  for (const a of product.attributes) attributes[slugifyOrEmpty(a.name) || `attr-${a.id}`] = a.terms.map((t) => text(t.name ?? t.slug));
  if (product.type === "grouped") attributes.groupedOf = (product.grouped_products ?? []).map(String);
  return {
    externalId,
    slug: storedSlug(product.slug, externalId, warnings),
    name: text(product.name),
    permalink: storedPermalink(product.permalink, externalId, warnings),
    sku: product.sku.trim() || null,
    priceDkk: /^\d+$/.test(price) ? Math.round(Number(price) * 10 ** (2 - minor)) : 0,
    categoryExternalId: primary === null ? null : String(primary),
    extraCategoryExternalIds: product.categories.filter((c) => c.id !== primary).map((c) => String(c.id)).sort(),
    description: text(product.description),
    answerSummary: text(product.short_description).slice(0, 500) || null,
    attributes,
    ...(ctx.wp && { status: ctx.wp.status === "publish" ? "active" : "draft" }),
    // No head = Yoast off or not answering: unknown. A head without a description is Yoast saying there is none.
    ...(ctx.wp?.yoast_head_json && {
      metaTitle: ctx.wp.yoast_head_json.title ?? null,
      metaDescription: ctx.wp.yoast_head_json.description ?? null,
    }),
  };
}

export function mapWooCatalog(snapshot: WooSnapshot, decode: HtmlDecode) {
  const warnings: WooWarning[] = [];
  const categoryPermalinks = new Map(snapshot.categories.map((c) => [c.id, c.permalink]));
  const wp = new Map(snapshot.wpProducts.map((p) => [p.id, p]));
  const categories = snapshot.categories.map((c) => mapCategory(c, warnings, decode));
  const products = snapshot.products.map((p) => mapProduct(p, { categoryPermalinks, wp: wp.get(p.id), decode }, warnings));
  return { categories, products, warnings };
}

/** JSON with sorted keys and no `undefined`, so equal rows hash equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** sha256 over the importer-owned projection and the mapping version. */
export function wooFingerprint(row: MappedCategory | MappedProduct): string {
  return createHash("sha256").update(stableJson({ mappingVersion: WOO_MAPPING_VERSION, row })).digest("hex");
}
