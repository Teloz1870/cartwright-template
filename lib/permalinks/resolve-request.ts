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
 * The map `{ permalink → { kind, slug } }` is read from the `Product` and
 * `Category` tables and cached for 60 s per server instance — one read a
 * minute, as for the redirect map (lib/redirects/load.ts). Nothing is built at
 * import: the database module is reached only inside the loader. A failed read
 * keeps the last map that loaded (empty before the first) and is retried after
 * 5 s; with no map, no permalink is served and the request falls through.
 *
 * NO `server-only` here: proxy.ts imports this module.
 */

// The lookup key lives in lib/urls.ts (pure, core, browser-safe), so the link
// helper there refuses exactly the permalinks this map can never hold.
import { permalinkKey } from "@/lib/urls";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";

export { permalinkKey };

export type PermalinkKind = "product" | "category";
export type PermalinkTarget = { kind: PermalinkKind; slug: string };
export type PermalinkMap = Record<string, PermalinkTarget>;

const TTL_MS = 60_000;
const RETRY_MS = 5_000;
let cache: { map: PermalinkMap; expires: number } | null = null;

async function readFromDatabase(): Promise<PermalinkMap> {
  const { prisma } = await import("@/lib/db");
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { permalink: { not: null } },
      select: { slug: true, permalink: true },
    }),
    prisma.product.findMany({
      // A deleted or draft product has no page, so its old address is not served.
      where: { permalink: { not: null }, ...LIVE_PRODUCT_WHERE },
      select: { slug: true, permalink: true },
    }),
  ]);
  const map: PermalinkMap = Object.create(null);
  // Categories first, products second: should a product and a category store
  // the same permalink (the app check is not a constraint across tables), the
  // product wins — it is the page a migrated shop's old URL most likely named.
  for (const [kind, rows] of [
    ["category", categories],
    ["product", products],
  ] as const) {
    for (const row of rows) {
      const key = row.permalink ? permalinkKey(row.permalink) : null;
      if (key) map[key] = { kind, slug: row.slug };
    }
  }
  return map;
}

/** The permalink map; cached for 60 s, empty on any failure. */
export async function loadPermalinkMap(): Promise<PermalinkMap> {
  if (cache && cache.expires > Date.now()) return cache.map;
  try {
    cache = { map: await readFromDatabase(), expires: Date.now() + TTL_MS };
  } catch (e) {
    console.warn("[Proxy] permalink map load failed:", e);
    // Keep serving the last map that loaded (a migrated shop's addresses do
    // not vanish on one failed read), and ask again soon rather than in 60 s.
    cache = { map: cache?.map ?? Object.create(null), expires: Date.now() + RETRY_MS };
  }
  return cache.map;
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
  return { path: `/${locale}/${hit.kind}/${encodeURIComponent(hit.slug)}`, locale };
}
