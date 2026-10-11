import "server-only";

import { after } from "next/server";
import { getBrand } from "@/lib/brand";
import { canonicalPublicPagePath } from "@/lib/canonical-public-routes";
import { productHref } from "@/lib/urls";

/**
 * IndexNow ping on publish (FEAT3-a) — tells the engines that honour the
 * protocol (Bing, Yandex, Seznam, Naver; Google does not) which URLs just
 * changed, so they recrawl now instead of at the sitemap's next visit.
 *
 * The contract every call site relies on:
 *  - `scheduleIndexNowPing(change)` — fire-and-forget, after the write. It
 *    never throws and never blocks the write that triggered it; every failure
 *    ends in ONE `console.warn`. The POST runs in `after()`, so a serverless
 *    invocation stays alive until it completes.
 *  - A change pings the URL that is public NOW (`isPublic` + `newSlug`) and
 *    the URL that WAS public before the write (`wasPublic` + `oldSlug`): a
 *    rename pings old and new, an unpublish or delete pings the URL that just
 *    went away (IndexNow takes a URL that now 404s as a change too), and a
 *    draft that stays a draft pings nothing.
 *  - Silent unless the runtime flag `indexNow` is on AND `INDEXNOW_KEY` is set
 *    AND this is a production deployment with a real public origin: https, not
 *    localhost / 127.0.0.1 / `*.localhost`. On Vercel only `VERCEL_ENV=
 *    production` pings (a `*.vercel.app` production host is fine); off Vercel
 *    only `NODE_ENV=production` does, so `pnpm dev` with the real `brand.url`
 *    never pings.
 *  - Products ping only with ecommerce on, posts only with the blog on — the
 *    gates app/sitemap.ts applies.
 *  - A path is a `{locale}` template — the placeholder `hreflangFor` in
 *    `i18n/routing.ts` already uses — expanded to every configured locale, so
 *    `/da/product/x` and `/en/product/x` both reach the engine. A path without
 *    the placeholder is sent as-is.
 *
 * Who calls it: the product/page/post write handlers in lib/tools/*, the admin
 * server actions and the blog plugin's actions — after a successful write.
 * Deliberately NOT called from `content.import_site`, sitepack restore, the
 * product CSV import, the Google Sheets sync, Hoptify, seeds or
 * `reset-demo-data`: a bulk load is not a publish event, and the sitemap still
 * carries every URL for the next crawl.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/.well-known/indexnow-key.txt";
/** The protocol's own limit per POST. */
export const INDEXNOW_MAX_URLS_PER_CALL = 100;
const INDEXNOW_TIMEOUT_MS = 5_000;
const LOCALE_PLACEHOLDER = "{locale}";
/**
 * The engine's placeholder `brand.url` (brand.config.ts on a fresh scaffold).
 * A self-hosted production shop with no `domain` row, no NEXT_PUBLIC_APP_URL
 * and no VERCEL_* env resolves to it and would otherwise ping the vendor host
 * with its own key. Pinned as a literal, not read from brand.config: a fork
 * that sets its real domain there must keep pinging.
 */
const VENDOR_ORIGIN = "https://cartwright.app";
/** IndexNow keys: 8–128 chars of [A-Za-z0-9-]. Anything else is treated as unset. */
const KEY_SHAPE = /^[A-Za-z0-9-]{8,128}$/;

export type IndexNowKind = "product" | "page" | "post";

/** What a finished write changed, as the call site knows it. */
export type IndexNowChange = {
  kind: IndexNowKind;
  /** The slug before the write (update, rename, delete). Omit on create. */
  oldSlug?: string | null;
  /** The slug after the write. Omit on delete. */
  newSlug?: string | null;
  /** Was the row public before the write? (`published`, not soft-deleted.) */
  wasPublic: boolean;
  /** Is the row public after the write? */
  isPublic: boolean;
};

/** The configured key, or null when it is missing or not a valid IndexNow key. */
export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * The origin a ping may name, or null when this deployment must stay silent.
 * Previews and local runs would otherwise tell an engine about URLs that do
 * not exist on the public host — or exist with a different key file.
 */
export function indexNowOrigin(publicUrl: string): string | null {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  // On Vercel only the production deployment pings. Off Vercel only a
  // production build does — `pnpm dev` with the real brand.url, a key and the
  // flag on would otherwise ping the live site's URLs from a laptop.
  const production = vercelEnv ? vercelEnv === "production" : process.env.NODE_ENV === "production";
  if (!production) return null;
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) {
    return null;
  }
  // A shop whose production host IS `*.vercel.app` may ping; anything else
  // naming that host (a local build, a self-hosted copy) must not.
  if (host.endsWith(".vercel.app") && vercelEnv !== "production") return null;
  // The unconfigured fallback is the vendor's host, never this shop's.
  if (parsed.origin === VENDOR_ORIGIN) return null;
  return parsed.origin;
}

