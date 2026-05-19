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
import { parseProductImages } from "@/lib/products";
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
  email: z.string().email("Ugyldig email"),
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
    "Læg et produkt i kurven (eller forøg mængden hvis det allerede ligger der). Identificér produktet ved slug. Default quantity = 1. Hvis produktet har varianter, kan en specifik variant tilføjes via variantSku.",
  scope: "cart:write",
  input: addToCartInput,
  skipAudit: true, // cart-ændringer er ikke admin-audit-værdige
  handler: async (args) => {
    const product = await prisma.product.findFirst({
      where: { slug: args.slug, deletedAt: null },
      select: { id: true, name: true, stock: true, priceDkk: true },
    });
    if (!product) throw new Error(`Produkt ikke fundet: ${args.slug}`);

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
          `Variant '${args.variantSku}' findes ikke for produkt '${args.slug}'`,
        );
      }
      variantId = variant.id;
      availableStock = variant.stock;
    }

    if (availableStock < args.quantity) {
      throw new Error(
        `Kun ${availableStock} på lager — kan ikke lægge ${args.quantity} i kurven`,
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
    "Sæt mængden af et produkt i kurven til en bestemt værdi. quantity=0 fjerner det.",
  scope: "cart:write",
  input: updateQuantityInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart) throw new Error("Kurv er tom");

    const item = cart.items.find((i) => i.product.slug === args.slug);
    if (!item) throw new Error(`'${args.slug}' er ikke i kurven`);

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
  description: "Fjern et produkt helt fra kurven.",
  scope: "cart:write",
  input: removeInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart) throw new Error("Kurv er tom");
    const item = cart.items.find((i) => i.product.slug === args.slug);
    if (!item) throw new Error(`'${args.slug}' er ikke i kurven`);
    await removeItem(item.id);
    return { ok: true, removed: args.slug };
  },
});

// ── cart.get_summary ────────────────────────────────────────────────────────

export const getCartSummary = defineTool({
  name: "cart.get_summary",
  description:
    "Hent nuværende kurv: items (slug, navn, mængde, pris), subtotal, fragt, total. AI'en bør kalde dette før den foreslår 'gå til betaling' eller giver pris-estimater.",
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
      firstImage: parseProductImages(i.product.images)[0] ?? null,
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
    "Validér en rabatkode mod nuværende kurv UDEN at binde den. Returnerer ny total hvis koden er gyldig, eller fejlbesked. AI'en kan bruge dette til at vise kunden hvad der spares.",
  scope: "cart:write",
  input: tryDiscountInput,
  skipAudit: true,
  handler: async (args) => {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) {
      throw new Error("Kurv er tom — læg noget i før du prøver en rabatkode");
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
    "Slå op om kunden har handlet hos os før, baseret på mobil-nummer. Returnerer samme shape som customer.lookup_by_email — INGEN ordre-historik. Brug når kunden skriver et telefonnummer (fx 'min mobil er 28833690') for at tilbyde gemt adresse fra deres seneste køb. Vi har INGEN ekstern lookup-service (Krak/Bisnode etc.) — dette virker KUN for returnerende kunder.",
  scope: "customer:read",
  input: lookupByPhoneInput,
  handler: async (args, ctx) => {
    const actorMatch = /^storefront-chat:(.+)$/.exec(ctx.actor);
    const sid = actorMatch?.[1] ?? "anon";

    if (!bumpLookupCount(sid)) {
      return {
        error:
          "For mange opslag i samme session. Prøv at fortsætte med manuelle felter.",
        rateLimited: true,
      };
    }

    const normalized = normalizeDkPhone(args.phone);
    if (!normalized) {
      return {
        error:
          "Det ligner ikke et dansk mobilnummer (8 cifre eller +45-prefix).",
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
    "Slå op om kunden har handlet hos os før, baseret på email. Returnerer kun anonymiseret info: {hasOrders, lastShipping?, orderCount, isRegisteredUser} — INGEN ordre-historik eller telefonnummer. Brug dette tidligt i checkout-flow for at tilbyde gemt adresse til returnerende kunder.",
  scope: "customer:read",
  input: lookupByEmailInput,
  handler: async (args, ctx) => {
    const actorMatch = /^storefront-chat:(.+)$/.exec(ctx.actor);
    const sid = actorMatch?.[1] ?? "anon";

    if (!bumpLookupCount(sid)) {
      return {
        error:
          "For mange opslag i samme session. Prøv at fortsætte med manuelle felter.",
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
    "Opret en ordre fra kundens nuværende kurv med shipping-detaljer. Kald KUN efter du har bekræftet alle felter med kunden i et samlet resumé. Server returnerer altid requiresConfirmation først — kunden klikker selv paa 'Køb nu' i PlanCard. Du maa ALDRIG selv-bekræfte. Sæt rememberAddress: true KUN hvis kunden eksplicit har sagt 'ja, husk adressen til næste gang' — defaulter til false.",
  scope: "orders:write",
  input: createOrderToolInput,
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
    "Hent kundens seneste leveringsadresse. Returnerer source='session' hvis kunden er logget ind (data fra User-profil), source='cookie' hvis ikke logget ind men har 'husk adresse'-cookie sat, eller source='none' hvis intet er gemt. Brug ved checkout-start for at undgå at spørge kunden om adresse igen.",
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
