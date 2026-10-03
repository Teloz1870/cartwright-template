"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getCheckoutCurrency } from "@/lib/currency-server";
import { addItem, updateItemQuantity, removeItem, getCart } from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { agentMoney, type AgentMoney } from "@/lib/format";
import { brand } from "@/brand.config";

/**
 * Agent-facing cart summary — the return shape of `get_cart` and of every
 * cart mutation below ("return sufficient information to verify results").
 *
 * Design notes:
 * - `cartItemId`/`productId`/`slug` are the handles an agent needs to chain
 *   calls (get_cart → update/remove, search → PDP). The old shape carried
 *   none of them, so an agent could read the cart but never act on a line.
 * - Money is `AgentMoney` (`{amountMinor, currency, formatted}`) — the old
 *   `subtotalDkk` hardcoded the currency into the field NAME and left no way
 *   to read which currency it actually was.
 * - Totals come from `calcPriceBreakdown`, the same source the cart page and
 *   checkout render from — the old hand-computed subtotal could drift from
 *   what the human sees.
 * - `maxQuantity` is the live stock for the line's variant (or product), so
 *   an agent can verify feasibility BEFORE mutating instead of discovering
 *   a cap after the fact.
 */
export type AgentCartSummary = {
  count: number;
  currency: string;
  items: {
    cartItemId: string;
    productId: string;
    variantId: string | null;
    productName: string;
    slug: string;
    quantity: number;
    maxQuantity: number;
    unitPrice: AgentMoney;
    lineTotal: AgentMoney;
  }[];
  subtotal: AgentMoney;
  shipping: AgentMoney;
  total: AgentMoney;
};

/**
 * Discriminated result for cart mutations — same house style as
 * `PlaceOrderResult` (checkout/actions.ts). `ok:false` covers DOMAIN
 * failures an agent can act on (the id wasn't in this cart, the input was
 * nonsense); infrastructure errors still THROW, exactly as before, so the
 * flag-off UI callers (`AddToCartButton`, `CartQuantity`) keep their
 * existing failure behavior — a DB outage must not render as "Added".
 */
export type CartMutationResult =
  | { ok: true; cart: AgentCartSummary | null }
  | { ok: false; error: string; code: "not_found" | "invalid_input" };

/**
 * @param locale the language the READER is in, threaded from the request.
 *
 * Without it `agentMoney` falls back to the currency's own locale — da-DK for
 * DKK — so every cart tool on an English page answered "149,00 kr.". That is
 * the defect this whole line of work started from, sitting on the surface it
 * matters most on: the money an agent quotes on the way to checkout.
 */
/**
 * @param how.locale the language the READER is in, threaded from the request.
 *   Without it `agentMoney` falls back to the currency's own locale — da-DK for
 *   DKK — so every cart tool on an English page answered "149,00 kr.".
 * @param how.chargeCurrency the currency the customer is CHARGED in
 *   (`getCheckoutCurrency()`). Without it the agent quotes the shop's base
 *   while the page shows, and Stripe charges, the presentment currency.
 *
 * NAMED rather than two positional strings, and that is not cosmetic: the
 * first version of this took `(cart, chargeCurrency, locale)` while both call
 * sites passed `(cart, locale, chargeCurrency)`. Both are `string | undefined`,
 * so the compiler saw nothing and the cart reported `currency: "da"`. Two
 * same-typed parameters side by side is a swap waiting to happen; an object
 * makes the swap a compile error.
 *
 * Both fields are REQUIRED though either may be undefined — an optional
 * property lets a caller drop it silently, which is how the locale went
 * missing from the mutation path the first time.
 */
