import "server-only";

import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/secret-encryption";

/**
 * Shipmondo webhooks: Shipmondo encodes each delivery as a JWT signed with the
 * key the webhook was registered with (WebhookCreate.key — "encrypt and
 * decrypt the webhook message with JWT"). This module verifies that signature
 * and reads a shipment out of it; the route that mounts it is a later slice.
 *
 * Fail closed: only HS256 is accepted (never `none`, never an algorithm the
 * token names for itself), the signature is compared in constant time, and a
 * shop with no key refuses every delivery.
 *
 * The envelope, per Shipmondo's documentation (shipmondo.dev/docs/webhooks/
 * requirements-and-structure): a JSON body `{ "data": "<jwt>" }`, the JWT
 * signed HS256 with the webhook's key, its payload `{ webhook, data, url }`
 * where `data` is the resource as its GET endpoint returns it. A bare token and
 * a resource at the top of the payload are read too. Not yet measured against
 * a live delivery (owner gate B62).
 */
export type ShipmondoShipmentEvent = {
  shipmentId: number | null;
  /** The sales order's `order_id`, i.e. what ./sales-order.ts sent: the order number, else the order id. */
  orderRef: string;
  carrierCode: string | null;
  carrier: string | null;
  trackingNumber: string;
};

export type WebhookResult =
  | { ok: true; event: ShipmondoShipmentEvent }
  /** 200: signed and well formed, but not a webshop order's shipment (one booked by hand). */
  | { ok: false; status: 200 | 400 | 401; reason: string };

const CARRIERS: Record<string, string> = {
  bring: "Bring",
  burd: "Burd",
  dao: "DAO",
  dhl_express: "DHL Express",
  dhl_parcel: "DHL Parcel",
  dsv: "DSV",
  fedex: "FedEx",
  gls: "GLS",
  postnord: "PostNord",
  ups: "UPS",
};

/** Shipmondo's carrier code as the customer reads it: "gls" → "GLS". Unknown codes pass through. */
export function carrierName(code: string | null | undefined): string | null {
  if (!code) return null;
  return CARRIERS[code.toLowerCase()] ?? code;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** The JWT's payload when it is an HS256 token signed with `key`, else null. */
export function verifyHs256(token: string, key: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const head = decodeJson(header) as { alg?: unknown } | null;
  if (!head || head.alg !== "HS256") return null;
  const expected = base64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  if (!safeEqual(expected, signature)) return null;
  const body = decodeJson(payload);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const exp = (body as { exp?: unknown }).exp;
  if (typeof exp === "number" && exp * 1000 < Date.now()) return null;
  return body as Record<string, unknown>;
}

function tokenOf(rawBody: string): string | null {
  const text = rawBody.trim();
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(text)) return text;
  try {
    const parsed = JSON.parse(text) as { data?: unknown };
    return typeof parsed.data === "string" ? parsed.data : null;
  } catch {
    return null;
  }
}

function stringOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** A verified shipment delivery, or why it was refused. `key` null = the shop set no webhook key. */
export function parseShipmentWebhook(rawBody: string, key: string | null): WebhookResult {
  if (!key) return { ok: false, status: 401, reason: "no_webhook_key" };
  const token = tokenOf(rawBody);
  if (!token) return { ok: false, status: 400, reason: "no_token" };
  const payload = verifyHs256(token, key);
  if (!payload) return { ok: false, status: 401, reason: "bad_signature" };

  const inner = payload.data;
  const shipment = (inner && typeof inner === "object" && !Array.isArray(inner) ? inner : payload) as Record<
    string,
    unknown
  >;
  const orderRef = stringOf(shipment.order_id);
  const trackingNumber = stringOf(shipment.pkg_no);
  // A shipment booked by hand in Shipmondo has order_id null: genuine, and none of ours.
  if (!orderRef || !trackingNumber) return { ok: false, status: 200, reason: "not_an_order_shipment" };
  const carrierCode = stringOf(shipment.carrier_code);
  const id = Number(shipment.id);
  return {
    ok: true,
    event: {
      shipmentId: Number.isInteger(id) ? id : null,
      orderRef,
      carrierCode,
      carrier: carrierName(carrierCode),
      trackingNumber,
    },
  };
}
