import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { PrismaClient } from "@/app/generated/prisma/client";
import { formatPrice } from "@/lib/format";
import { calcShipping } from "@/lib/pricing";
import en from "@/messages/en.json";

/**
 * MONEY1: one fixture cart, walked through every surface that prices a cart
 * line. The numbers below were RECORDED from the inline rule this refactor
 * replaced: this file was first run green on 3d58a5ed, where each of these
 * surfaces still wrote the rule out itself, and only then was any of them moved
 * to `unitPriceDkk`. So a green run says the totals did not move.
 *
 * The real getCart, createOrder, cart tools, cart actions, pages, abandoned-cart
 * job, Stripe webhook and chat route run on a libSQL file built from the
 * migration baseline. Only the request, Stripe's network, mail and the model are
 * stand-ins.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  stripeReady: false,
  designSurfaces: false,
  webhookEvent: null as unknown,
  chatTools: {} as Record<string, { execute: (args: unknown) => Promise<unknown> }>,
  createPaymentIntent: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  notifyOwnerOfPaidOrder: vi.fn(),
  sendAbandonedCartEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cart_session" ? { value: "sess-1" } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (ns: "Cart" | "Checkout") => (key: string) =>
    (en[ns] as Record<string, string>)[key],
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    ecommerceEnabled: true,
    features: { designSurfaces: state.designSurfaces, genomeResolve: false },
  }),
}));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => state.stripeReady,
  createPaymentIntent: state.createPaymentIntent,
  getStripeKeys: async () => ({
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    webhookSecret: "whsec_test_x",
  }),
  getStripeClient: async () => ({
    webhooks: { constructEvent: () => state.webhookEvent },
  }),
}));
vi.mock("@/lib/currency-server", () => ({
  getCheckoutCurrency: async () => brand.policies.currency,
}));
vi.mock("@/lib/fx/rates", () => ({ primeFxRatesFromDb: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ mailer: { sendOrderConfirmation: state.sendOrderConfirmation } }));
vi.mock("@/lib/orders/notify-owner", () => ({ notifyOwnerOfPaidOrder: state.notifyOwnerOfPaidOrder }));
vi.mock("@/lib/mailer/abandoned-cart", () => ({ sendAbandonedCartEmail: state.sendAbandonedCartEmail }));
vi.mock("@/lib/marketing/automations", () => ({
  marketingAutomationsEnabled: () => false,
  emitMarketingEvent: vi.fn(),
  MARKETING_EVENTS: { orderPlaced: "order.placed", cartAbandoned: "cart.abandoned" },
}));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
vi.mock("@/lib/genome/read", () => ({ readField: async (key: string) => key }));
// Islands and server components the static renderer has no need for: none of
// them prints a price.
vi.mock("@/components/Button", () => ({
  Button: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/CartQuantity", () => ({ CartQuantity: () => null }));
vi.mock("@/components/webmcp/CartWebMcpMount", () => ({ default: () => null }));
vi.mock("@/components/CheckoutForm", () => ({ default: () => null }));
vi.mock("@/components/TrustBadges", () => ({ default: () => null }));
// The chat route's model and tool catalogue. The preview under test is the
// route's own code, reached the way the model reaches it: by calling the tool.
vi.mock("ai", () => ({
  streamText: (options: { tools: typeof state.chatTools }) => {
    state.chatTools = options.tools;
    return { toUIMessageStreamResponse: () => new Response(null) };
  },
  tool: (definition: unknown) => definition,
  stepCountIs: () => undefined,
  convertToModelMessages: async () => [],
}));
vi.mock("@/lib/ai/client", () => ({
  chatModelResolved: async () => ({ provider: "test", model: "test", handle: {} }),
  getAnthropicApiKey: async () => "test-key",
  SYSTEM_PROMPT: "",
  CUSTOMER_TOOL_ALLOWLIST: ["orders.create"],
  MAX_TOOL_CALLS_PER_SESSION: 20,
  CUSTOMER_CONFIRM_REQUIRED: new Set(["orders.create"]),
  isCustomerTool: () => true,
}));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({
  getTool: () => ({ description: "", input: {} }),
  invokeTool: vi.fn(),
}));

const { createOrder } = await import("@/lib/orders/create");
const { getCartSummary, tryApplyDiscount } = await import("@/lib/tools/customer");
const { getCartSummaryAction } = await import("@/app/[locale]/cart/actions");
const { default: CartPage } = await import("@/app/[locale]/cart/page");
const { default: CheckoutPage } = await import("@/app/[locale]/checkout/page");
const { runAbandonedCartJob } = await import("@/lib/abandoned-cart");
const { POST: chatPOST } = await import("@/app/api/assistant/chat/route");
const { POST: webhookPOST } = await import("@/app/api/webhook/stripe/route");

// ── The recording ───────────────────────────────────────────────────────────
//
// In the order getCart returns the lines, which is CartItem.id.
const RECORDED_LINES = [
  // No variant: the product's price.
  { name: "Plain Mug", quantity: 2, unit: 1290, line: 2580 },
  // A variant above its product (5000): the variant's price.
  { name: "Fence Panel", quantity: 1, unit: 6000, line: 6000 },
  // A variant priced 0 under a product at 3990: free, not "unset".
  { name: "Sample Pack", quantity: 3, unit: 0, line: 0 },
];
const RECORDED_SUBTOTAL = 8580;
const RECORDED_DISCOUNT_10_PERCENT = 858;
const RECORDED_ITEM_COUNT = 6;
// Shipping is the shop's own policy, and a shop may set its own. On the engine's
// config this is 4900, for a total of 13480.
const SHIPPING = calcShipping(RECORDED_SUBTOTAL);
const TOTAL = RECORDED_SUBTOTAL + SHIPPING;

const shopper = {
  email: "kunde@shop.example.test",
  shippingName: "Kunde Jensen",
  shippingAddress: "Testvej 12",
  shippingZip: "1234",
  shippingCity: "Testby",
};

let dir = "";

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-unit-price-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.stripeReady = false;
  state.designSurfaces = false;
  state.webhookEvent = null;
  state.createPaymentIntent.mockReset().mockResolvedValue({
    paymentIntentId: "pi_money1",
    clientSecret: "pi_money1_secret",
  });
  state.sendOrderConfirmation.mockReset().mockResolvedValue(undefined);
  state.notifyOwnerOfPaidOrder.mockReset().mockResolvedValue(undefined);
  state.sendAbandonedCartEmail.mockReset().mockResolvedValue({ messageId: "m1" });

  const db = state.prisma;
  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await db.product.createMany({
    data: [
      { id: "mug", slug: "mug", name: "Plain Mug", description: "", priceDkk: 1290, images: "[]", categoryId: "cat", stock: 5 },
      { id: "fence", slug: "fence", name: "Fence Panel", description: "", priceDkk: 5000, images: "[]", categoryId: "cat", stock: 5 },
      { id: "sample", slug: "sample", name: "Sample Pack", description: "", priceDkk: 3990, images: "[]", categoryId: "cat", stock: 5 },
    ],
  });
  await db.productVariant.createMany({
    data: [
      { id: "fence-2m", productId: "fence", sku: "F-2M", priceDkk: 6000, stock: 3, attributes: { height: "2m" } },
      { id: "sample-free", productId: "sample", sku: "S-FREE", priceDkk: 0, stock: 5, attributes: { size: "trial" } },
    ],
  });
  await db.discountCode.create({ data: { code: "TEN", type: "percent", value: 10 } });
  await db.user.create({ data: { id: "user-1", email: shopper.email, name: "Kunde" } });
  // Both the guest session this request carries and a user: the abandoned-cart
  // job only looks at carts with an owner.
  await db.cart.create({ data: { id: "cart-1", sessionId: "sess-1", userId: "user-1" } });
  await db.cartItem.createMany({
    data: [
      { id: "line-1", cartId: "cart-1", productId: "mug", quantity: 2 },
      { id: "line-2", cartId: "cart-1", productId: "fence", variantId: "fence-2m", quantity: 1 },
      { id: "line-3", cartId: "cart-1", productId: "sample", variantId: "sample-free", quantity: 3 },
    ],
  });
}, 60_000);

afterEach(async () => {
  await state.prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const fmt = (minor: number) => formatPrice(minor, { currency: brand.policies.currency, locale: "en" });

/**
 * Each amount, in document order: a wrong line cannot hide behind the same
 * figure further down the page.
 */
