import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
} from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { validateDiscountCode } from "@/lib/discount";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { defineTool } from "@/lib/tools/types";
import { checkoutSchema } from "@/lib/validation";
import { createOrder } from "@/lib/orders/create";
import {
  decodeShippingCookie,
  SHIPPING_COOKIE_NAME,
} from "@/lib/shipping-cookie";

// ── Kunde-vendte tools ───────────────────────────────────────────────────────
//
// Disse tools eksponeres KUN gennem storefront-chatten (in-process via cookie-
// session) — aldrig via MCP/REST. De læser cart-state fra cookies, hvilket
// betyder de skal kaldes inden for en request-context der har dem.
//
// Sikkerhed: scope-systemet sikrer at admin-API-keys aldrig ved et uheld
// kalder disse tools eller omvendt. cart.* tools kræver "cart:write";
// catalog.* tools deler "catalog:read" med storefront-chat.

const addToCartInput = z.object({
  slug: z.string().min(1),
  quantity: z.number().int().min(1).max(10).default(1),
  // Task B: optional variant-SKU så AI kan specificere variant ved navn.
  // Hvis sat: resolve til variantId pr. lookup på (productId, sku).
  variantSku: z.string().min(1).max(80).optional(),
});

const updateQuantityInput = z.object({
  slug: z.string().min(1),
  quantity: z.number().int().min(0).max(10), // 0 = fjern
});

const removeInput = z.object({
  slug: z.string().min(1),
});

const tryDiscountInput = z.object({
  code: z.string().min(1),
});

const lookupByEmailInput = z.object({
  email: z.string().email("Invalid email"),
});

// Per-session lookup-loft for email-enumeration-mitigation.
// In-memory Map keyed på sessionId. 5 lookups per session per chat-session-cookie.
// GC ved next access hvis Map > 200 sessions (LRU-ish via insertion order).
const lookupCountBySession = new Map<string, number>();
const MAX_LOOKUPS_PER_SESSION = 5;

function bumpLookupCount(sid: string): boolean {
  if (lookupCountBySession.size > 200) {
    const oldest = lookupCountBySession.keys().next().value;
    if (oldest) lookupCountBySession.delete(oldest);
  }
  const current = lookupCountBySession.get(sid) ?? 0;
  if (current >= MAX_LOOKUPS_PER_SESSION) return false;
  lookupCountBySession.set(sid, current + 1);
  return true;
}

export function _resetLookupCountsForTest(): void {
  lookupCountBySession.clear();
}

// ── cart.add ────────────────────────────────────────────────────────────────

export const addToCart = defineTool({
  name: "cart.add",
  description:
    "Add a product to the cart, or increase quantity if it is already there. Identify the product by slug. Default quantity = 1. If the product has variants, a specific variant can be added with variantSku.",
  scope: "cart:write",
  input: addToCartInput,
  examples: [
    {
      name: "Add a product to cart",
      body: {
        slug: "ceramic-mug",
        quantity: 2
      }
    }
  ],
  skipAudit: true, // cart-ændringer er ikke admin-audit-værdige
  handler: async (args) => {
    const product = await prisma.product.findFirst({
      where: { slug: args.slug, deletedAt: null },
      select: { id: true, name: true, stock: true, priceDkk: true },
    });
    if (!product) throw new Error(`Product not found: ${args.slug}`);

    // Task B: hvis variantSku er angivet, resolve til variant + brug variant-stock
    // i lager-check. Ellers brug product-stock (eksisterende adfærd).
    let variantId: string | null = null;
    let availableStock = product.stock;
    if (args.variantSku) {
      const variant = await prisma.productVariant.findUnique({
        where: {
          productId_sku: { productId: product.id, sku: args.variantSku },
        },
        select: { id: true, stock: true },
      });
      if (!variant) {
        throw new Error(
          `Variant '${args.variantSku}' does not exist for product '${args.slug}'`,
        );
      }
      variantId = variant.id;
      availableStock = variant.stock;
    }

    if (availableStock < args.quantity) {
      throw new Error(
        `Only ${availableStock} in stock. Cannot add ${args.quantity} to the cart`,
      );
    }

    await addItem(product.id, args.quantity, variantId);

    return {
      ok: true,
      added: {
        slug: args.slug,
        name: product.name,
        quantity: args.quantity,
        ...(args.variantSku ? { variantSku: args.variantSku } : {}),
      },
    };
  },
});

