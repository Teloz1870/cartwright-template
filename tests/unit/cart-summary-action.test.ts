import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcPriceBreakdown } from "@/lib/pricing";
import { brand } from "@/brand.config";
import { formatPrice } from "@/lib/format";
import { convertMinor } from "@/lib/money";

/**
 * The agent-facing cart contract (`AgentCartSummary` + the widened mutators).
 *
 * What is pinned and why:
 * - Every line carries the HANDLES an agent needs to chain calls
 *   (cartItemId/productId/slug) — the old shape carried none, so `get_cart`
 *   could read the cart but never act on a line.
 * - Money is `{amountMinor, currency, formatted}` — the old `subtotalDkk`
 *   hardcoded the currency into the field NAME.
 * - Totals must equal `calcPriceBreakdown` over VARIANT-AWARE lines — the
 *   amounts checkout actually charges (lib/orders/create.ts); the cart page's
 *   product-price-only display for variant lines is a known, separately
 *   tracked bug the agent must not inherit.
 * - Unit prices are VARIANT-aware (`variant.priceDkk ?? product.priceDkk`).
 * - `lib/cart.ts`'s silent ownership no-op becomes `{ok:false, code:"not_found"}`
 *   at the action layer — without changing lib/cart semantics.
 */

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const getLocale = vi.fn(async () => "da");
vi.mock("next-intl/server", () => ({ getLocale: () => getLocale() }));

const getCheckoutCurrency = vi.fn(
  async (): Promise<string> => brand.policies.currency,
);
vi.mock("@/lib/currency-server", () => ({
  getCheckoutCurrency: () => getCheckoutCurrency(),
}));

const getCart = vi.fn();
const addItem = vi.fn();
const updateItemQuantity = vi.fn();
const removeItem = vi.fn();
vi.mock("@/lib/cart", () => ({
  getCart: (...a: unknown[]) => getCart(...a),
  addItem: (...a: unknown[]) => addItem(...a),
  updateItemQuantity: (...a: unknown[]) => updateItemQuantity(...a),
  removeItem: (...a: unknown[]) => removeItem(...a),
}));

const actions = await import("@/app/[locale]/cart/actions");

const espresso = {
  id: "prod-espresso",
  name: "Espresso Blend",
  slug: "espresso-blend",
  priceDkk: 14900,
  stock: 25,
};
const grinder = {
  id: "prod-grinder",
  name: "Hand Grinder",
  slug: "hand-grinder",
  priceDkk: 39900,
  stock: 4,
};
const grinderVariant = { id: "var-steel", priceDkk: 44900, stock: 2 };

const fixtureCart = {
  id: "cart-1",
  items: [
    {
      id: "line-1",
      productId: espresso.id,
      variantId: null,
      quantity: 2,
      product: espresso,
      variant: null,
    },
    {
      id: "line-2",
      productId: grinder.id,
      variantId: grinderVariant.id,
      quantity: 1,
      product: grinder,
      variant: grinderVariant,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCheckoutCurrency.mockResolvedValue(brand.policies.currency);
  getCart.mockResolvedValue(fixtureCart);
});

describe("getCartSummaryAction — AgentCartSummary", () => {
  it("carries the chain handles, currency and variant-aware prices per line", async () => {
    const summary = await actions.getCartSummaryAction();

    expect(summary.currency).toBe(brand.policies.currency);
    expect(summary.count).toBe(3);

    const [l1, l2] = summary.items;
    expect(l1).toMatchObject({
      cartItemId: "line-1",
      productId: espresso.id,
      variantId: null,
      productName: espresso.name,
      slug: espresso.slug,
      quantity: 2,
      maxQuantity: espresso.stock,
    });
    expect(l1.unitPrice).toEqual({
      amountMinor: espresso.priceDkk,
      currency: brand.policies.currency,
      formatted: expect.any(String),
    });
    expect(l1.lineTotal.amountMinor).toBe(espresso.priceDkk * 2);

    // Variant line: variant price and variant stock win over the product's.
    expect(l2.unitPrice.amountMinor).toBe(grinderVariant.priceDkk);
    expect(l2.maxQuantity).toBe(grinderVariant.stock);
    expect(l2.variantId).toBe(grinderVariant.id);
  });

  it("totals equal calcPriceBreakdown over variant-aware lines — what checkout charges", async () => {
    const summary = await actions.getCartSummaryAction();
    const expected = calcPriceBreakdown(
      [
        { unitPriceDkk: espresso.priceDkk, quantity: 2 },
        { unitPriceDkk: grinderVariant.priceDkk, quantity: 1 },
      ],
      null,
    );
    expect(summary.subtotal.amountMinor).toBe(expected.subtotalDkk);
    expect(summary.shipping.amountMinor).toBe(expected.shippingDkk);
    expect(summary.total.amountMinor).toBe(expected.totalDkk);
  });

  it("converts presentment totals exactly once while pricing in base units", async () => {
    const targetCurrency = Object.keys(brand.policies.supportedCurrencies).find(
      (currency) => currency !== brand.policies.currency,
    )!;
    getCheckoutCurrency.mockResolvedValue(targetCurrency);

    const summary = await actions.getCartSummaryAction();
    const expected = calcPriceBreakdown(
      [
        { unitPriceDkk: espresso.priceDkk, quantity: 2 },
        { unitPriceDkk: grinderVariant.priceDkk, quantity: 1 },
      ],
      null,
    );

    expect(summary.currency).toBe(targetCurrency);
    expect(summary.subtotal.amountMinor).toBe(
      convertMinor(expected.subtotalDkk, targetCurrency),
    );
    expect(summary.shipping.amountMinor).toBe(
      convertMinor(expected.shippingDkk, targetCurrency),
    );
    expect(summary.total.amountMinor).toBe(
      convertMinor(expected.totalDkk, targetCurrency),
    );
    expect(summary.subtotal.amountMinor).toBe(
      summary.items.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0),
    );
  });

  it("empty/absent cart → ZEROED breakdown incl. shipping — an empty cart owes nothing", async () => {
    // calcPriceBreakdown([]) would report the flat shipping fee (0 is below
    // the free-shipping threshold); the summary must special-case empty.
    getCart.mockResolvedValue(null);
    const summary = await actions.getCartSummaryAction();
    expect(summary.count).toBe(0);
    expect(summary.items).toEqual([]);
    expect(summary.subtotal.amountMinor).toBe(0);
    expect(summary.shipping.amountMinor).toBe(0);
    expect(summary.total.amountMinor).toBe(0);
  });
});

