import { assertResolvedAddressesPublic, parseAndValidateUrl } from "@/lib/import/safe-fetch";
import type { WooCollectionMeta, WooSnapshot, WooStock, WooStoreCategory, WooStoreProduct, WooStoreVariation, WooWpProduct } from "@/lib/woo/types";

/**
 * W21-live — the READ-ONLY client for a live WooCommerce shop: the public
 * Store API and wp/v2 with no key, plus one keyed read, wc/v3's exact stock
 * (`stockOf`), which an import needs before it may create a product.
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
 *
 * The key is given to the constructor, which refuses half a key and a key over
 * plain http before any request. It leaves as an `Authorization` header to wc/v3
 * and nowhere else: never in a URL, a log line or an error message.
 */

export type WooRequestInit = { method: "GET"; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal };
export type WooTransport = (url: string, init: WooRequestInit) => Promise<Response>;
/** The public APIs: all `listAll` can read. */
export type WooPath = `wc/store/v1/${string}` | `wp/v2/${string}`;
/** Sent the key, and read only by `stockOf`. */
type WooKeyedPath = `wc/v3/${string}`;
/** HTTP Basic for wc/v3: a consumer key and its secret, or a WordPress user and an application password. */
export type WooAuth = { user: string; pass: string };
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
  /** Only `stockOf` needs it. */
  auth?: WooAuth;
};

export class WooHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`WooCommerce answered HTTP ${status} for ${url}`);
    this.name = "WooHttpError";
  }
}

/** An answer without exactly one row for each of these ids, in a read where an absence must not pass for a fact. */
export class WooPartialAnswer extends Error {
  constructor(readonly path: string, readonly ids: readonly number[]) {
    super(`${path} did not answer with one row each for ${ids.length} of the ids it was asked for, first ${ids.slice(0, 5).join(", ")}.`);
    this.name = "WooPartialAnswer";
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

/** The key as the header it leaves in: whole, for https only, or refused here, naming neither half. */
function keyHeader({ user, pass }: WooAuth, base: URL): string {
  if (!user.trim() || !pass.trim()) throw new Error("The wc/v3 key needs both halves: a consumer key and its secret, or a user and an application password.");
  if (base.protocol !== "https:") throw new Error("The wc/v3 key is sent over https only, and this shop's address is not https.");
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

/** One row per id, in the order asked, and nothing else: a row not asked for is no fact about these ids. */
function oneRowPerId<T extends { id: number }>(path: string, asked: readonly number[], body: unknown): T[] {
  const rows = Array.isArray(body) ? (body as (T | null)[]) : [];
  const found = asked.map((id) => rows.filter((row): row is T => row?.id === id));
  const failed = asked.filter((_, i) => found[i].length !== 1);
  if (failed.length > 0) throw new WooPartialAnswer(path, failed);
  return found.flat();
}

export function createWooClient(opts: WooClientOptions) {
  // Origin and path: a WordPress in a subdirectory answers at <path>/wp-json/. A query or fragment is no part of it.
  if (/[?#]/.test(opts.storeUrl)) throw new Error("The shop's address must not carry a query or fragment.");
  const base = parseAndValidateUrl(opts.storeUrl.replace(/\/?$/, "/"));
  if (base.username || base.password) throw new Error("The shop's address must not carry a user or password: a key goes in `auth`, never in a URL.");
  const authorization = opts.auth ? keyHeader(opts.auth, base) : null;
  const transport: WooTransport = opts.transport ?? ((url, init) => fetch(url, init));
  const assertHostPublic = opts.assertHostPublic ?? assertResolvedAddressesPublic;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const headers = { accept: "application/json", "user-agent": `cartwright-woo-import/1.0 (+${opts.siteUrl})` };

  /** `stop`: a sibling request failed — no further attempt or wait, and one in flight is aborted. */
  async function get(path: WooPath | WooKeyedPath, query: WooQuery, stop?: AbortSignal): Promise<{ body: unknown; headers: Headers }> {
    const url = new URL(`wp-json/${path}`, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    parseAndValidateUrl(url.href);
    await assertHostPublic(url.hostname);
    const sent = authorization && path.startsWith("wc/v3/") ? { ...headers, authorization } : headers;
    for (let attempt = 0; ; attempt++) {
      stop?.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
      let res: Response | null = null;
      let failure: unknown;
      try {
        const signal = stop ? AbortSignal.any([controller.signal, stop]) : controller.signal;
        res = await transport(url.href, { method: "GET", headers: sent, redirect: "manual", signal });
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
   * Rows asked for by id, ≤100 a request, four requests at a time. `optional`: a 4xx skips that request's
   * rows; otherwise an answer must hold one row per id. Any other failure ends the read and is what it
   * reports: its siblings stop retrying in the background, and no later request goes out.
   */
  async function byIds<T extends { id: number }>(path: WooPath | WooKeyedPath, ids: readonly number[], fields: string, optional: boolean): Promise<T[]> {
    const requests: (readonly number[])[] = [];
    for (let i = 0; i < ids.length; i += PER_PAGE) requests.push(ids.slice(i, i + PER_PAGE));
    const done = new AbortController();
    const read = async (asked: readonly number[]): Promise<T[]> => {
      try {
        const { body } = await get(path, { include: asked.join(","), per_page: PER_PAGE, _fields: fields }, done.signal);
        if (!optional) return oneRowPerId<T>(path, asked, body);
        return Array.isArray(body) ? (body as T[]) : [];
      } catch (err) {
        if (optional && err instanceof WooHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) return [];
        done.abort(err);
        throw err;
      }
    };
    const rows: T[] = [];
    for (let i = 0; i < requests.length; i += CONCURRENCY) {
      const answers = await Promise.all(requests.slice(i, i + CONCURRENCY).map((asked) => read(asked)));
      rows.push(...answers.flat());
    }
    return rows;
  }

  /** wp/v2 lists a product only when asked for it by id, and these extras may be closed to guests. */
  const wpProducts = (ids: number[]) => byIds<WooWpProduct>("wp/v2/product", ids, "id,status,yoast_head_json", true);

  /** No key, no read. It runs for an empty list too, so a run without one stops before it writes anything (spec 2026-10-25, §3D). */
  function assertKeyed(): void {
    if (!authorization) throw new Error("wc/v3 is read with a key, and this client was given none.");
  }

  /**
   * wc/v3's exact stock for these products, by Woo id, for `decide()`. A refused key, or
   * an id the shop does not answer for, throws: nothing is read as "no stock here".
   */
  async function stockOf(ids: readonly number[]): Promise<ReadonlyMap<string, WooStock>> {
    assertKeyed();
    const rows = await byIds<WooStock>("wc/v3/products", ids, "id,manage_stock,stock_quantity,stock_status", false);
    return new Map(rows.map(({ id, manage_stock, stock_quantity, stock_status }) => [String(id), { id, manage_stock, stock_quantity, stock_status }]));
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

  return { listAll, fetchSnapshot, stockOf };
}
