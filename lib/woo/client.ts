import { assertResolvedAddressesPublic, parseAndValidateUrl } from "@/lib/import/safe-fetch";
import type { WooCollectionMeta, WooSnapshot, WooStoreCategory, WooStoreProduct, WooStoreVariation, WooWpProduct } from "@/lib/woo/types";

/**
 * W21-live — the READ-ONLY client for a live WooCommerce shop: the public
 * Store API and wp/v2, no key (the keyed wc/v3 read is a later slice).
 *
 * GET is the only verb. No function here takes a method, an init or a body,
 * and the one channel to the network, `WooTransport`, is typed to receive
 * `method: "GET"` — a write to the source shop cannot even be expressed.
 *
 * Every request passes `lib/import/safe-fetch.ts`'s SSRF guard (scheme, host,
 * literal and resolved address), is aborted after 20 s, and is retried three
 * times with backoff on 429, 5xx or a network failure. Any other 4xx stops at
 * once, and so does a redirect: it is never followed to an address nobody
 * validated — `storeUrl` must be the address the shop answers at. The one
 * exception is wp/v2's product route, which only adds status and Yoast fields:
 * a shop without it, or with REST closed to guests, answers 401/403/404, and
 * the snapshot is taken without them and flagged incomplete. A redirect there
 * still stops the read, so it is reported as the redirect it is.
 */

export type WooRequestInit = { method: "GET"; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal };
export type WooTransport = (url: string, init: WooRequestInit) => Promise<Response>;
/** The public APIs only. */
export type WooPath = `wc/store/v1/${string}` | `wp/v2/${string}`;
type WooQuery = Readonly<Record<string, string | number>>;

export type WooClientOptions = {
  /** The shop, e.g. `https://shop.example.test/`, or `https://example.test/shop/` for a WordPress in a subdirectory. */
  storeUrl: string;
  /** Our own site, named in the User-Agent so the shop sees who reads it. */
  siteUrl: string;
  transport?: WooTransport;
  /** Refuses a host that resolves to a private address; the default asks DNS. */
  assertHostPublic?: (hostname: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export class WooHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`WooCommerce answered HTTP ${status} for ${url}`);
    this.name = "WooHttpError";
  }
}

const RETRIES = 3;
const PER_PAGE = 100;
const MAX_PAGES = 500;
const CONCURRENCY = 4;

/**
 * Retry-After when the shop sends one — delta-seconds or an HTTP-date (RFC 9110
 * §10.2.3), as a wait from now, never negative, capped at 30 s — else 0.5 s, 1 s, 2 s.
 */
function backoffMs(attempt: number, res: Response | null): number {
  const header = res?.headers.get("retry-after")?.trim() ?? "";
  const seconds = /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : NaN;
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 30) * 1000 : 500 * 2 ** attempt;
}