// ── cart.update_quantity ────────────────────────────────────────────────────

export const updateCartQuantity = defineTool({
  name: "cart.update_quantity",
  description:
    "Set a product's cart quantity to a specific value. quantity=0 removes it.",
  scope: "cart:write",
  input: updateQuantityInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart) throw new Error("Cart is empty");

    const item = cart.items.find((i) => i.product.slug === args.slug);
    if (!item) throw new Error(`'${args.slug}' is not in the cart`);

    if (args.quantity === 0) {
      await removeItem(item.id);
      return { ok: true, removed: args.slug };
    }

    await updateItemQuantity(item.id, args.quantity);
    return { ok: true, updated: { slug: args.slug, quantity: args.quantity } };
  },
});

// ── cart.remove ─────────────────────────────────────────────────────────────

export const removeFromCart = defineTool({
  name: "cart.remove",
  description: "Remove a product from the cart.",
  scope: "cart:write",
  input: removeInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart) throw new Error("Cart is empty");
    const item = cart.items.find((i) => i.product.slug === args.slug);
    if (!item) throw new Error(`'${args.slug}' is not in the cart`);
    await removeItem(item.id);
    return { ok: true, removed: args.slug };
  },
});

// ── cart.get_summary ────────────────────────────────────────────────────────

export const getCartSummary = defineTool({
  name: "cart.get_summary",
  description:
    "Get the current cart: items (slug, name, quantity, price), subtotal, shipping, and total. The AI should call this before suggesting checkout or giving price estimates.",
  scope: "cart:write",
  input: z.object({}),
  skipAudit: true,
  handler: async () => {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) {
      return {
        empty: true,
        items: [],
        subtotalDkk: 0,
        shippingDkk: 0,
        totalDkk: 0,
        itemCount: 0,
      };
    }

    const lines = cart.items.map((i) => ({
      slug: i.product.slug,
      name: i.product.name,
      quantity: i.quantity,
      unitPriceDkk: i.product.priceDkk,
      lineTotalDkk: i.product.priceDkk * i.quantity,
      firstImage: resolveProductImageUrls(i.product)[0] ?? null,
    }));

    const breakdown = calcPriceBreakdown(
      lines.map((l) => ({ unitPriceDkk: l.unitPriceDkk, quantity: l.quantity })),
      null,
    );

    return {
      empty: false,
      items: lines,
      ...breakdown,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    };
  },
});

// ── discounts.try_apply (read-only preview) ─────────────────────────────────

export const tryApplyDiscount = defineTool({
  name: "discounts.try_apply",
  description:
    "Validate a discount code against the current cart without applying it. Returns a new total if the code is valid, or an error message. The AI can use this to show the customer their savings.",
  scope: "cart:write",
  input: tryDiscountInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty. Add something before trying a discount code");
    }

    const code = await prisma.discountCode.findUnique({
      where: { code: args.code.trim().toUpperCase() },
    });
    // Narrow Prisma's `string` type til union ("percent"|"fixed") som
    // validateDiscountCode kræver. DB-laget kan i princippet have andre
    // værdier; her behandler vi dem som ugyldige (ikke ok).
    const typedCode =
      code && (code.type === "percent" || code.type === "fixed")
        ? { ...code, type: code.type as "percent" | "fixed" }
        : null;
    const validation = validateDiscountCode(typedCode, new Date());
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }

    const lines = cart.items.map((i) => ({
      unitPriceDkk: i.product.priceDkk,
      quantity: i.quantity,
    }));
    const withoutDiscount = calcPriceBreakdown(lines, null);
    const withDiscount = calcPriceBreakdown(lines, {
      type: validation.type,
      value: validation.value,
    });

    return {
      ok: true,
      code: code!.code,
      savingsOere: withoutDiscount.totalDkk - withDiscount.totalDkk,
      newTotalOere: withDiscount.totalDkk,
      shippingOere: withDiscount.shippingDkk,
    };
  },
});

