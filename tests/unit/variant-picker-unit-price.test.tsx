// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import VariantPicker, { type VariantOption } from "@/components/VariantPicker";
import { formatPrice } from "@/lib/format";
import en from "@/messages/en.json";

/**
 * MONEY1: the price the picker shows follows the same rule the cart charges:
 * the chosen variant's price, even when that price is 0, and until a variant is
 * chosen the "from" price the product page passes in. The figures were recorded
 * from the picker's inline rule on 3d58a5ed, before it moved to `unitPriceDkk`.
 */

vi.mock("@/components/AddToCartButton", () => ({ AddToCartButton: () => null }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FROM_PRICE = 4500;
const VARIANTS: VariantOption[] = [
  { id: "v-tall", sku: "F-2M", priceDkk: 6000, stock: 3, attributes: { height: "2m" } },
  { id: "v-free", sku: "S-FREE", priceDkk: 0, stock: 3, attributes: { height: "trial" } },
];

const fmt = (minor: number) => formatPrice(minor, { currency: brand.policies.currency, locale: "en" });

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VariantPicker productId="p-1" basePriceDkk={FROM_PRICE} variants={VARIANTS} />
      </NextIntlClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Chooses an option on the React-controlled select, the way a browser does. */
async function choose(value: string) {
  const select = container.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("the picker's displayed price", () => {
  it("is the page's from-price until a variant is chosen", () => {
    expect(container.textContent).toContain(fmt(FROM_PRICE));
  });

  it("is the chosen variant's price", async () => {
    await choose("2m");

    expect(container.textContent).toContain(fmt(6000));
    expect(container.textContent).not.toContain(fmt(FROM_PRICE));
  });

  it("is 0 for a variant priced 0, not the from-price", async () => {
    await choose("trial");

    expect(container.textContent).toContain(fmt(0));
    expect(container.textContent).not.toContain(fmt(FROM_PRICE));
  });
});
