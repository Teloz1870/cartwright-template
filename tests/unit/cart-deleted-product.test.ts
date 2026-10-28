import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";

/**
 * CART-DELETED-PRODUCT — a product the shop deleted (soft delete, `deletedAt`
 * set) can no longer be put in a cart, counted in one, or paid for.
 *
 * Measured before the fix: `addItem` (lib/cart.ts) never read `deletedAt`, so
 * the storefront cart action — which takes a raw product id from the client —
 * added a deleted product; a line already in a cart stayed in every total; and
 * `createOrder` (lib/orders/create.ts) created the order and the Stripe
 * PaymentIntent for it.
 *
 * The REAL lib/cart, cart action, customer tool and createOrder run here. Only
 * the database, the request (cookie, session) and Stripe are stand-ins. The
 * database stand-in answers the `where` clauses those modules send the way
 * SQLite would — including `deletedAt: null` — so a missing filter shows up as
 * a wrong answer, not as a missing mock call.
 *
 * CART-DRAFT-FILTER: a draft (`status: "draft"`) is held to the same rule on
 * this path — refused, left out of totals, refused at checkout by name — so
 * the stand-in answers `status` too.
 */

type Product = {
  id: string;
  slug: string;
  name: string;
  priceDkk: number;
  stock: number;
  status: "active" | "draft";
  deletedAt: Date | null;
  images: string;
  permalink: string | null;
};
type Variant = { id: string; productId: string; sku: string; priceDkk: number; stock: number; attributes: object };
type Line = { id: string; cartId: string; productId: string; variantId: string | null; quantity: number };

const db = vi.hoisted(() => ({
  products: new Map<string, Product>(),
  variants: new Map<string, Variant>(),
  lines: [] as Line[],
  nextLine: 1,
  /** Runs right after a product is looked up by slug (the tool's look-up). */
  afterSlugLookup: null as null | ((p: Product) => void),
  /** Runs as the order transaction opens, after getCart has been read. */
  beforeTransaction: null as null | (() => void),
}));

const stripe = vi.hoisted(() => ({
  createPaymentIntent: vi.fn(),
  orderCreate: vi.fn(),
}));

/** `where.deletedAt: null` means "live only"; absent means "any". So does an absent `status`. */
function matchesProduct(where: Record<string, unknown>, p: Product): boolean {
  if ("id" in where && where.id !== p.id) return false;
  if ("slug" in where && where.slug !== p.slug) return false;
  if ("status" in where && where.status !== p.status) return false;
  if ("deletedAt" in where && where.deletedAt === null && p.deletedAt !== null) return false;
  return true;
}

function joined(cartId: string) {
  return db.lines
    .filter((l) => l.cartId === cartId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => ({
      ...l,
      product: db.products.get(l.productId)!,
      variant: l.variantId ? db.variants.get(l.variantId)! : null,
    }));
}

function deleteLines(where: { cartId: string; id?: { in: string[] } }) {
  const before = db.lines.length;
  db.lines = db.lines.filter(
    (l) => !(l.cartId === where.cartId && (!where.id || where.id.in.includes(l.id))),
  );
  return { count: before - db.lines.length };
}

