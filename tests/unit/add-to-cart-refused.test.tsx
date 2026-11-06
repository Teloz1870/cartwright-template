// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import da from "@/messages/da.json";

/**
 * CART-DELETED-PRODUCT, the storefront button. A product page opened before
 * the shop deleted the product still shows "Add to cart"; the click now gets
 * `{ ok: false, code: "not_found" }` back. The button used to ignore the
 * result and say "Added to cart" for a line that was never written.
 */

const mocks = vi.hoisted(() => ({ addToCartAction: vi.fn() }));
vi.mock("@/app/[locale]/cart/actions", () => ({ addToCartAction: mocks.addToCartAction }));

const { AddToCartButton } = await import("@/components/AddToCartButton");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  mocks.addToCartAction.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function clickAdd(): Promise<HTMLButtonElement> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AddToCartButton productId="prod-withdrawn" productName="Withdrawn Mug" />
      </NextIntlClientProvider>,
    );
  });
  const button = container.querySelector("button")!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return button;
}

describe("AddToCartButton when the add is refused", () => {
  it("says the product is no longer available, and does not say Added", async () => {
    mocks.addToCartAction.mockResolvedValue({
      ok: false,
      error: "Product not found: prod-withdrawn",
      code: "not_found",
    });

    const button = await clickAdd();

    expect(button.textContent).toBe("No longer available");
    expect(button.disabled).toBe(true);
    // The named label would read "Add Withdrawn Mug to cart" over the text.
    expect(button.getAttribute("aria-label")).toBeNull();
  });

  it("still says Added for an add that went through (guard)", async () => {
    mocks.addToCartAction.mockResolvedValue({ ok: true, added: {}, cart: null });

    const button = await clickAdd();

    expect(button.textContent).toBe("Added to cart");
    expect(button.getAttribute("aria-label")).toBe("Added Withdrawn Mug to cart");
  });
});

describe("both shipped languages carry the new copy", () => {
  it.each([
    ["en", en],
    ["da", da],
  ] as const)("%s", (_locale, messages) => {
    expect(messages.Cart.unavailable).toBeTruthy();
    // The checkout names WHICH line was removed.
    expect(messages.Checkout.errProductUnavailable).toContain("{items}");
  });
});