// ── customer.lookup_by_phone (Phase 4 — mobil-lookup) ────────────────────

const lookupByPhoneInput = z.object({
  phone: z.string().min(8).max(20),
});

/**
 * Normaliser DK-mobil til konsistent format. Accepterer:
 *  - "+45 28 83 36 90" → "+4528833690"
 *  - "28833690" → "+4528833690" (DK-default)
 *  - "+4528833690" → "+4528833690"
 */
function normalizeDkPhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-()]/g, "");
  if (/^\+\d{8,15}$/.test(stripped)) return stripped;
  if (/^\d{8}$/.test(stripped)) return `+45${stripped}`;
  if (/^00\d{8,13}$/.test(stripped)) return `+${stripped.slice(2)}`;
  return null;
}

export const lookupByPhoneTool = defineTool({
  name: "customer.lookup_by_phone",
  description:
    "Look up whether the customer has shopped with us before based on mobile number. Returns the same shape as customer.lookup_by_email, with no order history. Use when the customer provides a phone number to offer a saved address from their latest purchase. There is no external lookup service; this only works for returning customers.",
  scope: "customer:read",
  input: lookupByPhoneInput,
  handler: async (args, ctx) => {
    const actorMatch = /^storefront-chat:(.+)$/.exec(ctx.actor);
    const sid = actorMatch?.[1] ?? "anon";

    if (!bumpLookupCount(sid)) {
      return {
        error:
          "Too many lookups in this session. Continue with manual fields.",
        rateLimited: true,
      };
    }

    const normalized = normalizeDkPhone(args.phone);
    if (!normalized) {
      return {
        error:
          "That does not look like a valid mobile number.",
        invalidFormat: true,
      };
    }

    const [latestOrder, orderCount, user] = await Promise.all([
      prisma.order.findFirst({
        where: { phoneNumber: normalized },
        orderBy: { createdAt: "desc" },
        select: {
          email: true,
          shippingName: true,
          shippingAddress: true,
          shippingZip: true,
          shippingCity: true,
        },
      }),
      prisma.order.count({ where: { phoneNumber: normalized } }),
      prisma.user.findFirst({
        where: { phoneNumber: normalized },
        select: { id: true },
      }),
    ]);

    return {
      hasOrders: orderCount > 0,
      orderCount,
      isRegisteredUser: !!user,
      email: latestOrder?.email ?? null, // AI kan tilbyde at sende kvittering til samme email
      lastShipping: latestOrder
        ? {
            name: latestOrder.shippingName,
            address: latestOrder.shippingAddress,
            zip: latestOrder.shippingZip,
            city: latestOrder.shippingCity,
          }
        : null,
    };
  },
});

// ── customer.lookup_by_email ────────────────────────────────────────────────