vi.mock("@/lib/db", () => {
  const cartItem = {
    findFirst: async ({ where }: { where: Partial<Line> }) =>
      db.lines.find(
        (l) =>
          l.cartId === where.cartId &&
          l.productId === where.productId &&
          l.variantId === (where.variantId ?? null),
      ) ?? null,
    create: async ({ data }: { data: Omit<Line, "id" | "variantId"> & { variantId?: string } }) => {
      const line = { id: `line-${db.nextLine++}`, variantId: null, ...data };
      db.lines.push(line);
      return line;
    },
    update: async ({ where, data }: { where: { id: string }; data: { quantity: { increment: number } } }) => {
      const line = db.lines.find((l) => l.id === where.id)!;
      line.quantity += data.quantity.increment;
      return line;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { cartId_productId_variantId: Omit<Line, "id" | "quantity"> };
      create: Omit<Line, "id">;
      update: { quantity: { increment: number } };
    }) => {
      const k = where.cartId_productId_variantId;
      const line = db.lines.find(
        (l) => l.cartId === k.cartId && l.productId === k.productId && l.variantId === k.variantId,
      );
      if (line) {
        line.quantity += update.quantity.increment;
        return line;
      }
      const created = { id: `line-${db.nextLine++}`, ...create };
      db.lines.push(created);
      return created;
    },
    deleteMany: async ({ where }: { where: { cartId: string; id?: { in: string[] } } }) =>
      deleteLines(where),
  };

  const tx = {
    order: { create: stripe.orderCreate },
    product: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; stock: { gte: number }; status?: string; deletedAt?: null };
        data: { stock: { decrement: number } };
      }) => {
        const p = db.products.get(where.id);
        if (!p || p.stock < where.stock.gte || !matchesProduct(where, p)) return { count: 0 };
        p.stock -= data.stock.decrement;
        return { count: 1 };
      },
    },
    productVariant: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; stock: { gte: number }; product?: { status?: string; deletedAt: null } };
        data: { stock: { decrement: number } };
      }) => {
        const v = db.variants.get(where.id);
        const p = v && db.products.get(v.productId);
        if (!v || !p || v.stock < where.stock.gte) return { count: 0 };
        if (where.product && !matchesProduct(where.product, p)) return { count: 0 };
        v.stock -= data.stock.decrement;
        return { count: 1 };
      },
    },
    discountCode: { update: vi.fn() },
    cartItem,
    user: { update: vi.fn() },
  };

  return {
    prisma: {
      product: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const p = [...db.products.values()].find((x) => matchesProduct(where, x)) ?? null;
          if (p && "slug" in where) db.afterSlugLookup?.(p);
          return p ? { ...p } : null;
        },
      },
      productVariant: {
        findUnique: async ({
          where,
        }: {
          where: { id?: string; productId_sku?: { productId: string; sku: string } };
        }) => {
          if (where.id) return db.variants.get(where.id) ?? null;
          const k = where.productId_sku!;
          return (
            [...db.variants.values()].find((v) => v.productId === k.productId && v.sku === k.sku) ??
            null
          );
        },
      },
      cart: {
        findUnique: async ({ where }: { where: { sessionId: string } }) =>
          where.sessionId === "sess-1"
            ? { id: "cart-1", sessionId: "sess-1", userId: null, items: joined("cart-1") }
            : null,
        findFirst: async () => null,
      },
      cartItem,
      discountCode: { findUnique: async () => null },
      order: { update: vi.fn(async () => ({})) },
      $transaction: async (fn: (t: typeof tx) => unknown) => {
        db.beforeTransaction?.();
        return fn(tx);
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cart_session" ? { value: "sess-1" } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/currency-server", () => ({
  getCheckoutCurrency: async () => brand.policies.currency,
}));
vi.mock("@/lib/fx/rates", () => ({ primeFxRatesFromDb: async () => undefined }));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => true,
  createPaymentIntent: stripe.createPaymentIntent,
  getStripeKeys: async () => ({ publishableKey: "pk_test_123" }),
}));
vi.mock("@/lib/mailer", () => ({ mailer: { sendOrderConfirmation: vi.fn() } }));
vi.mock("@/lib/orders/notify-owner", () => ({ notifyOwnerOfPaidOrder: vi.fn() }));
vi.mock("@/lib/orders/cancel-unpaid", () => ({ cancelUnpaidOrder: vi.fn() }));

const { addItem, getCartCount, CartProductUnavailableError } = await import("@/lib/cart");
const { addToCartAction, getCartSummaryAction } = await import("@/app/[locale]/cart/actions");
const { addToCart } = await import("@/lib/tools/customer");
const { createOrder } = await import("@/lib/orders/create");

const MUG: Product = {
  id: "prod-mug",
  slug: "ceramic-mug",
  name: "Ceramic Mug",
  priceDkk: 12900,
  stock: 10,
  status: "active",
  deletedAt: null,
  images: "[]",
  permalink: null,
};
const WITHDRAWN: Product = {
  ...MUG,
  id: "prod-withdrawn",
  slug: "withdrawn-mug",
  name: "Withdrawn Mug",
  priceDkk: 100, // a mispriced product is a typical reason to delete one
  deletedAt: new Date("2026-10-20T09:00:00Z"),
};
/** Not deleted — kept back as a draft. */
const DRAFT: Product = {
  ...MUG,
  id: "prod-draft",
  slug: "draft-mug",
  name: "Draft Mug",
  priceDkk: 200,
  status: "draft",
};

const shipping = {
  email: "kunde@example.dk",
  shippingName: "Kunde Jensen",
  shippingAddress: "Testvej 12",
  shippingZip: "1234",
  shippingCity: "Testby",
};