describe("mutators — discriminated results over lib/cart's silent no-op", () => {
  it("addToCartAction validates input and returns the updated cart", async () => {
    const result = await actions.addToCartAction(espresso.id, null, 2);
    expect(addItem).toHaveBeenCalledWith(espresso.id, 2, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.added).toEqual({ productId: espresso.id, variantId: null, quantity: 2 });
      expect(result.cart?.count).toBe(3);
    }
  });

  it("addToCartAction rejects a nonsense quantity WITHOUT touching the cart", async () => {
    for (const quantity of [0, -3, 100, Number.NaN]) {
      const result = await actions.addToCartAction(espresso.id, null, quantity);
      expect(result.ok, String(quantity)).toBe(false);
    }
    expect(addItem).not.toHaveBeenCalled();
  });

  it("update on a foreign/stale id → {ok:false, not_found}, no mutation call — but STILL revalidates", async () => {
    // The miss proves the client's view is stale; the old code always
    // revalidated, and the UI (which ignores the return) relies on that to
    // self-heal a stale row. Losing it would freeze the row on screen.
    const result = await actions.updateCartItemAction("someone-elses-line", 3);
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(updateItemQuantity).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/cart");
  });

  it("update has NO upper ceiling — a 99-cap would freeze the flag-off UI above 99", async () => {
    // CartQuantity's + button is disabled only at quantity >= product stock
    // and ignores this result; a product stocked at 150 must still be able
    // to reach 100. The agent-facing tool applies its own window instead.
    const result = await actions.updateCartItemAction("line-1", 120);
    expect(updateItemQuantity).toHaveBeenCalledWith("line-1", 120);
    expect(result.ok).toBe(true);
  });

  it("both mutators REJECT fractional quantities — 1.9 must not silently become 1", async () => {
    // The old paths handed fractionals raw to Prisma's Int column, which
    // threw — they never half-succeeded. Flooring would be a new behavior.
    expect(await actions.addToCartAction(espresso.id, null, 1.9)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(await actions.updateCartItemAction("line-1", 2.5)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(updateItemQuantity).not.toHaveBeenCalled();
  });

  it("update on an owned id mutates and returns the fresh cart", async () => {
    const result = await actions.updateCartItemAction("line-1", 3);
    expect(updateItemQuantity).toHaveBeenCalledWith("line-1", 3);
    expect(result.ok).toBe(true);
  });

  it("remove returns WHAT was removed, for agent verification", async () => {
    const result = await actions.removeCartItemAction("line-2");
    expect(removeItem).toHaveBeenCalledWith("line-2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual({ productId: grinder.id, productName: grinder.name });
    }
  });

  it("remove on a foreign/stale id → {ok:false, not_found}, no mutation call — but STILL revalidates", async () => {
    const result = await actions.removeCartItemAction("nope");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(removeItem).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/cart");
  });

  it("a post-commit snapshot failure does NOT fail the committed mutation", async () => {
    // The write has landed when the verification read runs; a hiccup there
    // must not make AddToCartButton report failure on a succeeded add. The
    // agent gets cart:null = "succeeded; call get_cart for current state".
    getCart
      .mockResolvedValueOnce(fixtureCart) // update's ownership precheck
      .mockRejectedValueOnce(new Error("read hiccup")); // post-mutation snapshot
    const result = await actions.updateCartItemAction("line-1", 3);
    expect(updateItemQuantity).toHaveBeenCalledWith("line-1", 3);
    expect(result).toMatchObject({ ok: true, cart: null });
  });

  it("infrastructure errors still THROW — the flag-off UI contract", async () => {
    // A DB outage must not render as success in AddToCartButton.
    addItem.mockRejectedValueOnce(new Error("db down"));
    await expect(actions.addToCartAction(espresso.id)).rejects.toThrow("db down");
  });
});

/**
 * A cart MUTATION's returned summary, not just `get_cart`.
 *
 * `buildSummary` takes the locale, and both call sites must pass it — but only
 * `getCartSummaryAction` had a test. Dropping the argument in `safeSummary`
 * (the post-mutation snapshot every add/update/remove returns through) is a
 * plausible tidy-up of a try/catch wrapper: it typechecked, left `readLocale`
 * in use at the other call site, and left every `agentMoney(x, locale)` call
 * comma-bearing, so the source sweep saw nothing. The result would have been
 * `get_cart` answering "DKK 149.00" on /en while every mutation on the same
 * page answered "149,00 kr.".
 *
 * The parameter is required now, so that mistake is a compile error — and this
 * asserts the behaviour, because a compile error only covers the shape.
 */
describe("every cart action quotes money in the request's language", () => {
  const plain = (s: string) => s.replace(/\u00a0/g, " ");
  const oneLine = () => ({
    items: [
      {
        id: "line-1",
        productId: espresso.id,
        variantId: null,
        quantity: 1,
        product: espresso,
        variant: null,
      },
    ],
  });

  it("get_cart answers in English on an English page", async () => {
    getLocale.mockResolvedValue("en");
    getCart.mockResolvedValue(oneLine());
    const cart = await actions.getCartSummaryAction();
    expect(plain(cart.items[0].unitPrice.formatted)).toBe(
      plain(formatPrice(14900, { currency: brand.policies.currency, locale: "en" })),
    );
    expect(cart.total.currency).toBe(brand.policies.currency);
  });

  it("and so does the summary returned by a MUTATION", async () => {
    getLocale.mockResolvedValue("en");
    getCart.mockResolvedValue(oneLine());
    addItem.mockResolvedValue(undefined);
    const result = await actions.addToCartAction(espresso.id, null, 1);
    expect(result.ok).toBe(true);
    const cart = (result as { ok: true; cart: NonNullable<unknown> }).cart as {
      items: Array<{ unitPrice: { formatted: string } }>;
      total: { formatted: string };
    };
    expect(plain(cart.items[0].unitPrice.formatted)).toBe(
      plain(formatPrice(14900, { currency: brand.policies.currency, locale: "en" })),
    );
  });

  it("the two agree with each other — the disagreement WAS the bug", async () => {
    getLocale.mockResolvedValue("en");
    getCart.mockResolvedValue(oneLine());
    addItem.mockResolvedValue(undefined);
    const read = await actions.getCartSummaryAction();
    const mutated = await actions.addToCartAction(espresso.id, null, 1);
    expect((mutated as { cart: typeof read }).cart.total.formatted).toBe(
      read.total.formatted,
    );
  });

  it("speaks Danish on a Danish page", async () => {
    // Two of three canaries are Danish-facing; a fix aimed at English pages
    // that changed Danish output would regress both.
    getLocale.mockResolvedValue("da");
    getCart.mockResolvedValue(oneLine());
    const cart = await actions.getCartSummaryAction();
    expect(plain(cart.items[0].unitPrice.formatted)).toBe(
      plain(formatPrice(14900, { currency: brand.policies.currency, locale: "da" })),
    );
  });

  it("the two languages differ (vacuous otherwise)", async () => {
    getCart.mockResolvedValue(oneLine());
    getLocale.mockResolvedValue("en");
    const en = await actions.getCartSummaryAction();
    getLocale.mockResolvedValue("da");
    const da = await actions.getCartSummaryAction();
    expect(en.total.formatted).not.toBe(da.total.formatted);
  });
});
