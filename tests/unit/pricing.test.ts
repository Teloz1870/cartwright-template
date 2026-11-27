import { describe, it, expect } from "vitest";
import {
  calcSubtotal,
  calcShipping,
  calcDiscount,
  calcPriceBreakdown,
  unitPriceDkk,
  SHIPPING_FEE_OERE,
} from "@/lib/pricing";

describe("unitPriceDkk", () => {
  it.each([
    ["a variant above its product: the variant's price", { product: { priceDkk: 5000 }, variant: { priceDkk: 6000 } }, 6000],
    ["a variant below its product: the variant's price", { product: { priceDkk: 5000 }, variant: { priceDkk: 4490 } }, 4490],
    ["no variant: the product's price", { product: { priceDkk: 1290 } }, 1290],
    ["a null variant, as a cart row has one: the product's price", { product: { priceDkk: 1290 }, variant: null }, 1290],
    ["a variant priced 0 is free, not unset", { product: { priceDkk: 3990 }, variant: { priceDkk: 0 } }, 0],
    ["a product priced 0 without a variant", { product: { priceDkk: 0 }, variant: null }, 0],
  ])("%s", (_label, line, expected) => {
    expect(unitPriceDkk(line)).toBe(expected);
  });
});

describe("calcSubtotal", () => {
  it("summerer linjer (pris × antal)", () => {
    expect(calcSubtotal([{ unitPriceDkk: 29900, quantity: 2 }, { unitPriceDkk: 10000, quantity: 1 }])).toBe(69800);
  });
  it("er 0 for tom kurv", () => {
    expect(calcSubtotal([])).toBe(0);
  });
});

describe("calcShipping", () => {
  it("opkræver fast fragt under tærsklen", () => {
    expect(calcShipping(10000)).toBe(SHIPPING_FEE_OERE);
  });
  it("er gratis ved eller over tærsklen (49900)", () => {
    expect(calcShipping(49900)).toBe(0);
    expect(calcShipping(60000)).toBe(0);
  });
  it("er fast fragt lige under tærsklen", () => {
    expect(calcShipping(49899)).toBe(SHIPPING_FEE_OERE);
  });
});

describe("calcDiscount", () => {
  it("er 0 uden rabat", () => {
    expect(calcDiscount(50000, null)).toBe(0);
  });
  it("beregner procent-rabat", () => {
    expect(calcDiscount(50000, { type: "percent", value: 10 })).toBe(5000);
  });
  it("runder procent-rabat", () => {
    expect(calcDiscount(29999, { type: "percent", value: 10 })).toBe(3000);
  });
  it("beregner fast rabat", () => {
    expect(calcDiscount(50000, { type: "fixed", value: 5000 })).toBe(5000);
  });
  it("begrænser fast rabat til subtotal", () => {
    expect(calcDiscount(3000, { type: "fixed", value: 5000 })).toBe(3000);
  });
});

describe("calcPriceBreakdown", () => {
  it("samler subtotal, rabat, fragt og total", () => {
    const lines = [{ unitPriceDkk: 20000, quantity: 1 }];
    const result = calcPriceBreakdown(lines, { type: "percent", value: 10 });
    expect(result).toEqual({
      subtotalDkk: 20000,
      discountDkk: 2000,
      shippingDkk: SHIPPING_FEE_OERE,
      totalDkk: 20000 - 2000 + SHIPPING_FEE_OERE,
    });
  });
  it("fragt beregnes ud fra subtotal før rabat", () => {
    const lines = [{ unitPriceDkk: 49900, quantity: 1 }];
    const result = calcPriceBreakdown(lines, { type: "fixed", value: 10000 });
    expect(result.shippingDkk).toBe(0);
    expect(result.totalDkk).toBe(49900 - 10000 + 0);
  });
  it("håndterer tom kurv uden rabat", () => {
    expect(calcPriceBreakdown([], null)).toEqual({
      subtotalDkk: 0,
      discountDkk: 0,
      shippingDkk: SHIPPING_FEE_OERE,
      totalDkk: SHIPPING_FEE_OERE,
    });
  });
});
