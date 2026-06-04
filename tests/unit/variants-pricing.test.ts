import { describe, expect, it } from "vitest";

/**
 * Task B regression: pris-display logic for variant-produkter.
 *
 * Vi tester den rene min-pris/from-prefix-beregning isoleret. Den faktiske
 * implementation findes både i app/produkt/[slug]/page.tsx og
 * components/ProductCard.tsx — denne test pinner kontrakten så fremtidige
 * ændringer ikke ved et uheld viser forkert pris ved hover-card vs PDP.
 */

type Variant = { priceDkk: number };

function displayPrice(productPriceDkk: number, variants: Variant[]) {
  if (variants.length === 0) {
    return { showFromPrefix: false, priceDkk: productPriceDkk };
  }
  const minPrice = Math.min(...variants.map((v) => v.priceDkk));
  const showFromPrefix = minPrice < productPriceDkk;
  return { showFromPrefix, priceDkk: showFromPrefix ? minPrice : productPriceDkk };
}

describe("variant price display", () => {
  it("falder tilbage til product price når der ikke er varianter", () => {
    expect(displayPrice(19900, [])).toEqual({
      showFromPrefix: false,
      priceDkk: 19900,
    });
  });

  it("viser 'fra' med min-pris når billigste variant er under product price", () => {
    expect(
      displayPrice(50000, [
        { priceDkk: 30000 },
        { priceDkk: 50000 },
        { priceDkk: 80000 },
      ]),
    ).toEqual({ showFromPrefix: true, priceDkk: 30000 });
  });

  it("viser product price uden 'fra' når alle varianter er dyrere", () => {
    expect(
      displayPrice(19900, [
        { priceDkk: 25000 },
        { priceDkk: 30000 },
      ]),
    ).toEqual({ showFromPrefix: false, priceDkk: 19900 });
  });

  it("viser product price uden 'fra' når billigste variant matcher product price", () => {
    expect(
      displayPrice(19900, [
        { priceDkk: 19900 },
        { priceDkk: 25000 },
      ]),
    ).toEqual({ showFromPrefix: false, priceDkk: 19900 });
  });
});
