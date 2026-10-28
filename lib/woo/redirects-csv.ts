import { LOCALE_RE, normalizeFromPath, relativePathOf, stripLocaleAndQuery } from "@/lib/redirects/match";
import { WooHttpError, type createWooClient } from "@/lib/woo/client";
import type { WooSnapshot } from "@/lib/woo/types";

/**
 * W21-live-6a — the redirect CSV for the WooCommerce addresses that get NO
 * page of their own after a migration: the system pages (cart, checkout, my
 * account, shop base), shipping-class archives and the `/feed/` family. Every
 * other address keeps answering 200 at itself (URL5: products and categories
 * by their permalink; tags and `pa_*` archives by WP3-lite), so it is never a
 * row here — a redirect would take its place.
 *
 * Pure: `buildWooRedirectCsv` reads a snapshot plus the wp/v2 links
 * `readWooRedirectLinks` fetched (GET only, through `lib/woo/client.ts`) and
 * returns the CSV `lib/redirects/import.ts` takes (`from,to,status`), the
 * rows, and every address it left out with the reason. It never builds an
 * address the source did not list: a system page is a TOP-LEVEL page matched by
 * Woo's own page slugs (or the owner's), and is left out when two pages claim
 * one role or when it is the site's front page; the feed paths are WordPress's
 * fixed rewrite rules under the install's base path or addresses the source
 * listed. No row takes an address that keeps answering 200 (a product,
 * category, post or content page) or a path the engine answers at as one of
 * the targets, and no row points at another row's source. Destinations carry
 * no locale prefix (a target given with one throws) — the redirect keeps the
 * reader's (lib/redirects/match.ts) — except the two feed files: those routes
 * exist only without a locale (`app/blog/feed.xml`, `app/feed/google.xml`),
 * so they are written absolute on the engine's origin, which the matcher
 * leaves as it is. The import's own planner still judges chains and loops
 * against what is saved.
 *
 * Not here: `/wp-content/uploads/*` (needs the MediaAlias table, batch B), the
 * query forms (`?p=`, `?page_id=`, a shipping class without a rewrite) — the
 * redirect matcher sees only the pathname, so they are listed as skipped — and
 * my-account/checkout endpoints below the page (`/kasse/order-received/…`).
 */

type WooClient = ReturnType<typeof createWooClient>;

/** A wp/v2 post, page or term: where WordPress serves it. */
export type WooLink = { id: number; slug: string; link: string };

/** `shippingClasses: null` = wp/v2 does not list them (the taxonomy is not in REST on that shop). */
export type WooRedirectLinks = { pages: WooLink[]; posts: WooLink[]; shippingClasses: WooLink[] | null };

export type WooSystemRole = "cart" | "checkout" | "account" | "shop";

/** Engine paths, unprefixed. A feed target set to null falls back to `home`. */
export type WooRedirectTargets = Record<WooSystemRole, string> & {
  home: string;
  /** Shipping-class archives: the engine has no archive per class. */
  shippingClass: string;
  /** `/blog/feed.xml` answers only with `features.blog` on. */
  blogFeed: string | null;
  /** `/feed/google.xml` answers only with `features.merchantFeed` on. */
  productFeed: string | null;
};

export const DEFAULT_REDIRECT_TARGETS: WooRedirectTargets = {
  cart: "/cart",
  checkout: "/checkout",
  account: "/account",
  shop: "/produkter",
  home: "/",
  shippingClass: "/produkter",
  blogFeed: "/blog/feed.xml",
  productFeed: "/feed/google.xml",
};

/** WooCommerce's page slugs per role, Danish install first (measured: kurv, kasse, min-konto). */
export const WOO_SYSTEM_PAGE_SLUGS: Record<WooSystemRole, readonly string[]> = {
  cart: ["kurv", "cart"],
  checkout: ["kasse", "checkout"],
  account: ["min-konto", "my-account"],
  shop: ["butik", "shop"],
};

/**
 * First segments proxy.ts's LEGACY_SLUG_MAP answers with a 301 BEFORE the
 * merchant redirects are read — a row under one would never be reached
 * (`/kurv/` already goes to `/cart/`). Pinned to proxy.ts by a test.
 */
export const ENGINE_LEGACY_SEGMENTS = ["konto", "kurv", "ordre", "kategori", "produkt", "kontakt", "anmeld"] as const;

/** WordPress's root feed rewrites; `/comments/feed` is the site's comment feed. */
const SITE_FEEDS = ["/feed/", "/feed/rss/", "/feed/rss2/", "/feed/atom/", "/feed/rdf/"];
const COMMENTS_FEED = "/comments/feed/";

export type WooRedirectKind = "system-page" | "shipping-class" | "feed";
export type WooRedirectRow = { from: string; to: string; status: 301; kind: WooRedirectKind };
export type WooRedirectSkipReason =
  | "engine-legacy"
  | "engine-serves"
  | "query-form"
  | "foreign-host"
  | "dotted-path"
  | "locale-segment"
  | "ambiguous"
  | "site-root"
  | "live-page"
  | "chain"
  | "duplicate";
