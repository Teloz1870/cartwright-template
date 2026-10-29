/**
 * W21-live — the WooCommerce shapes the live importer reads from the PUBLIC
 * Store API (`wc/store/v1`) and `wp/v2`. Only the fields it uses are typed;
 * the rest of a response is ignored. No `server-only` anywhere in `lib/woo/`:
 * the same code runs from a script and from the tool.
 */

export type WooRef = { id: number; slug: string; name?: string; link?: string };

/** Amounts in the currency's MINOR unit: `"12500"` + 2 = 125.00, in `currency_code` (ISO 4217). */
export type WooPrices = { price: string; regular_price: string; sale_price: string; currency_code: string; currency_minor_unit: number };

export type WooStoreProduct = {
  id: number;
  parent: number;
  type: "simple" | "variable" | "grouped" | "external" | (string & {});
  slug: string;
  /** Where Woo serves the product — the import's URL key, never rebuilt. */
  permalink: string;
  name: string;
  sku: string;
  description: string;
  short_description: string;
  prices: WooPrices;
  categories: WooRef[];
  tags: WooRef[];
  attributes: { id: number; name: string; terms: WooRef[] }[];
  grouped_products?: number[];
};

/** `products?type=variation`: every variation, tied to its parent only by `parent`. */
export type WooStoreVariation = Pick<WooStoreProduct, "id" | "parent" | "sku" | "prices">;

export type WooStoreCategory = {
  id: number;
  name: string;
  slug: string;
  /** 0 = a root. */
  parent: number;
  permalink: string;
  description?: string;
};

/** `wp/v2/product?include=…`: the post status and Yoast's SEO head. */
export type WooWpProduct = {
  id: number;
  status: string;
  yoast_head_json?: { title?: string; description?: string };
};

/**
 * `complete` only when every page was fetched AND the rows equal `X-WP-Total`;
 * without that header nothing proves the list is whole. Only a complete
 * collection may report a row as missing in the source.
 */
export type WooCollectionMeta = { complete: boolean; total: number | null; fetched: number };

/** One snapshot per run, so the dry-run plan and the run read the same data. */
export type WooSnapshot = {
  storeUrl: string;
  fetchedAt: string;
  categories: WooStoreCategory[];
  products: WooStoreProduct[];
  variations: WooStoreVariation[];
  wpProducts: WooWpProduct[];
  /** `wpProducts`: how many of the products wp/v2 answered for — it is optional, see client.ts. */
  meta: Record<"categories" | "products" | "variations" | "wpProducts", WooCollectionMeta>;
};
