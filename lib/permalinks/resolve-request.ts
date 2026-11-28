/**
 * URL5-b — a stored permalink is SERVED, not only linked.
 *
 * With `brand.urls.permalinks` on, URL5-a links a product or category at its
 * stored `permalink` (`/hegn/komposithegn/x/`). This module is the other half:
 * the proxy asks `resolvePermalinkRewrite()` whether a request path is such a
 * permalink, and if so rewrites it to the engine route that renders the entity
 * (`/da/product/<slug>`), so the address a migrated shop already ranks on
 * answers 200 at itself. Off, the proxy never calls in here: no map is loaded
 * and no request changes.
 *
 * The map `{ permalink → { kind, slug } }` is read from the `Product`,
 * `Category` and (URL-PAGE-POST-b) `Page` tables and cached for 60 s per server
 * instance — one read a
 * minute, as for the redirect map (lib/redirects/load.ts). Nothing is built at
 * import: the database module is reached only inside the loader. A failed read
 * keeps the last map that loaded (empty before the first) and is retried after
 * 5 s; with no map, no permalink is served and the request falls through.
 *
 * NO `server-only` here: proxy.ts imports this module.
 */

// The lookup key lives in lib/urls.ts (pure, core, browser-safe), so the link
// helper there refuses exactly the permalinks this map can never hold.
import { permalinkKey, resolveUrlConfig } from "@/lib/urls";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";
import { isTrustPageSourceSlug } from "@/lib/canonical-public-routes";
import { PUBLISHED_PAGE_WHERE, contentPermalinkPath, permalinkCollisions, type PermalinkHolder } from "./content";

export { permalinkKey };

export type PermalinkKind = "product" | "category";
/**
 * A page entry also carries its stored spelling: the link helpers write that
 * one (`pageHref`), as they write a product's, and the key is decoded.
 */
export type PermalinkTarget = { kind: PermalinkKind; slug: string } | { kind: "page"; slug: string; permalink: string };
export type PermalinkMap = Record<string, PermalinkTarget>;

const TTL_MS = 60_000;
const RETRY_MS = 5_000;
let cache: { map: PermalinkMap; expires: number } | null = null;

/** The map as the tables hold it now, uncached, a failure thrown: what `redirect.legacy-shadow` compares. */
export async function readPermalinkMap(): Promise<PermalinkMap> {
  const { prisma } = await import("@/lib/db");
  const [categories, products, storedPages] = await Promise.all([
    prisma.category.findMany({
      where: { permalink: { not: null } },
      select: { slug: true, permalink: true },
    }),
    prisma.product.findMany({
      // A deleted or draft product has no page, so its old address is not served.
      where: { permalink: { not: null }, ...LIVE_PRODUCT_WHERE },
      select: { slug: true, permalink: true },
    }),
    // URL-PAGE-POST-b: a published page (a draft has no public page, so its old
    // address is not served — not even a legal page, whose /info/<slug> shows
    // the built-in text while the row is a draft).
    prisma.page
      .findMany({
        where: { permalink: { not: null }, ...PUBLISHED_PAGE_WHERE },
        select: { slug: true, permalink: true },
      })
      .catch((e: unknown) => {
        // A database from before schema batch B has no `Page.permalink`: it has
        // no page permalinks, and its product/category ones are still served.
        // Any other failure fails the read, as before (the last map is kept).
        if (/no such column[^\n]*permalink|Page\.permalink[^\n]*does not exist/i.test(String(e instanceof Error ? e.message : e))) return [];
        throw e;
      }),
  ]);
  // A trust alias (about, om-os, contact, privacy; any case) keeps its
  // predictable route: its canonical, the sitemap and the footer all name that
  // route, so its permalink is not served (yet) — see CHANGELOG URL-PAGE-POST-b.
  const pages = storedPages.filter((row) => !isTrustPageSourceSlug(row.slug));
  const map: PermalinkMap = Object.create(null);
  // Pages first, categories second, products last: should two tables store the
  // same permalink (the app check is not a constraint across tables), the
  // product wins — it is the page a migrated shop's old URL most likely named —
  // and a catalogue entry wins over a CMS page.
  for (const row of pages) {
    const key = row.permalink ? permalinkKey(row.permalink) : null;
    if (key && row.permalink) map[key] = { kind: "page", slug: row.slug, permalink: row.permalink };
  }
  for (const [kind, rows] of [
    ["category", categories],
    ["product", products],
  ] as const) {
    for (const row of rows) {
      const key = row.permalink ? permalinkKey(row.permalink) : null;
      if (key) map[key] = { kind, slug: row.slug };
    }
  }
  warnShadowedPages(pages, categories, products, map);
  return map;
}