export const lookupByEmailTool = defineTool({
  name: "customer.lookup_by_email",
  description:
    "Look up whether the customer has shopped with us before based on email. Returns only anonymized info: {hasOrders, lastShipping?, orderCount, isRegisteredUser}, with no order history or phone number. Use this early in checkout to offer returning customers a saved address.",
  scope: "customer:read",
  input: lookupByEmailInput,
  handler: async (args, ctx) => {
    const actorMatch = /^storefront-chat:(.+)$/.exec(ctx.actor);
    const sid = actorMatch?.[1] ?? "anon";

    if (!bumpLookupCount(sid)) {
      return {
        error:
          "Too many lookups in this session. Continue with manual fields.",
        rateLimited: true,
      };
    }

    const email = args.email.toLowerCase().trim();

    const [latestOrder, orderCount, user] = await Promise.all([
      prisma.order.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
        select: {
          shippingName: true,
          shippingAddress: true,
          shippingZip: true,
          shippingCity: true,
        },
      }),
      prisma.order.count({ where: { email } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    return {
      hasOrders: orderCount > 0,
      orderCount,
      isRegisteredUser: !!user,
      lastShipping: latestOrder
        ? {
            name: latestOrder.shippingName,
            address: latestOrder.shippingAddress,
            zip: latestOrder.shippingZip,
            city: latestOrder.shippingCity,
          }
        : null,
    };
  },
});

// ── orders.create ───────────────────────────────────────────────────────────

// Wrapper-schema der tilføjer rememberAddress til den eksisterende
// checkoutSchema. checkoutSchema selv bevares uændret fordi den OGSÅ
// bruges af form-checkout server-action (lib/validation.ts).
const createOrderToolInput = checkoutSchema.extend({
  rememberAddress: z.boolean().optional().default(false),
});

export const createOrderTool = defineTool({
  name: "orders.create",
  description:
    "Create an order from the customer's current cart with shipping details. Call only after confirming all fields with the customer in one combined summary. The server always returns requiresConfirmation first; the customer clicks 'Buy now' in the PlanCard. You must never self-confirm. Set rememberAddress: true only if the customer explicitly asked to remember the address for next time; default is false.",
  scope: "orders:write",
  input: createOrderToolInput,
  examples: [
    {
      name: "Create a checkout session",
      body: {
        email: "test@example.com",
        phoneNumber: "+4512345678",
        shippingName: "Test Person",
        shippingAddress: "Testvej 1",
        shippingZip: "1000",
        shippingCity: "København",
        rememberAddress: false
      }
    }
  ],
  handler: async (args, ctx) => {
    const { rememberAddress, ...orderInput } = args;
    const result = await createOrder(orderInput, { actor: ctx.actor });
    if (!result.ok) {
      return { ok: false, error: result.error, code: result.code };
    }
    // Stripe-mode: returnér clientSecret + publishableKey så frontend kan
    // rendere Stripe Payment Element. Mock-mode: kun base-felter.
    const base = {
      ok: true as const,
      orderId: result.orderId,
      totalDkk: result.totalDkk,
      paymentMode: result.paymentMode,
      // Route bruger disse til at sætte last_shipping cookie (kun hvis
      // rememberAddress: true). AI ser dem bare som metadata.
      rememberAddress: !!rememberAddress,
      shippingSnapshot: rememberAddress
        ? {
            name: orderInput.shippingName,
            address: orderInput.shippingAddress,
            zip: orderInput.shippingZip,
            city: orderInput.shippingCity,
          }
        : null,
    };
    if (result.paymentMode === "stripe") {
      return {
        ...base,
        paymentIntentClientSecret: result.paymentIntentClientSecret,
        publishableKey: result.publishableKey,
      };
    }
    return base;
  },
});

// ── user.get_last_shipping ──────────────────────────────────────────────────

export const getLastShippingTool = defineTool({
  name: "user.get_last_shipping",
  description:
    "Get the customer's latest delivery address. Returns source='session' if the customer is logged in, source='cookie' if the customer is not logged in but has a remember-address cookie, or source='none' if nothing is saved. Use this at checkout start to avoid asking for the address again.",
  scope: "customer:read",
  input: z.object({}),
  skipAudit: true, // read-only, ingen mutation
  handler: async (_args, ctx) => {
    // 1. Hvis logget ind: hent fra User
    if (ctx.userId) {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: {
          shippingName: true,
          shippingAddress: true,
          shippingZip: true,
          shippingCity: true,
        },
      });
      if (
        user?.shippingName &&
        user.shippingAddress &&
        user.shippingZip &&
        user.shippingCity
      ) {
        return {
          source: "session" as const,
          shipping: {
            name: user.shippingName,
            address: user.shippingAddress,
            zip: user.shippingZip,
            city: user.shippingCity,
          },
        };
      }
    }

    // 2. Ellers: prøv last_shipping-cookie (krypteret, sat efter ordre med
    //    rememberAddress: true)
    const cookieValue = ctx.cookies?.get(SHIPPING_COOKIE_NAME);
    const decoded = decodeShippingCookie(cookieValue);
    if (decoded) {
      return {
        source: "cookie" as const,
        shipping: {
          name: decoded.name,
          address: decoded.address,
          zip: decoded.zip,
          city: decoded.city,
        },
        storedAt: decoded.storedAt,
      };
    }

    return { source: "none" as const };
  },
});

export const customerTools = [
  addToCart,
  updateCartQuantity,
  removeFromCart,
  getCartSummary,
  tryApplyDiscount,
  lookupByEmailTool,
  lookupByPhoneTool,
  createOrderTool,
  getLastShippingTool,
];