function buildSummary(
  cart: Awaited<ReturnType<typeof getCart>>,
  how: { locale: string | undefined; chargeCurrency: string | undefined },
): AgentCartSummary {
  const { locale, chargeCurrency } = how;
  const rows = cart?.items ?? [];
  const items = rows.map((i) => {
    const unitMinor = i.variant?.priceDkk ?? i.product.priceDkk;
    return {
      cartItemId: i.id,
      productId: i.productId,
      variantId: i.variantId ?? null,
      productName: i.product.name,
      slug: i.product.slug,
      quantity: i.quantity,
      maxQuantity: i.variant?.stock ?? i.product.stock,
      unitPrice: agentMoney(unitMinor, locale, chargeCurrency),
      lineTotal: agentMoney(unitMinor * i.quantity, locale, chargeCurrency),
    };
  });
  // Same breakdown MATH as the cart page (calcPriceBreakdown, discount null
  // like its undiscounted view) — but over VARIANT-AWARE unit prices, which
  // is what checkout actually charges (lib/orders/create.ts). The page's
  // display currently reads product prices only for variant lines — a known,
  // separately-tracked display bug; the agent gets the billed truth, not the
  // bug. An EMPTY cart owes nothing:
  // calcPriceBreakdown([]) would report the flat shipping fee (0 < free-
  // shipping threshold), and an agent reading "total: 49 kr" on an empty
  // cart is a lie — zero the whole breakdown instead, like the cart page,
  // which never renders the breakdown for an empty cart at all.
  const breakdown =
    items.length === 0
      ? { subtotalDkk: 0, discountDkk: 0, shippingDkk: 0, totalDkk: 0 }
      : calcPriceBreakdown(
          rows.map((i) => ({
            // Pricing always runs in the store's BASE minor units. AgentMoney
            // below performs the one and only presentment conversion. Feeding
            // its already-converted amountMinor back into calcPriceBreakdown
            // converted totals twice whenever multiCurrency was enabled.
            unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
            quantity: i.quantity,
          })),
          null,
        );
  return {
    count: items.reduce((n, i) => n + i.quantity, 0),
    currency: chargeCurrency ?? brand.policies.currency,
    items,
    subtotal: agentMoney(breakdown.subtotalDkk, locale, chargeCurrency),
    shipping: agentMoney(breakdown.shippingDkk, locale, chargeCurrency),
    total: agentMoney(breakdown.totalDkk, locale, chargeCurrency),
  };
}

/**
 * Best-effort post-mutation snapshot. The mutation has already COMMITTED
 * when this runs — a read hiccup here must not turn a succeeded add/update/
 * remove into an apparent failure for the UI callers (which used to return
 * right after the mutation and never had this failure window). `null` tells
 * the agent "the mutation succeeded; call get_cart for the current state".
 */
async function safeSummary(): Promise<AgentCartSummary | null> {
  try {
    return buildSummary(await getCart(), {
    locale: await readLocale(),
    chargeCurrency: await readChargeCurrency(),
  });
  } catch {
    return null;
  }
}

/**
 * The request's locale, or undefined.
 *
 * These actions live under `app/[locale]/`, so next-intl always has one — but
 * a summary must never fail because the money could not be localised. An
 * undefined locale falls back to the currency default, which is what this did
 * before; a THROWN one would turn a committed cart mutation into an apparent
 * failure.
 */
/**
 * The charge currency, fail-soft like the locale above: a cart summary must
 * never fail because the currency could not be resolved. Undefined falls back
 * to base, which is what every shop with multiCurrency off charges anyway.
 */
async function readChargeCurrency(): Promise<string | undefined> {
  try {
    return await getCheckoutCurrency();
  } catch {
    return undefined;
  }
}

async function readLocale(): Promise<string | undefined> {
  try {
    return await getLocale();
  } catch {
    return undefined;
  }
}

/**
 * Read-only cart summary for WebMCP's `get_cart` tool (and any other client
 * use). Reads the cookie-bound cart server-side; no mutation.
 */
export async function getCartSummaryAction(): Promise<AgentCartSummary> {
  return buildSummary(await getCart(), {
    locale: await readLocale(),
    chargeCurrency: await readChargeCurrency(),
  });
}

