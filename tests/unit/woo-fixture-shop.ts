import categories from "../fixtures/woo/store-categories.json";
import products from "../fixtures/woo/store-products.json";
import variations from "../fixtures/woo/store-variations.json";
import wpProducts from "../fixtures/woo/wp-product-include.json";
import wpPages from "../fixtures/woo/wp-pages.json";
import wpPosts from "../fixtures/woo/wp-posts.json";
import wpShippingClasses from "../fixtures/woo/wp-shipping-classes.json";

import type { WooRequestInit, WooTransport } from "@/lib/woo/client";
import type { WooRedirectLinks } from "@/lib/woo/redirects-csv";
import type {
  WooSnapshot,
  WooStoreCategory,
  WooStoreProduct,
  WooStoreVariation,
  WooWpProduct,
} from "@/lib/woo/types";

/**
 * The synthetic WooCommerce shop the W21-live tests read: host
 * `shop.example.test`, an invented lamp catalogue, nothing taken from a real
 * shop. Three levels of categories (Lamper › Bordlamper › Messing, plus
 * "Skærme" whose slug arrives percent-encoded), three parents (simple on sale,
 * variable, grouped) and three variations, one of them without its parent.
 *
 * The data sits in `tests/fixtures/woo/`; this loader sits HERE because the
 * `--profile site` materializer deletes `tests/unit/` and keeps
 * `tests/fixtures/`, where a `.ts` importing `lib/woo` (a webshop claim) would
 * be a dangling import in the scaffold (tests/unit/site-profile-imports.test.ts).
 */
export const STORE_URL = "https://shop.example.test/";

/** Fresh copies every call, so a test can edit its snapshot freely. */
export function wooFixtures() {
  return structuredClone({
    categories: categories as WooStoreCategory[],
    products: products as WooStoreProduct[],
    variations: variations as WooStoreVariation[],
    wpProducts: wpProducts as WooWpProduct[],
  });
}

/** The fixture shop's wp/v2 pages (system pages under their Danish slugs), posts and shipping classes. */
export function wooRedirectLinks(): WooRedirectLinks {
  return structuredClone({ pages: wpPages, posts: wpPosts, shippingClasses: wpShippingClasses });
}

/** A complete snapshot of the fixture shop. */
export function wooSnapshot(): WooSnapshot {
  const f = wooFixtures();
  const meta = (n: number) => ({ complete: true, total: n, fetched: n });
  return {
    storeUrl: STORE_URL,
    fetchedAt: "2026-10-24T00:00:00.000Z",
    ...f,
    meta: {
      categories: meta(f.categories.length),
      products: meta(f.products.length),
      variations: meta(f.variations.length),
      wpProducts: meta(f.wpProducts.length),
    },
  };
}

export type RecordedCall = { url: URL; init: WooRequestInit };

/**
 * A transport that answers the fixture shop's Store API and wp/v2 routes as
 * one page each, with `X-WP-Total`/`X-WP-TotalPages`, and records every call.
 * `wpStatus` makes the wp/v2 product route answer that status instead.
 * `extraCategories` are added to the shop; like the Store API, the category
 * route leaves out a category with `count: 0` unless asked `hide_empty=false`.
 * `shippingClassStatus` makes wp/v2's shipping-class route answer that status
 * (a shop where the taxonomy is not in REST).
 */
export function fixtureTransport(
  calls: RecordedCall[] = [],
  opts: {
    wpStatus?: number;
    shippingClassStatus?: number;
    extraCategories?: (WooStoreCategory & { count: number })[];
  } = {},
): WooTransport {
  const f = wooFixtures();
  const links = wooRedirectLinks();
  const wpLists: Record<string, unknown[]> = {
    "wp/v2/pages": links.pages,
    "wp/v2/posts": links.posts,
    "wp/v2/product_shipping_class": links.shippingClasses ?? [],
  };
  f.categories.push(...(opts.extraCategories ?? []));
  return async (raw, init) => {
    const url = new URL(raw);
    calls.push({ url, init });
    const route = url.pathname.replace(/^\/wp-json\//, "");
    if (route === "wp/v2/product" && opts.wpStatus) return Response.json({ code: "rest_no_route" }, { status: opts.wpStatus });
    if (route === "wp/v2/product_shipping_class" && opts.shippingClassStatus) {
      return Response.json({ code: "rest_no_route" }, { status: opts.shippingClassStatus });
    }
    const rows =
      route === "wc/store/v1/products/categories"
        ? f.categories.filter((c) => url.searchParams.get("hide_empty") === "false" || (c as { count?: number }).count !== 0)
        : route === "wc/store/v1/products"
          ? url.searchParams.get("type") === "variation"
            ? f.variations
            : f.products
          : route === "wp/v2/product"
            ? f.wpProducts.filter((p) =>
                (url.searchParams.get("include") ?? "").split(",").includes(String(p.id)),
              )
            : (wpLists[route] ?? null);
    if (!rows) return new Response("[]", { status: 404 });
    const body = url.searchParams.get("page") === "1" || route === "wp/v2/product" ? rows : [];
    return Response.json(body, {
      headers: { "x-wp-total": String(rows.length), "x-wp-totalpages": "1" },
    });
  };
}
