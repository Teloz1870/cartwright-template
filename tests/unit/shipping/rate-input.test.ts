import { describe, expect, it } from "vitest";
import { readRateDelivery } from "@/lib/shipping/rate-input";

/** How the admin's rate form is read (lib/shipping/rate-input.ts). */
describe("readRateDelivery", () => {
  it("defaults to delivery to the address, with no carrier and no template", () => {
    expect(readRateDelivery({})).toEqual({ ok: true, kind: "delivery", carrierCode: null, shipmentTemplateId: null });
  });

  it("takes the largest id a 32-bit INTEGER column holds", () => {
    expect(readRateDelivery({ shipmentTemplateId: "2147483647" })).toMatchObject({ ok: true, shipmentTemplateId: 2147483647 });
  });

  it("reads a pickup rate with its carrier and template", () => {
    expect(readRateDelivery({ kind: "pickup", carrierCode: " GLS ", shipmentTemplateId: " 36412387 " })).toEqual({
      ok: true,
      kind: "pickup",
      carrierCode: "gls",
      shipmentTemplateId: 36412387,
    });
  });

  it("refuses a pickup rate without a carrier: there would be no pickup points to offer", () => {
    expect(readRateDelivery({ kind: "pickup" })).toMatchObject({ ok: false, error: expect.stringContaining("carrier") });
  });

  it.each([
    [{ kind: "drone" }, /Delivery type/],
    [{ carrierCode: "GLS Danmark!" }, /Carrier code/],
    [{ shipmentTemplateId: "12abc" }, /whole number/],
    [{ shipmentTemplateId: "0" }, /above 0/],
    [{ shipmentTemplateId: "-4" }, /whole number/],
    [{ shipmentTemplateId: "2147483648" }, /too large/],
    [{ shipmentTemplateId: "99999999999" }, /whole number/],
    [{ kind: "pickup", carrierCode: "g" }, /Carrier code/],
  ])("refuses %j", (input, message) => {
    const r = readRateDelivery(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});