function seedLine(productId: string, quantity: number) {
  db.lines.push({ id: `line-${db.nextLine++}`, cartId: "cart-1", productId, variantId: null, quantity });
}

beforeEach(() => {
  db.products = new Map([
    [MUG.id, { ...MUG }],
    [WITHDRAWN.id, { ...WITHDRAWN }],
    [DRAFT.id, { ...DRAFT }],
  ]);
  db.variants = new Map([
    [
      "var-withdrawn",
      { id: "var-withdrawn", productId: WITHDRAWN.id, sku: "W-BLUE", priceDkk: 100, stock: 5, attributes: {} },
    ],
    ["var-draft", { id: "var-draft", productId: DRAFT.id, sku: "D-BLUE", priceDkk: 200, stock: 5, attributes: {} }],
  ]);
  db.lines = [];
  db.nextLine = 1;
  db.afterSlugLookup = null;
  db.beforeTransaction = null;
  stripe.createPaymentIntent.mockReset().mockResolvedValue({
    paymentIntentId: "pi_123",
    clientSecret: "pi_123_secret",
  });
  stripe.orderCreate.mockReset().mockResolvedValue({ id: "order-1" });
});

describe("adding a deleted product to the cart is refused", () => {
  it("the storefront cart action answers not_found and writes no line", async () => {
    const result = await addToCartAction(WITHDRAWN.id, null, 1);

    expect(result).toEqual({
      ok: false,
      error: `Product not found: ${WITHDRAWN.id}`,
      code: "not_found",
    });
    expect(db.lines).toEqual([]);
  });

  it("an id no product has gets the same answer", async () => {
    const result = await addToCartAction("prod-ghost", null, 1);

    expect(result).toEqual({ ok: false, error: "Product not found: prod-ghost", code: "not_found" });
    expect(db.lines).toEqual([]);
  });

  it("so does a variant of a deleted product", async () => {
    const result = await addToCartAction(WITHDRAWN.id, "var-withdrawn", 1);

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(db.lines).toEqual([]);
  });

  it("the customer chat tool refuses a deleted slug (guard: its own look-up filters deletedAt)", async () => {
    await expect(
      addToCart.handler({ slug: WITHDRAWN.slug, quantity: 1 }, { actor: "storefront-chat:t" }),
    ).rejects.toThrow(`Product not found: ${WITHDRAWN.slug}`);
    expect(db.lines).toEqual([]);
  });

  it("the customer chat tool refuses a product deleted between its look-up and the write", async () => {
    // The shared write path is what holds the line: the tool found the mug
    // live, the shop deleted it a moment later, addItem must still refuse.
    db.afterSlugLookup = (p) => {
      db.products.get(p.id)!.deletedAt = new Date();
    };

    const err = await addToCart
      .handler({ slug: MUG.slug, quantity: 1 }, { actor: "storefront-chat:t" })
      .catch((e: unknown) => e);

    expect(db.lines).toEqual([]);
    expect((err as Error).message).toBe(`Product not found: ${MUG.id}`);
    expect(err).toBeInstanceOf(CartProductUnavailableError);
  });

  it("a live product is still added (guard)", async () => {
    const result = await addToCartAction(MUG.id, null, 2);
    await addItem(MUG.id, 1);

    expect(result).toMatchObject({ ok: true, added: { productId: MUG.id, quantity: 2 } });
    expect(db.lines).toEqual([
      expect.objectContaining({ productId: MUG.id, variantId: null, quantity: 3 }),
    ]);
  });
});

describe("a deleted product already in a cart", () => {
  it("is left out of the cart's lines, count and total", async () => {
    seedLine(MUG.id, 2);
    seedLine(WITHDRAWN.id, 3);

    const summary = await getCartSummaryAction();

    expect(summary.items.map((i) => i.productId)).toEqual([MUG.id]);
    expect(summary.count).toBe(2);
    expect(summary.subtotal.amountMinor).toBe(MUG.priceDkk * 2);
    expect(await getCartCount()).toBe(2);
    // Hidden, not destroyed: the shop may restore the product.
    expect(db.lines).toHaveLength(2);
  });
});