/** A count header as a number, or null when absent, not digits, or past 2^53 (no longer exact). */
function headerInt(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  const n = value !== null && /^\d+$/.test(value) ? Number(value) : null;
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

export function createWooClient(opts: WooClientOptions) {
  // Origin and path: a WordPress in a subdirectory answers at <path>/wp-json/. A query or fragment is no part of it.
  if (/[?#]/.test(opts.storeUrl)) throw new Error("The shop's address must not carry a query or fragment.");
  const base = parseAndValidateUrl(opts.storeUrl.replace(/\/?$/, "/"));
  const transport: WooTransport = opts.transport ?? ((url, init) => fetch(url, init));
  const assertHostPublic = opts.assertHostPublic ?? assertResolvedAddressesPublic;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const headers = { accept: "application/json", "user-agent": `cartwright-woo-import/1.0 (+${opts.siteUrl})` };

  /** `stop`: a sibling request failed — no further attempt or wait, and one in flight is aborted. */
  async function get(path: WooPath, query: WooQuery, stop?: AbortSignal): Promise<{ body: unknown; headers: Headers }> {
    const url = new URL(`wp-json/${path}`, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    parseAndValidateUrl(url.href);
    await assertHostPublic(url.hostname);
    for (let attempt = 0; ; attempt++) {
      stop?.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
      let res: Response | null = null;
      let failure: unknown;
      try {
        const signal = stop ? AbortSignal.any([controller.signal, stop]) : controller.signal;
        res = await transport(url.href, { method: "GET", headers, redirect: "manual", signal });
        if (res.ok) return { body: await res.json(), headers: res.headers };
      } catch (err) {
        failure = err; // network, timeout or a body that is not JSON: retried like a 5xx
      } finally {
        clearTimeout(timer);
      }
      if (res && !res.ok) await res.body?.cancel().catch(() => undefined); // free the connection
      const status = res && !res.ok ? res.status : null;
      if (status !== null && status !== 429 && status < 500) throw new WooHttpError(status, url.href);
      if (attempt >= RETRIES) throw status !== null ? new WooHttpError(status, url.href) : failure;
      stop?.throwIfAborted();
      await sleep(backoffMs(attempt, res));
    }
  }

  /** Every page: to `X-WP-TotalPages`, else to an empty page or one of rows already seen (an endpoint ignoring `page`). */
  async function listAll<T extends { id: number }>(path: WooPath, query: WooQuery = {}): Promise<{ rows: T[]; meta: WooCollectionMeta }> {
    const byId = new Map<number, T>();
    let total: number | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const answer = await get(path, { ...query, per_page: PER_PAGE, page });
      if (!Array.isArray(answer.body)) throw new Error(`${path} did not answer a list.`);
      total = headerInt(answer.headers, "x-wp-total") ?? total;
      const pages = headerInt(answer.headers, "x-wp-totalpages");
      const before = byId.size;
      for (const row of answer.body as T[]) byId.set(row.id, row);
      if (answer.body.length === 0 || byId.size === before || (pages !== null && page >= pages)) {
        const rows = [...byId.values()];
        return { rows, meta: { complete: total !== null && rows.length === total, total, fetched: rows.length } };
      }
    }
    throw new Error(`${path} has more than ${MAX_PAGES} pages.`);
  }

  /**
   * wp/v2 lists a product only when asked for it by id, ≤100 a request, four requests at a time; a 4xx
   * skips the extras. Any other failure ends the read, and its siblings stop retrying in the background.
   */
  async function wpProducts(ids: number[]): Promise<WooWpProduct[]> {
    const requests: WooQuery[] = [];
    for (let i = 0; i < ids.length; i += PER_PAGE) {
      requests.push({ include: ids.slice(i, i + PER_PAGE).join(","), per_page: PER_PAGE, _fields: "id,status,yoast_head_json" });
    }
    const rows: WooWpProduct[] = [];
    const done = new AbortController();
    for (let i = 0; i < requests.length; i += CONCURRENCY) {
      const answers = await Promise.all(
        requests.slice(i, i + CONCURRENCY).map((q) =>
          get("wp/v2/product", q, done.signal).catch((err: unknown) => {
            if (err instanceof WooHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) return null;
            done.abort(err);
            throw err;
          }),
        ),
      );
      for (const answer of answers) if (Array.isArray(answer?.body)) rows.push(...(answer.body as WooWpProduct[]));
    }
    return rows;
  }

  async function fetchSnapshot(now = new Date()): Promise<WooSnapshot> {
    // The Store API's term routes default to hide_empty=true: an empty category would be absent, and a
    // category imported earlier would be reported missing in the source the day its last product went.
    const categories = await listAll<WooStoreCategory>("wc/store/v1/products/categories", { hide_empty: "false" });
    const products = await listAll<WooStoreProduct>("wc/store/v1/products");
    const variations = await listAll<WooStoreVariation>("wc/store/v1/products", { type: "variation" });
    const wp = await wpProducts(products.rows.map((p) => p.id));
    const asked = products.rows.length;
    return {
      storeUrl: base.href,
      fetchedAt: now.toISOString(),
      categories: categories.rows,
      products: products.rows,
      variations: variations.rows,
      wpProducts: wp,
      meta: {
        categories: categories.meta,
        products: products.meta,
        variations: variations.meta,
        wpProducts: { complete: wp.length === asked, total: asked, fetched: wp.length },
      },
    };
  }

  return { listAll, fetchSnapshot };
}
