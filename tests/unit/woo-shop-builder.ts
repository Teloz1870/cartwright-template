import type { WooTransport } from "@/lib/woo/client";
import type { WooStock, WooStoreCategory, WooStoreProduct } from "@/lib/woo/types";
import { wooFixtures, type RecordedCall } from "./woo-fixture-shop";

/**
 * A WooCommerce shop a test writes itself, for the W21-live-2a-5 product apply: the
 * Store API's categories and products, and wc/v3's stock, from plain data. Nothing
 * is taken from a real shop; a product is the fixture's simple product 101 with its
 * own id, names, keys, price and categories. Every call is recorded.
 */

export const BUILT_SHOP = "https://shop.example.test";

export type BuiltCategory = { id: number; slug: string; parent?: number; name?: string };
export type BuiltProduct = { id: number; slug: string; cats: number[]; sku?: string; price?: string; name?: string; type?: string; path?: string };
export type BuiltShop = { categories: BuiltCategory[]; products: BuiltProduct[]; stock?: Record<number, Partial<WooStock>> };

/** A category's address: its ancestors' slugs, then its own. */
function categoryPath(shop: BuiltShop, id: number): string {
  const byId = new Map(shop.categories.map((c) => [c.id, c]));
  const slugs: string[] = [];
  for (let at = byId.get(id), n = 0; at && n < 20; at = byId.get(at.parent ?? 0), n++) slugs.unshift(at.slug);
  return `/${slugs.join("/")}/`;
}

export function storeCategories(shop: BuiltShop): WooStoreCategory[] {
  return shop.categories.map((c) => ({ id: c.id, name: c.name ?? `Category ${c.id}`, slug: c.slug, parent: c.parent ?? 0, permalink: `${BUILT_SHOP}${categoryPath(shop, c.id)}`, description: "" }));
}

/** The product's address sits under its first category's, so that one is its primary; the rest are its secondary categories. */
export function storeProducts(shop: BuiltShop): WooStoreProduct[] {
  const template = wooFixtures().products.find((p) => p.type === "simple");
  if (!template) throw new Error("the fixture shop has no simple product");
  const link = (id: number) => ({ id, name: `Category ${id}`, slug: shop.categories.find((c) => c.id === id)?.slug ?? `c${id}`, link: `${BUILT_SHOP}${categoryPath(shop, id)}` });
  return shop.products.map((p) => ({
    ...template,
    id: p.id,
    type: p.type ?? "simple",
    name: p.name ?? `Product ${p.id}`,
    slug: p.slug,
    sku: p.sku ?? "",
    permalink: `${BUILT_SHOP}${p.path ?? `${p.cats.length ? categoryPath(shop, p.cats[0]) : "/"}${p.slug}/`}`,
    prices: { ...template.prices, price: p.price ?? "10000" },
    categories: p.cats.map(link),
  }));
}

/** wc/v3's default for a product the test says nothing of: Woo counts 5 and sells no more. */
export const DEFAULT_STOCK = { manage_stock: true, stock_quantity: 5, stock_status: "instock", backorders: "no" } as const;

/** `shop` is read at every request, so a test may change it between runs. */
export function builtTransport(shop: () => BuiltShop, calls: RecordedCall[] = []): WooTransport {
  return async (raw, init) => {
    const url = new URL(raw);
    calls.push({ url, init });
    const route = url.pathname.replace(/^\/wp-json\//, "");
    const now = shop();
    if (route === "wc/v3/products") {
      const ids = (url.searchParams.get("include") ?? "").split(",").filter(Boolean).map(Number);
      return Response.json(ids.map((id) => ({ id, ...DEFAULT_STOCK, ...now.stock?.[id] })));
    }
    const rows =
      route === "wc/store/v1/products/categories" ? storeCategories(now)
        : route === "wc/store/v1/products" ? (url.searchParams.get("type") === "variation" ? [] : storeProducts(now))
          : route === "wp/v2/product" ? []
            : null;
    if (!rows) return new Response("[]", { status: 404 });
    const body = url.searchParams.get("page") === "1" || route === "wp/v2/product" ? rows : [];
    return Response.json(body, { headers: { "x-wp-total": String(rows.length), "x-wp-totalpages": "1" } });
  };
}
