import "server-only";

import type { components, paths } from "./api";
import { requireShipmondoConfig, type ShipmondoConfig } from "./config";

/**
 * A thin, typed client for the Shipmondo API v3 (types: ./api.d.ts, generated
 * from Shipmondo's own OpenAPI spec by scripts/gen-shipmondo-types.ts).
 *
 * Plain `fetch` with HTTP Basic auth (API user : API key), a bounded timeout,
 * and one error type that keeps Shipmondo's status and message. Nothing is
 * built at import; each call reads the config, so a shop without a key pays
 * nothing until it calls Shipmondo.
 */
export type SalesOrderRequest = components["schemas"]["CreateSalesOrderRequest"];
export type SalesOrder = paths["/sales_orders/{id}"]["get"]["responses"][200]["content"]["application/json"];
export type SalesOrderQuery = NonNullable<paths["/sales_orders"]["get"]["parameters"]["query"]>;
export type PickupPointQuery = NonNullable<paths["/pickup_points"]["get"]["parameters"]["query"]>;
export type PickupPoint = paths["/pickup_points"]["get"]["responses"][200]["content"]["application/json"][number];
export type Shipment = components["schemas"]["Shipment"];
export type WebhookRequest = components["schemas"]["WebhookCreate"];
export type Webhook = components["schemas"]["Webhook"];

export class ShipmondoApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Shipmondo ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = "ShipmondoApiError";
  }
}

/** A run's time budget ran out before this request could start: it was never sent. */
export class ShipmondoDeadlineError extends Error {
  constructor(readonly path: string) {
    super(`Out of time before calling Shipmondo ${path}`);
    this.name = "ShipmondoDeadlineError";
  }
}

const TIMEOUT_MS = 15_000;
const MIN_REQUEST_MS = 1_000;

/** `deadline` (epoch ms): no request starts after it, and none may run past it. */
type Options = { config?: ShipmondoConfig; fetchImpl?: typeof fetch; deadline?: number };

async function request<T>(
  method: "GET" | "POST",
  path: string,
  opts: Options & { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<T> {
  const config = opts.config ?? requireShipmondoConfig();
  const url = new URL(config.baseUrl + path);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const remaining = opts.deadline === undefined ? TIMEOUT_MS : opts.deadline - Date.now();
  if (remaining < MIN_REQUEST_MS) throw new ShipmondoDeadlineError(path);
  const auth = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString("base64");
  let res: Response;
  let text: string;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
    method,
    headers: {
      authorization: `Basic ${auth}`,
      accept: "application/json",
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
    cache: "no-store",
    });
    // The body is read under the same signal: a stall there is the deadline's too.
    text = await res.text();
  } catch (err) {
    // Cut off by the run's budget (not by the ordinary 15 s timeout): deferred, not failed.
    const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (aborted && opts.deadline !== undefined && remaining < TIMEOUT_MS) throw new ShipmondoDeadlineError(path);
    throw err;
  }
  if (!res.ok) throw new ShipmondoApiError(res.status, path, text);
  return (text ? JSON.parse(text) : null) as T;
}

/** Pickup points (parcel shops) near an address, for one carrier. */
export function listPickupPoints(query: PickupPointQuery, opts?: Options): Promise<PickupPoint[]> {
  return request("GET", "/pickup_points", { ...opts, query });
}

/** Hands an order to Shipmondo; the shop then books the label there, as with the WooCommerce plugin. */
export function createSalesOrder(order: SalesOrderRequest, opts?: Options): Promise<SalesOrder> {
  return request("POST", "/sales_orders", { ...opts, body: order });
}

/** Sales orders matching a filter, e.g. `{ order_id }` to see whether an order is already there. */
export function findSalesOrders(query: SalesOrderQuery, opts?: Options): Promise<SalesOrder[]> {
  return request("GET", "/sales_orders", { ...opts, query });
}

export function getSalesOrder(id: number, opts?: Options): Promise<SalesOrder> {
  return request("GET", `/sales_orders/${encodeURIComponent(String(id))}`, opts);
}

export function getShipment(id: number, opts?: Options): Promise<Shipment> {
  return request("GET", `/shipments/${encodeURIComponent(String(id))}`, opts);
}

const WEBHOOK_PAGE = 50; // the spec's maximum per_page (default 20)

/** Every webhook on the account, page by page (bounded at 20 pages). */
export async function listWebhooks(opts?: Options): Promise<Webhook[]> {
  const all: Webhook[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await request<Webhook[]>("GET", "/webhooks", { ...opts, query: { per_page: WEBHOOK_PAGE, page } });
    all.push(...batch);
    if (batch.length < WEBHOOK_PAGE) break;
  }
  return all;
}

/** Registers a webhook; Shipmondo signs every delivery with `key` (see ./webhook.ts). */
export function createWebhook(webhook: WebhookRequest, opts?: Options): Promise<Webhook> {
  return request("POST", "/webhooks", { ...opts, body: webhook });
}
