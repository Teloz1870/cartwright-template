// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { formatPrice } from "@/lib/format";

/**
 * The price a shopper READS must be in the shopper's language.
 *
 * This is the report the whole language programme started from: the owner
 * opened demo.cartwright.app/en — an English-first shop — and saw
 * "119,00 kr.", the Danish decimal convention on an English page. Measured on
 * the live English PLP before this fix: 23 occurrences of "kr.".
 *
 * `<Price>` had a `locale` prop the whole time and not one of its four call
 * sites passed it (ProductCard, the PDP, VariantPicker, PDPStickyAtcBar), so
 * every storefront price fell through to formatPrice's currency default —
 * da-DK for DKK. A later pass fixed the cart, checkout, order and account
 * pages, which format server-side. This component is the one the shopper meets
 * FIRST, and it was missed because it takes the locale as an option rather
 * than reading it.
 *
 * It reads it now, so a fifth call site cannot reintroduce the bug by
 * forgetting a prop — which is exactly how the first four did.
 */
const mockLocale = vi.fn(() => "en");
const mockCurrency = vi.hoisted(() => ({ value: "DKK" }));
vi.mock("next-intl", () => ({ useLocale: () => mockLocale() }));
vi.mock("@/lib/currency-context", () => ({
  useCurrency: () => ({ currency: mockCurrency.value, fxRateOverrides: null }),
}));

mockCurrency.value = brand.policies.currency;

const { Price } = await import("@/components/Price");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const render = (node: React.ReactNode) => {
  act(() => root.render(node));
  // Intl uses a NON-BREAKING space; a typed literal without this never matches.
  return container.textContent?.replace(/ /g, " ") ?? "";
};

describe("Price renders in the page's language", () => {
  it("writes English money on an English page", () => {
    mockLocale.mockReturnValue("en");
    expect(render(<Price oere={14900} />)).toBe(
      formatPrice(14900, { currency: brand.policies.currency, locale: "en" }).replace(/ /g, " "),
    );
  });

  it("writes Danish money on a Danish page", () => {
    // The mirror case: two of three canaries are Danish-facing, and a fix
    // aimed at English pages that changed Danish output would be a regression
    // on both of them.
    mockLocale.mockReturnValue("da");
    expect(render(<Price oere={14900} />)).toBe(
      formatPrice(14900, { currency: brand.policies.currency, locale: "da" }).replace(/ /g, " "),
    );
  });

  it("the two actually differ (this file is vacuous otherwise)", () => {
    mockLocale.mockReturnValue("en");
    const en = render(<Price oere={14900} />);
    act(() => root.unmount());
    root = createRoot(container);
    mockLocale.mockReturnValue("da");
    expect(render(<Price oere={14900} />)).not.toBe(en);
  });

  it("still honours an explicit override", () => {
    // The prop stays, for the rare caller that must pin a locale.
    mockLocale.mockReturnValue("da");
    expect(render(<Price oere={14900} locale="en" />)).toBe(
      formatPrice(14900, { currency: brand.policies.currency, locale: "en" }).replace(/ /g, " "),
    );
  });

  it("READS the locale rather than defaulting to the currency's", () => {
    // The distinction that was the bug: DKK's default IS da-DK, so a component
    // that ignores the page renders Danish everywhere and looks fine on the
    // Danish canaries. Asserting the English page proves it consults the page.
    mockLocale.mockReturnValue("en");
    expect(render(<Price oere={14900} />)).toBe(
      formatPrice(14900, { currency: brand.policies.currency, locale: "en" }).replace(/ /g, " "),
    );
  });
});
