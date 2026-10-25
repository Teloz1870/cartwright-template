// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

/**
 * CART-DELETED-PRODUCT (R1): when checkout takes the last withdrawn lines out
 * of a cart, nothing is left to buy. Refreshing the page then rendered its
 * empty state, which unmounted CheckoutForm together with the message that
 * said why — the shopper saw "Your cart is empty" and nothing else. The form
 * now navigates to `?removed=unavailable` in that case, and the empty state
 * renders a fixed notice for it.
 */

const mocks = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  getCart: vi.fn(),
  designSurfaces: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
  redirect: vi.fn(),
}));
vi.mock("@/app/[locale]/checkout/actions", () => ({ placeOrder: mocks.placeOrder }));
vi.mock("@/components/StripePaymentPanel", () => ({ default: () => null }));

// The page's server-side neighbours.
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    ecommerceEnabled: true,
    features: { designSurfaces: mocks.designSurfaces, genomeResolve: false },
  }),
}));
vi.mock("@/lib/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/stripe", () => ({ isStripeReady: async () => true }));
vi.mock("@/lib/currency-server", () => ({ getCheckoutCurrency: async () => "DKK" }));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
vi.mock("@/lib/genome/read", () => ({ readField: async (k: string) => k }));
vi.mock("@/components/Button", () => ({
  Button: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/TrustBadges", () => ({ default: () => null }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (ns: "Checkout") => (key: keyof (typeof en)["Checkout"]) => en[ns][key],
}));

const { default: CheckoutForm } = await import("@/components/CheckoutForm");
const { default: CheckoutPage } = await import("@/app/[locale]/checkout/page");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  mocks.designSurfaces = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Types into a React-controlled input the way a browser does. */
function type(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitValidForm() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CheckoutForm />
      </NextIntlClientProvider>,
    );
  });
  await act(async () => {
    type("shippingName", "Kunde Jensen");
    type("email", "kunde@example.dk");
    type("shippingAddress", "Testvej 12");
    type("shippingZip", "1234");
    type("shippingCity", "Testby");
  });
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const refusal = {
  ok: false,
  error: "No longer available, so removed from your cart: Withdrawn Mug. Review your order and place it again.",
  code: "PRODUCT_UNAVAILABLE",
  unavailableItems: ["Withdrawn Mug"],
};

describe("CheckoutForm after PRODUCT_UNAVAILABLE", () => {
  it("with nothing left, hands the explanation to the empty state instead of refreshing it away", async () => {
    mocks.placeOrder.mockResolvedValue({ ...refusal, cartEmpty: true });

    await submitValidForm();

    expect(mocks.placeOrder).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("?removed=unavailable", { scroll: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("with lines left, names the product and refreshes the summary beside the form (guard)", async () => {
    mocks.placeOrder.mockResolvedValue({ ...refusal, cartEmpty: false });

    await submitValidForm();

    expect(container.textContent).toContain("removed from your cart: Withdrawn Mug");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("the checkout page's empty state", () => {
  const render = async (removed?: string) =>
    renderToStaticMarkup(
      await CheckoutPage({ searchParams: Promise.resolve(removed ? { removed } : {}) }),
    );

  it.each([false, true])(
    "says why the cart is empty after the withdrawn lines were removed (designSurfaces %s)",
    async (designSurfaces) => {
      mocks.designSurfaces = designSurfaces;
      mocks.getCart.mockResolvedValue({ id: "cart-1", items: [], unavailableItems: [] });

      const html = await render("unavailable");

      expect(html).toContain(en.Checkout.removedUnavailable);
      expect(html).toContain('role="status"');
      expect(html).toContain(en.Checkout.emptyTitle);
    },
  );

  it("an ordinary empty cart shows no such notice (guard)", async () => {
    mocks.getCart.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain(en.Checkout.removedUnavailable);
    expect(html).toContain(en.Checkout.emptyTitle);
  });
});