describe("placing an order with a deleted product", () => {
  it("is refused by name before any order or Stripe call, and the line is cleared", async () => {
    seedLine(MUG.id, 2);
    seedLine(WITHDRAWN.id, 3);

    const result = await createOrder(shipping);

    expect(result).toMatchObject({
      ok: false,
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Withdrawn Mug"],
    });
    expect(!result.ok && result.error).toContain("Withdrawn Mug");
    expect(stripe.orderCreate).not.toHaveBeenCalled();
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    expect(db.lines.map((l) => l.productId)).toEqual([MUG.id]);
    expect(db.products.get(MUG.id)!.stock).toBe(10);
  });

  it("the next attempt charges exactly the cart that is shown", async () => {
    seedLine(MUG.id, 2);
    seedLine(WITHDRAWN.id, 3);
    await createOrder(shipping);

    const result = await createOrder(shipping);

    expect(result).toMatchObject({ ok: true, paymentMode: "stripe" });
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(1);
    const { totalDkk } = result as { totalDkk: number };
    expect(totalDkk).toBe(
      (await import("@/lib/pricing")).calcPriceBreakdown(
        [{ unitPriceDkk: MUG.priceDkk, quantity: 2 }],
        null,
      ).totalDkk,
    );
  });

  it("a product deleted after the cart was read is caught in the transaction, still before Stripe", async () => {
    seedLine(MUG.id, 2);
    db.beforeTransaction = () => {
      db.products.get(MUG.id)!.deletedAt = new Date();
    };

    const result = await createOrder(shipping);

    expect(result).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    expect(db.products.get(MUG.id)!.stock).toBe(10);
  });

  it("a cart of live products still checks out (guard)", async () => {
    seedLine(MUG.id, 1);

    const result = await createOrder(shipping);

    expect(result).toMatchObject({ ok: true, paymentMode: "stripe", orderId: "order-1" });
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(db.products.get(MUG.id)!.stock).toBe(9);
    expect(db.lines).toEqual([]);
  });
});

describe("a draft is held to the deleted product's rule (CART-DRAFT-FILTER)", () => {
  it("the storefront cart action refuses a draft with the same answer, writing no line", async () => {
    const result = await addToCartAction(DRAFT.id, null, 1);

    expect(result).toEqual({ ok: false, error: `Product not found: ${DRAFT.id}`, code: "not_found" });
    expect(db.lines).toEqual([]);
  });

  it("so does a variant of a draft", async () => {
    const result = await addToCartAction(DRAFT.id, "var-draft", 1);

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(db.lines).toEqual([]);
  });

  it("the customer chat tool refuses a draft's slug", async () => {
    await expect(
      addToCart.handler({ slug: DRAFT.slug, quantity: 1 }, { actor: "storefront-chat:t" }),
    ).rejects.toThrow(`Product not found: ${DRAFT.slug}`);
    expect(db.lines).toEqual([]);
  });

  it("a draft line already in a cart is left out of its lines, count and total", async () => {
    seedLine(MUG.id, 2);
    seedLine(DRAFT.id, 3);

    const summary = await getCartSummaryAction();

    expect(summary.items.map((i) => i.productId)).toEqual([MUG.id]);
    expect(summary.count).toBe(2);
    expect(summary.subtotal.amountMinor).toBe(MUG.priceDkk * 2);
    expect(await getCartCount()).toBe(2);
    expect(db.lines).toHaveLength(2);
  });

  it("checkout refuses a draft line by name before any order or Stripe call, and clears it", async () => {
    seedLine(MUG.id, 2);
    seedLine(DRAFT.id, 1);

    const result = await createOrder(shipping);

    expect(result).toMatchObject({
      ok: false,
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Draft Mug"],
      cartEmpty: false,
    });
    expect(stripe.orderCreate).not.toHaveBeenCalled();
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
    expect(db.lines.map((l) => l.productId)).toEqual([MUG.id]);
    expect(db.products.get(DRAFT.id)!.stock).toBe(10);
  });

  it.each([
    ["without variants", null],
    ["through a variant", "var-mug"],
  ] as const)(
    "a product set to draft after the cart was read, %s, is caught in the transaction before Stripe",
    async (_label, variantId) => {
      db.variants.set("var-mug", {
        id: "var-mug",
        productId: MUG.id,
        sku: "M-RED",
        priceDkk: MUG.priceDkk,
        stock: 5,
        attributes: {},
      });
      db.lines.push({ id: `line-${db.nextLine++}`, cartId: "cart-1", productId: MUG.id, variantId, quantity: 1 });
      db.beforeTransaction = () => {
        db.products.get(MUG.id)!.status = "draft";
      };

      const result = await createOrder(shipping);

      expect(result).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
      expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
      expect(db.products.get(MUG.id)!.stock).toBe(10);
      expect(db.variants.get("var-mug")!.stock).toBe(5);
    },
  );
});
