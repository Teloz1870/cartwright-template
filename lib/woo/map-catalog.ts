import { SLUG_RULE, slugifyOrEmpty } from "@/lib/tools/slug";
import { permalinkKey } from "@/lib/urls";
import type { WooSnapshot, WooStoreCategory, WooStoreProduct } from "@/lib/woo/types";

/**
 * W21-live — a Woo catalogue mapped to the Category and Product fields the
 * importer OWNS. Pure. lib/woo/groups.ts fingerprints these projections group
 * by group and a run will write them. Images, variants, compare-at price and
 * stock are not projected yet: each joins with its own slice and a
 * `WOO_MAPPING_VERSION` bump. Version 2 owns no wp/v2 field: a product's post
 * status and Yoast title and description are W21-live-4's, so a create leaves
 * them at the schema's defaults and an update never touches them.
 */

/** Bump on any mapping change, so every fingerprint changes with it. */
export const WOO_MAPPING_VERSION = 2;
export const WOO_SOURCE = "woocommerce";
/** The largest value an `Int` column holds on every dialect (Postgres `integer`). */
export const INT32_MAX = 2_147_483_647;

export type WooWarning = {
  code: "slugRewritten" | "primaryCategoryFallback" | "noPrice" | "permalinkUnset" | "extraCategoryDropped" | "stockClamped";
  externalId: string;
  detail: string;
};

export type MappedCategory = {
  externalId: string;
  slug: string;
  name: string;
  /** Woo's own pathname, trailing slash and all; null when it has no path (`/?product=x`). */
  permalink: string | null;
  parentExternalId: string | null;
  /** null = none, as the admin saves it: mapped, written and read back in one form (lib/woo/view.ts). */
  description: string | null;
};

export type MappedProduct = {
  externalId: string;
  slug: string;
  name: string;
  permalink: string | null;
  sku: string | null;
  /**
   * Øre, scaled from the currency's minor unit; a variable product's is Woo's
   * min price. null = Woo sent no usable price (empty, not whole minor units,
   * or past an `Int`): never 0, so the price group is unknown, never written.
   */
  priceDkk: number | null;
  categoryExternalId: string | null;
  extraCategoryExternalIds: string[];
  description: string;
  answerSummary: string | null;
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

/** Text as a column reads it back (spec §3F S5): libSQL stores a lone surrogate as U+FFFD and reads a text only up to a NUL, which the HTML parser already makes U+FFFD. */
function storable(text: string): string {
  return text.toWellFormed().replaceAll("\0", "\uFFFD");
}

/** Woo HTML → plain text (the sanitised HTML itself is W21-live-4's): tags out, then references decoded. */
function textOf(html: string, decode: HtmlDecode): string {
  return storable(decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim());
}

/** Storable text up to `max` UTF-16 units, as the admin's limit counts them: a surrogate pair the cut would split goes whole. */
function upTo(text: string, max: number): string {
  const cut = text.slice(0, max);
  return cut.isWellFormed() ? cut : cut.slice(0, -1);
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
  const path = url ? url.pathname : storable(raw);
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
    description: textOf(category.description ?? "", decode) || null,
  };
}

export function mapProduct(
  product: WooStoreProduct,
  ctx: { categoryPermalinks: ReadonlyMap<number, string>; decode: HtmlDecode },
  warnings: WooWarning[],
): MappedProduct {
  const externalId = String(product.id);
  const text = (html: string) => textOf(html, ctx.decode);
  const primary = primaryCategory(product, ctx.categoryPermalinks, warnings);
  const { price, currency_minor_unit: minor } = product.prices;
  const scaled = /^\d+$/.test(price) ? Math.round(Number(price) * 10 ** (2 - minor)) : null;
  const priceDkk = scaled !== null && Number.isSafeInteger(scaled) && scaled <= INT32_MAX ? scaled : null;
  if (priceDkk === null) warnings.push({ code: "noPrice", externalId, detail: `price "${price}"` });
  const attributes: Record<string, string[]> = {};
  if (product.tags.length) attributes.tags = product.tags.map((t) => text(t.name ?? t.slug));
  for (const a of product.attributes) attributes[slugifyOrEmpty(a.name) || `attr-${a.id}`] = a.terms.map((t) => text(t.name ?? t.slug));
  if (product.type === "grouped") attributes.groupedOf = (product.grouped_products ?? []).map(String);
  return {
    externalId,
    slug: storedSlug(product.slug, externalId, warnings),
    name: text(product.name),
    permalink: storedPermalink(product.permalink, externalId, warnings),
    sku: storable(product.sku.trim()) || null,
    priceDkk,
    categoryExternalId: primary === null ? null : String(primary),
    extraCategoryExternalIds: product.categories.filter((c) => c.id !== primary).map((c) => String(c.id)).sort(),
    description: text(product.description),
    answerSummary: upTo(text(product.short_description), 500) || null,
    attributes,
  };
}

export function mapWooCatalog(snapshot: WooSnapshot, decode: HtmlDecode) {
  const warnings: WooWarning[] = [];
  const categoryPermalinks = new Map(snapshot.categories.map((c) => [c.id, c.permalink]));
  const categories = snapshot.categories.map((c) => mapCategory(c, warnings, decode));
  const products = snapshot.products.map((p) => mapProduct(p, { categoryPermalinks, decode }, warnings));
  return { categories, products, warnings };
}
