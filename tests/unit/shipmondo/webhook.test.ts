import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { carrierName, parseShipmentWebhook, verifyHs256 } from "@/plugins/shipmondo/lib/webhook";

/**
 * Shipmondo webhook verification (plugins/shipmondo/lib/webhook.ts): HS256
 * only, constant-time signature check, no key ⇒ refused. The tokens here are
 * signed in the test, the way Shipmondo signs with the webhook's key.
 */
const KEY = "shared-webhook-key";

function b64(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function sign(payload: unknown, key = KEY, header: unknown = { alg: "HS256", typ: "JWT" }): string {
  const head = b64(header);
  const body = b64(payload);
  const sig = createHmac("sha256", key).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const SHIPMENT = {
  id: 77,
  order_id: "1042",
  pkg_no: "00370712345678901234",
  carrier_code: "gls",
  receiver: { name: "Kunde", zipcode: "6780" },
};

describe("verifyHs256", () => {
  it("returns the payload of a token signed with the key", () => {
    expect(verifyHs256(sign({ a: 1 }), KEY)).toEqual({ a: 1 });
  });

  it.each([
    ["another key", () => sign({ a: 1 }, "wrong")],
    ["alg none", () => `${b64({ alg: "none" })}.${b64({ a: 1 })}.`],
    ["alg HS512 named by the token", () => sign({ a: 1 }, KEY, { alg: "HS512" })],
    ["a tampered payload", () => {
      const [h, , s] = sign({ a: 1 }).split(".");
      return `${h}.${b64({ a: 2 })}.${s}`;
    }],
    ["an expired token", () => sign({ a: 1, exp: Math.floor(Date.now() / 1000) - 60 })],
    ["not a JWT", () => "hello"],
  ])("refuses %s", (_label, token) => {
    expect(verifyHs256(token(), KEY)).toBeNull();
  });
});

describe("parseShipmentWebhook", () => {
  const event = {
    shipmentId: 77,
    orderRef: "1042",
    carrierCode: "gls",
    carrier: "GLS",
    trackingNumber: "00370712345678901234",
  };

  it("reads a shipment from a JSON envelope or a bare token, at the top or under data", () => {
    expect(parseShipmentWebhook(JSON.stringify({ data: sign(SHIPMENT) }), KEY)).toEqual({ ok: true, event });
    expect(parseShipmentWebhook(sign({ data: SHIPMENT, action: "create" }), KEY)).toEqual({ ok: true, event });
  });

  it("refuses every delivery when the shop set no webhook key", () => {
    expect(parseShipmentWebhook(sign(SHIPMENT), null)).toMatchObject({ ok: false, status: 401, reason: "no_webhook_key" });
  });

  it("refuses a bad signature as 401 and a malformed body as 400", () => {
    expect(parseShipmentWebhook(sign(SHIPMENT, "wrong"), KEY)).toMatchObject({ ok: false, status: 401 });
    expect(parseShipmentWebhook("{not json", KEY)).toMatchObject({ ok: false, status: 400, reason: "no_token" });
  });

  it("acknowledges a signed shipment with no webshop order or no tracking number, and reads none from it", () => {
    expect(parseShipmentWebhook(sign({ ...SHIPMENT, order_id: null }), KEY)).toMatchObject({
      ok: false,
      status: 200,
      reason: "not_an_order_shipment",
    });
    expect(parseShipmentWebhook(sign({ ...SHIPMENT, pkg_no: "" }), KEY)).toMatchObject({ ok: false, status: 200 });
  });
});

describe("carrierName", () => {
  it("names the carriers a Danish shop meets, and passes unknown codes through", () => {
    expect(carrierName("postnord")).toBe("PostNord");
    expect(carrierName("GLS")).toBe("GLS");
    expect(carrierName("dao")).toBe("DAO");
    expect(carrierName("some_new_carrier")).toBe("some_new_carrier");
    expect(carrierName(null)).toBeNull();
  });
});