/** `{locale}` path templates for the three entity kinds that ping. */
export const indexNowPath = {
  product: (slug: string): string => productHref({ slug }, LOCALE_PLACEHOLDER),
  /** Trust slugs (`about`, `om-os`, `contact`, `privacy`) resolve to their canonical route. */
  page: (slug: string): string => canonicalPublicPagePath(slug, LOCALE_PLACEHOLDER),
  post: (slug: string): string => `/${LOCALE_PLACEHOLDER}/blog/${slug}`,
};

/**
 * Pure: the `{locale}` path templates a change should ping — the URL public
 * now and the URL public before the write, deduped; `[]` when neither exists
 * (a draft edited, a draft deleted, a row created as a draft).
 */
export function indexNowPathsForChange(change: IndexNowChange): string[] {
  const toPath = indexNowPath[change.kind];
  const paths = new Set<string>();
  if (change.isPublic && change.newSlug) paths.add(toPath(change.newSlug));
  if (change.wasPublic && change.oldSlug) paths.add(toPath(change.oldSlug));
  return [...paths];
}

/** Expands templates against `locales`, prefixes `origin`, dedupes, keeps order. */
export function indexNowUrlList(
  paths: readonly string[],
  locales: readonly string[],
  origin: string,
): string[] {
  const urls = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith("/")) continue;
    if (path.includes(LOCALE_PLACEHOLDER)) {
      for (const locale of locales) urls.add(`${origin}${path.replaceAll(LOCALE_PLACEHOLDER, locale)}`);
    } else {
      urls.add(`${origin}${path}`);
    }
  }
  return [...urls];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Mirrors app/sitemap.ts: a product URL exists only with ecommerce on, a post
 * URL only with the blog on. Pages always exist.
 */
function kindIsServed(
  brand: { ecommerceEnabled: boolean; features: { blog?: boolean } },
  kind: IndexNowKind | undefined,
): boolean {
  if (kind === "product") return brand.ecommerceEnabled;
  if (kind === "post") return Boolean(brand.features.blog);
  return true;
}

/**
 * Schedule the ping for a finished write without touching the response.
 * `after()` runs the callback once the response is sent and keeps the
 * serverless function alive until it finishes; outside a request scope
 * (unit tests, scripts) it throws and we fall back to a loose promise —
 * `pingIndexNow` never throws. Same recipe as `scheduleRegistryHit`
 * (lib/registry-stats.ts) and `scheduleLeadTriage` (app/api/inquiries).
 */
export function scheduleIndexNowPing(change: IndexNowChange): void {
  const paths = indexNowPathsForChange(change);
  if (paths.length === 0) return;
  try {
    after(() => pingIndexNow(paths, change.kind));
  } catch {
    void pingIndexNow(paths, change.kind);
  }
}

/**
 * Submit the given `{locale}` path templates to IndexNow. Resolves without
 * throwing in every case. Write paths go through `scheduleIndexNowPing`.
 */
export async function pingIndexNow(paths: readonly string[], kind?: IndexNowKind): Promise<void> {
  try {
    if (paths.length === 0) return;
    const key = indexNowKey();
    if (!key) return;
    const brand = await getBrand();
    if (!brand.features.indexNow) return;
    if (!kindIsServed(brand, kind)) return;
    const origin = indexNowOrigin(brand.url);
    if (!origin) return;

    const urlList = indexNowUrlList(paths, brand.locales, origin);
    if (urlList.length === 0) return;
    // The protocol's `host` is a hostname — never a port.
    const host = new URL(origin).hostname;
    const keyLocation = `${origin}${INDEXNOW_KEY_PATH}`;

    const results = await Promise.allSettled(
      chunk(urlList, INDEXNOW_MAX_URLS_PER_CALL).map(async (urls) => {
        const res = await fetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
          signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length > 0) {
      const first = failures[0].reason;
      console.warn(
        `[indexnow] ${failures.length} of ${results.length} ping(s) failed:`,
        first instanceof Error ? first.message : first,
      );
    }
  } catch (err) {
    console.warn("[indexnow] ping skipped:", err instanceof Error ? err.message : err);
  }
}