export type WooRedirectSkip = { path: string; kind: WooRedirectKind; reason: WooRedirectSkipReason };
export type WooRedirectCsv = { csv: string; rows: WooRedirectRow[]; skipped: WooRedirectSkip[] };

export type WooRedirectOptions = {
  targets?: Partial<WooRedirectTargets>;
  /** The owner's slug for a role, when the shop renamed the page; replaces the defaults for it. */
  systemPages?: Partial<Record<WooSystemRole, string>>;
  /**
   * The engine's public origin after the move, for the feed-file destinations.
   * Default: the source shop's origin — the address the migration takes over.
   */
  origin?: string;
};

/** wp/v2 pages, posts and shipping classes — the three lists the CSV needs beyond the snapshot. */
export async function readWooRedirectLinks(woo: Pick<WooClient, "listAll">): Promise<WooRedirectLinks> {
  const fields = { _fields: "id,slug,link" };
  const pages = await woo.listAll<WooLink>("wp/v2/pages", fields);
  const posts = await woo.listAll<WooLink>("wp/v2/posts", fields);
  let shippingClasses: WooLink[] | null = null;
  try {
    shippingClasses = (await woo.listAll<WooLink>("wp/v2/product_shipping_class", fields)).rows;
  } catch (err) {
    // WooCommerce registers the taxonomy without REST by default: no route is an answer, not a failure.
    if (!(err instanceof WooHttpError && err.status >= 400 && err.status < 500 && err.status !== 429)) throw err;
  }
  return { pages: pages.rows, posts: posts.rows, shippingClasses };
}

type Path = { path: string } | { skip: WooRedirectSkipReason };

/** The installation's base path (`/` or `/wp/`): every source address — and WordPress's fixed feed rewrites — sit under it. */
function basePath(store: URL): string {
  return store.pathname.endsWith("/") ? store.pathname : `${store.pathname}/`;
}

/** The pathname the source serves `link` at — only on the shop's own host, without a query, reachable by the proxy. */
function sourcePath(link: string, store: URL): Path {
  let url: URL;
  try {
    url = new URL(link, store);
  } catch {
    return { skip: "foreign-host" };
  }
  if (url.host !== store.host) return { skip: "foreign-host" };
  if (url.search) return { skip: "query-form" };
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  // The site's front page: the importer refuses `/` as a source, and the root
  // of a subdirectory install is the old homepage, not a system page.
  if (path === "/" || path === basePath(store)) return { skip: "site-root" };
  // proxy.ts's matcher skips every path with a dot (`%2e` is one too).
  if (/\.|%2e/i.test(path)) return { skip: "dotted-path" };
  if (LOCALE_RE.test(path)) return { skip: "locale-segment" };
  return { path };
}

/** A slug as WordPress compares it: percent-decoded, NFC, lower case (wp/v2 answers `k%c3%b8b` for `køb`). */
function slugKey(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // A malformed escape is compared as written.
  }
  return s.normalize("NFC").toLowerCase();
}