/**
 * Add a product (optionally a variant) to the cart.
 *
 * Widened from `Promise<void>` for the WebMCP surface; the UI callers
 * (`AddToCartButton`) ignore the return value, so this is source- and
 * behavior-compatible. The variant-ownership check in `lib/cart.ts` still
 * THROWS — that is a caller bug or a stale id, and swallowing it here would
 * make the UI render success on a real failure. Tool `execute` wrappers
 * catch and translate throws for the agent.
 */
export async function addToCartAction(
  productId: string,
  variantId: string | null = null,
  quantity: number = 1,
): Promise<
  | { ok: true; added: { productId: string; variantId: string | null; quantity: number }; cart: AgentCartSummary | null }
  | { ok: false; error: string; code: "invalid_input" }
> {
  if (!productId || typeof productId !== "string") {
    return { ok: false, error: "productId is required.", code: "invalid_input" };
  }
  // Reject non-integers rather than flooring: 1.9 must not silently become
  // an order line of 1 (the old hardcoded-1 path could never receive it, and
  // a raw fractional would have thrown in Prisma — never half-succeeded).
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { ok: false, error: "quantity must be an integer between 1 and 99.", code: "invalid_input" };
  }
  const qty = quantity;
  await addItem(productId, qty, variantId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return {
    ok: true,
    added: { productId, variantId, quantity: qty },
    cart: await safeSummary(),
  };
}

/**
 * `lib/cart.ts`'s update/remove silently no-op when the id does not belong
 * to the caller's cart — correct as an ownership guard, but indistinguishable
 * from success for an agent. Accepted cost: the precheck + post-mutation
 * snapshot add up to two extra getCart roundtrips per mutation (auth +
 * one indexed cart query each) on a low-frequency interaction.
 * The precheck below turns that DOMAIN case into
 * `{ok:false, code:"not_found"}` at the action layer WITHOUT changing
 * lib/cart semantics (the guard itself stays where it is, server-side; the
 * lookup/mutate race is acceptable for agent UX — worst case the mutation
 * no-ops exactly as today and the returned cart snapshot shows the truth).
 */
export async function updateCartItemAction(
  cartItemId: string,
  quantity: number,
): Promise<CartMutationResult> {
  // NO upper ceiling here: CartQuantity's + button is disabled only at
  // quantity >= the line's stock (variant's when present) and ignores this
  // result, so a 99-cap would
  // silently freeze the flag-off UI for any product stocked above 99. The
  // agent-facing update tool (next slice) enforces its own 1–99 window;
  // this action keeps the storefront's existing contract. Non-integers are
  // rejected, not floored — the old path handed them raw to Prisma's Int
  // column, which threw; it never half-succeeded.
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { ok: false, error: "quantity must be an integer ≥ 0.", code: "invalid_input" };
  }
  const qty = quantity;
  const cart = await getCart();
  if (!cart?.items.some((i) => i.id === cartItemId)) {
    // Revalidate even on the miss: the read just proved the client's view is
    // stale (e.g. the line was removed in another tab). The OLD code always
    // revalidated — a silent lib/cart no-op still refreshed the page and the
    // stale row disappeared. Skipping it here would leave that row stuck for
    // the UI callers, which ignore the return value.
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { ok: false, error: "No such item in the current cart.", code: "not_found" };
  }
  await updateItemQuantity(cartItemId, qty);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return { ok: true, cart: await safeSummary() };
}

export async function removeCartItemAction(
  cartItemId: string,
): Promise<
  | { ok: true; removed: { productId: string; productName: string }; cart: AgentCartSummary | null }
  | { ok: false; error: string; code: "not_found" }
> {
  const cart = await getCart();
  const line = cart?.items.find((i) => i.id === cartItemId);
  if (!line) {
    // See updateCartItemAction: the miss itself proves the client is stale —
    // keep the old always-revalidate behavior so the UI self-heals.
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { ok: false, error: "No such item in the current cart.", code: "not_found" };
  }
  await removeItem(cartItemId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return {
    ok: true,
    removed: { productId: line.productId, productName: line.product.name },
    cart: await safeSummary(),
  };
}