/** A page that lost its permalink to a product or a category is named in the log, not dropped silently. */
function warnShadowedPages(
  pages: readonly { slug: string; permalink: string | null }[],
  categories: readonly { slug: string; permalink: string | null }[],
  products: readonly { slug: string; permalink: string | null }[],
  map: PermalinkMap,
): void {
  if (!pages.length) return;
  const holders: PermalinkHolder[] = [
    ...pages.map((row) => ({ table: "page" as const, ...row })),
    ...categories.map((row) => ({ table: "category" as const, ...row })),
    ...products.map((row) => ({ table: "product" as const, ...row })),
  ];
  for (const { key, holders: held } of permalinkCollisions(holders)) {
    const served = map[key];
    for (const loser of held) {
      if (loser.table !== "page" || (served.kind === "page" && served.slug === loser.slug)) continue;
      console.warn(`[permalinks] page "${loser.slug}" is not served at ${key}: the ${served.kind} "${served.slug}" holds it too and wins.`);
    }
  }
}

/**
 * The page permalinks the proxy serves with this map, as `slug → stored
 * spelling`: only a page that won its key. The one rule the sitemap, the
 * canonical and the links read, so none of them names an address the proxy
 * hands to another row.
 */
export function servedPagePermalinks(map: PermalinkMap): ReadonlyMap<string, string> {
  const served = new Map<string, string>();
  for (const target of Object.values(map)) {
    if (target.kind === "page") served.set(target.slug, target.permalink);
  }
  return served;
}

/** The permalink map; cached for 60 s, empty on any failure. */
export async function loadPermalinkMap(): Promise<PermalinkMap> {
  if (cache && cache.expires > Date.now()) return cache.map;
  try {
    cache = { map: await readPermalinkMap(), expires: Date.now() + TTL_MS };
  } catch (e) {
    console.warn("[Proxy] permalink map load failed:", e);
    // Keep serving the last map that loaded (a migrated shop's addresses do
    // not vanish on one failed read), and ask again soon rather than in 60 s.
    cache = { map: cache?.map ?? Object.create(null), expires: Date.now() + RETRY_MS };
  }
  return cache.map;
}

/**
 * With `urls.permalinks` on, the page permalinks the proxy serves (the cached
 * map, `servedPagePermalinks`); off, an empty map and no read — so a shop with
 * the option off renders every page link exactly as before.
 */
export async function loadServedPagePermalinks(): Promise<ReadonlyMap<string, string>> {
  if (!resolveUrlConfig().permalinks) return new Map();
  return servedPagePermalinks(await loadPermalinkMap());
}

/** Test seam: forget the cached map. */
export function resetPermalinkMapCache(): void {
  cache = null;
}

export type PermalinkRouting = {
  locales: readonly string[];
  defaultLocale: string;
  localePrefix?: "never";
};

/**
 * Where a request path is served from when it is a stored permalink, or `null`.
 *
 * Under the default `localePrefix` the path carries its locale (`/en/hegn/x/`)
 * and the permalink is the rest — a stored permalink never has the locale in
 * it (lib/urls.ts). A permalink asked for WITHOUT a locale (`/hegn/x/`, the
 * shape an old inbound link has) is answered `{ unprefixed: true }`: the proxy
 * then skips its older redirect rules and lets next-intl send it to the
 * reader's locale form, which is served on the next request. Under `"never"`
 * (one locale) the whole path is the permalink and the locale is the shop's
 * only one.
 */
export function resolvePermalinkRewrite(
  pathname: string,
  map: PermalinkMap,
  routing: PermalinkRouting,
): { path: string; locale: string } | { unprefixed: true } | null {
  let locale: string;
  let rest: string;
  if (routing.localePrefix === "never") {
    locale = routing.defaultLocale;
    rest = pathname;
  } else {
    const head = pathname.split("/")[1] ?? "";
    if (!routing.locales.includes(head)) {
      const key = permalinkKey(pathname);
      return key && map[key] ? { unprefixed: true } : null;
    }
    locale = head;
    rest = pathname.slice(head.length + 1);
  }
  const key = permalinkKey(rest);
  if (!key) return null;
  // A key always starts with `/`, so it can never name an inherited property.
  const hit = map[key];
  if (!hit) return null;
  if (hit.kind === "page") return { path: contentPermalinkPath(hit, locale), locale };
  return { path: `/${locale}/${hit.kind}/${encodeURIComponent(hit.slug)}`, locale };
}