export function buildWooRedirectCsv(
  snapshot: Pick<WooSnapshot, "storeUrl" | "products" | "categories">,
  links: WooRedirectLinks,
  opts: WooRedirectOptions = {},
): WooRedirectCsv {
  const store = new URL(snapshot.storeUrl);
  const base = basePath(store);
  const targets = { ...DEFAULT_REDIRECT_TARGETS, ...opts.targets };
  // A destination keeps the reader's locale (the matcher adds it back); one
  // written with a prefix is a row the importer refuses, so it is refused here.
  for (const [name, to] of Object.entries(targets)) {
    if (to !== null && LOCALE_RE.test(relativePathOf(to))) {
      throw new Error(`Redirect target "${name}" carries a locale prefix (${to}); give the path without one.`);
    }
  }
  const origin = new URL(opts.origin ?? store.origin).origin;
  /** A feed file answers only without a locale: absolute, so `/da/feed/` does not land on `/da/blog/feed.xml`. */
  const feedFile = (to: string | null) => (to === null ? targets.home : new URL(to, `${origin}/`).href);
  /** The source path a destination is looked up under — an absolute one on the engine's own origin included. */
  const destKey = (to: string) => {
    if (!/^https?:\/\//i.test(to)) return stripLocaleAndQuery(to);
    const url = new URL(to);
    return url.origin === origin ? stripLocaleAndQuery(url.pathname) : null;
  };
  // Every path the engine answers at itself: never a source, or the row would take its place.
  const engineServes = new Set(
    Object.values(targets)
      .filter((to): to is string => to !== null)
      .map(stripLocaleAndQuery),
  );
  const rows: WooRedirectRow[] = [];
  const skipped: WooRedirectSkip[] = [];
  const seen = new Set<string>();

  /** The path `link` is served at, or null with the reason recorded. */
  const pathOf = (link: string, kind: WooRedirectKind): string | null => {
    const p = sourcePath(link, store);
    if ("path" in p) return p.path;
    skipped.push({ path: link, kind, reason: p.skip });
    return null;
  };

  // System pages: only a TOP-LEVEL page the source lists (a child page that
  // shares the slug, `/om-os/butik/`, is content), and only when exactly one
  // claims the role. Judged on the address itself, whatever later skips it: a
  // page on another host, outside the base path or below another page is not one.
  const isTopLevel = (link: string) => {
    let url: URL;
    try {
      url = new URL(link, store);
    } catch {
      return false;
    }
    if (url.host !== store.host) return false;
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return path.startsWith(base) && path.slice(base.length).split("/").filter(Boolean).length <= 1;
  };
  const systemPages: { role: WooSystemRole; link: string }[] = [];
  const systemIds = new Set<number>();
  for (const role of Object.keys(WOO_SYSTEM_PAGE_SLUGS) as WooSystemRole[]) {
    const own = opts.systemPages?.[role];
    const slugs = (own ? [own] : WOO_SYSTEM_PAGE_SLUGS[role]).map(slugKey);
    const pages = links.pages.filter((p) => slugs.includes(slugKey(p.slug)) && isTopLevel(p.link));
    if (pages.length > 1) {
      // Which one is the role is unknown, so every one of them stays a live page.
      for (const p of pages) skipped.push({ path: p.link, kind: "system-page", reason: "ambiguous" });
      continue;
    }
    if (pages.length === 1) {
      systemIds.add(pages[0].id);
      systemPages.push({ role, link: pages[0].link });
    }
  }

  // Every address that keeps answering 200 at itself after the migration:
  // never a source here, or the redirect would take its place.
  const live = new Set<string>();
  for (const link of [
    ...snapshot.products.map((p) => p.permalink),
    ...snapshot.categories.map((c) => c.permalink),
    ...links.posts.map((p) => p.link),
    ...links.pages.filter((p) => !systemIds.has(p.id)).map((p) => p.link),
  ]) {
    const p = sourcePath(link, store);
    if ("path" in p) live.add(normalizeFromPath(p.path));
  }

  /** Writes the row, or lists it and answers why not. */
  const add = (from: string, to: string, kind: WooRedirectKind): WooRedirectSkipReason | null => {
    const key = normalizeFromPath(from);
    const first = key.split("/")[1] ?? "";
    let reason: WooRedirectSkipReason | null = null;
    if ((ENGINE_LEGACY_SEGMENTS as readonly string[]).includes(first)) reason = "engine-legacy";
    else if (key === destKey(to) || engineServes.has(key)) reason = "engine-serves";
    else if (live.has(key)) reason = "live-page";
    else if (seen.has(key)) reason = "duplicate";
    if (reason) {
      skipped.push({ path: from, kind, reason });
      return reason;
    }
    seen.add(key);
    rows.push({ from, to, status: 301, kind });
    return null;
  };

  // The shop archive's feed belongs to the identified shop page whether or not
  // the page itself needs a row: one the engine already serves at the same
  // address (`/produkter/`) still has a `/produkter/feed/` the engine does not.
  let shopPath: string | null = null;
  for (const { role, link } of systemPages) {
    const path = pathOf(link, "system-page");
    if (!path) continue;
    const reason = add(path, targets[role], "system-page");
    if (role === "shop" && (reason === null || reason === "engine-serves")) shopPath = path;
  }

  for (const c of links.shippingClasses ?? []) {
    const path = pathOf(c.link, "shipping-class");
    if (path) add(path, targets.shippingClass, "shipping-class");
  }

  // Feeds: the site's own (under the install's base path), the shop archive's,
  // then one per product, category and post — to its page.
  for (const feed of SITE_FEEDS) {
    const path = pathOf(`${base}${feed.slice(1)}`, "feed");
    if (path) add(path, feedFile(targets.blogFeed), "feed");
  }
  const comments = pathOf(`${base}${COMMENTS_FEED.slice(1)}`, "feed");
  if (comments) add(comments, targets.home, "feed");
  if (shopPath) add(`${shopPath}feed/`, feedFile(targets.productFeed), "feed");
  const entities = [
    ...snapshot.products.map((p) => p.permalink),
    ...snapshot.categories.map((c) => c.permalink),
    ...links.posts.map((p) => p.link),
  ];
  for (const link of entities) {
    const path = pathOf(link, "feed");
    if (path) add(`${path}feed/`, path, "feed");
  }

  // Last guard: a row whose destination is another row's source would be a
  // chain the importer refuses — it is listed, never written.
  const sources = new Set(rows.map((r) => normalizeFromPath(r.from)));
  const kept = rows.filter((r) => {
    const into = destKey(r.to);
    if (into === null || !sources.has(into)) return true;
    skipped.push({ path: r.from, kind: r.kind, reason: "chain" });
    return false;
  });

  return { csv: toCsv(kept), rows: kept, skipped };
}

/** RFC 4180: a cell with a comma, quote or line break is quoted, its quotes doubled. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: WooRedirectRow[]): string {
  return ["from,to,status", ...rows.map((r) => [r.from, r.to, String(r.status)].map(cell).join(","))].join("\n") + "\n";
}