function expectAmountsInOrder(html: string, amounts: string[]) {
  let at = 0;
  for (const amount of amounts) {
    const found = html.indexOf(amount, at);
    expect(found, `"${amount}" after offset ${at} in:\n${html}`).toBeGreaterThanOrEqual(0);
    at = found + amount.length;
  }
}

/** The receipt lines a mail gets: quantity and unit price, in any line order. */
function mailLines(call: { items: { quantity: number; unitPriceDkk: number; productName: string }[] }) {
  return call.items
    .map((i) => ({ name: i.productName, quantity: i.quantity, unit: i.unitPriceDkk }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const RECORDED_MAIL_LINES = [
  { name: "Fence Panel (2m)", quantity: 1, unit: 6000 },
  { name: "Plain Mug", quantity: 2, unit: 1290 },
  { name: "Sample Pack (trial)", quantity: 3, unit: 0 },
];

/** An order's stored lines, read back from the database. */
async function storedLines(orderId: string) {
  const rows = await state.prisma.orderItem.findMany({ where: { orderId }, orderBy: { productName: "asc" } });
  return rows.map((r) => ({ name: r.productName, quantity: r.quantity, unit: r.unitPriceDkk }));
}
const RECORDED_STORED_LINES = [
  { name: "Fence Panel", quantity: 1, unit: 6000 },
  { name: "Plain Mug", quantity: 2, unit: 1290 },
  { name: "Sample Pack", quantity: 3, unit: 0 },
];

describe.skipIf(!sqlite)("one fixture cart, priced on every surface", () => {
  it("cart.get_summary: units, line totals and the breakdown", async () => {
    const summary = (await getCartSummary.handler({}, { actor: "system:test" })) as {
      items: { name: string; quantity: number; unitPriceDkk: number; lineTotalDkk: number }[];
      subtotalDkk: number;
      discountDkk: number;
      shippingDkk: number;
      totalDkk: number;
      itemCount: number;
    };

    expect(
      summary.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unitPriceDkk, line: i.lineTotalDkk })),
    ).toEqual(RECORDED_LINES);
    expect(summary).toMatchObject({
      subtotalDkk: RECORDED_SUBTOTAL,
      discountDkk: 0,
      shippingDkk: SHIPPING,
      totalDkk: TOTAL,
      itemCount: RECORDED_ITEM_COUNT,
    });
  });

  it("discounts.try_apply: the saving and the new total", async () => {
    const preview = await tryApplyDiscount.handler({ code: "TEN" }, { actor: "system:test" });

    expect(preview).toEqual({
      ok: true,
      code: "TEN",
      savingsOere: RECORDED_DISCOUNT_10_PERCENT,
      newTotalOere: TOTAL - RECORDED_DISCOUNT_10_PERCENT,
      shippingOere: SHIPPING,
    });
  });

  it("the agent cart summary: units, line totals and the breakdown", async () => {
    const summary = await getCartSummaryAction();

    expect(
      summary.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unit: i.unitPrice.amountMinor,
        line: i.lineTotal.amountMinor,
      })),
    ).toEqual(RECORDED_LINES);
    expect(summary.count).toBe(RECORDED_ITEM_COUNT);
    expect(summary.subtotal.amountMinor).toBe(RECORDED_SUBTOTAL);
    expect(summary.shipping.amountMinor).toBe(SHIPPING);
    expect(summary.total.amountMinor).toBe(TOTAL);
  });

  it.each([
    ["legacy", false],
    ["designSurfaces", true],
  ])("the cart page, %s branch: each line, its total, then the summary", async (_branch, designSurfaces) => {
    state.designSurfaces = designSurfaces;

    const html = renderToStaticMarkup(await CartPage());

    expectAmountsInOrder(html, [
      ...RECORDED_LINES.flatMap((l) => [`${fmt(l.unit)} ${en.Cart.each}`, fmt(l.line)]),
      fmt(RECORDED_SUBTOTAL),
      SHIPPING === 0 ? en.Cart.free : fmt(SHIPPING),
      fmt(TOTAL),
    ]);
  });

  it.each([
    ["legacy", false],
    ["designSurfaces", true],
  ])("the checkout page, %s branch: each line total, then the summary", async (_branch, designSurfaces) => {
    state.designSurfaces = designSurfaces;

    const html = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({}) }));

    expectAmountsInOrder(html, [
      ...RECORDED_LINES.map((l) => fmt(l.line)),
      fmt(RECORDED_SUBTOTAL),
      SHIPPING === 0 ? en.Checkout.free : fmt(SHIPPING),
      fmt(TOTAL),
    ]);
  });

  it("a mock-mode order: the stored lines and totals, and both mails", async () => {
    const result = await createOrder(shopper);

    expect(result).toMatchObject({ ok: true, paymentMode: "mock", totalDkk: TOTAL });
    if (!result.ok) throw new Error(result.error);
    const order = await state.prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order).toMatchObject({
      status: "paid",
      subtotalDkk: RECORDED_SUBTOTAL,
      discountDkk: 0,
      shippingDkk: SHIPPING,
      totalDkk: TOTAL,
    });
    expect(await storedLines(result.orderId)).toEqual(RECORDED_STORED_LINES);
    expect(mailLines(state.sendOrderConfirmation.mock.calls[0][0])).toEqual(RECORDED_MAIL_LINES);
    expect(mailLines(state.notifyOwnerOfPaidOrder.mock.calls[0][0])).toEqual(RECORDED_MAIL_LINES);
  });

  it("a discounted order takes the discount off the same subtotal", async () => {
    const result = await createOrder({ ...shopper, discountCode: "TEN" });

    expect(result).toMatchObject({ ok: true, totalDkk: TOTAL - RECORDED_DISCOUNT_10_PERCENT });
    if (!result.ok) throw new Error(result.error);
    const order = await state.prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order).toMatchObject({
      subtotalDkk: RECORDED_SUBTOTAL,
      discountDkk: RECORDED_DISCOUNT_10_PERCENT,
      shippingDkk: SHIPPING,
      totalDkk: TOTAL - RECORDED_DISCOUNT_10_PERCENT,
    });
  });

  it("cart = order = provider amount, and the webhook replay accepts that amount", async () => {
    state.stripeReady = true;
    const cartTotal = ((await getCartSummary.handler({}, { actor: "system:test" })) as { totalDkk: number }).totalDkk;

    const result = await createOrder(shopper);

    expect(result).toMatchObject({ ok: true, paymentMode: "stripe", totalDkk: TOTAL });
    if (!result.ok) throw new Error(result.error);
    const pending = await state.prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(pending.status).toBe("pending_payment");
    const charged = state.createPaymentIntent.mock.calls[0][0].amountMinor as number;
    expect([cartTotal, pending.totalDkk, charged]).toEqual([TOTAL, TOTAL, TOTAL]);

    state.webhookEvent = {
      id: "evt_money1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_money1",
          amount: charged,
          currency: brand.policies.currency.toLowerCase(),
          payment_method_types: ["card"],
          metadata: { orderId: result.orderId },
        },
      },
    };
    const res = await webhookPOST(
      new Request("http://shop.example.test/api/webhook/stripe", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "sig" },
      }) as never,
    );

    expect(res.status).toBe(200);
    const paid = await state.prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(paid.status).toBe("paid");
    // The webhook's receipt reads the order's stored lines back: the snapshot,
    // named without the variant suffix the mock-mode mail appends.
    expect(mailLines(state.sendOrderConfirmation.mock.calls[0][0])).toEqual(RECORDED_STORED_LINES);
  });

  it("the abandoned-cart mail lists each line at its unit price", async () => {
    const run = await runAbandonedCartJob({ now: new Date(Date.now() + 48 * 3_600_000) });

    expect(run).toMatchObject({ eligible: 1, sent: 1 });
    const { items } = state.sendAbandonedCartEmail.mock.calls[0][0] as {
      items: { productName: string; quantity: number; unitPriceDkk: number }[];
    };
    expect(mailLines({ items })).toEqual(RECORDED_STORED_LINES);
  });

  it("the chat's order preview quotes the cart's total before Buy now", async () => {
    await chatPOST({
      cookies: {
        get: (name: string) => (name === "cart_session" ? { value: "sess-1" } : undefined),
        getAll: () => [{ name: "cart_session", value: "sess-1" }],
      },
      headers: new Headers(),
      json: async () => ({ messages: [] }),
    } as never);

    const plan = (await state.chatTools.orders_create.execute(shopper)) as {
      requiresConfirmation: boolean;
      args: { totalDkk: number };
      preview: string;
    };

    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.args.totalDkk).toBe(TOTAL);
    expect(plan.preview).toContain(`${RECORDED_ITEM_COUNT} items`);
  });
});
