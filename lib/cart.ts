import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// SINGLE SOURCE OF TRUTH for cart-session cookie. Phase 4 bug-fix: før
// hed denne "kurv_session" mens chat-route læste/skrev "cart_session" →
// AI bekræftede ordrer fra én session-id mens server læste kurv fra anden.
// LEGACY_COOKIE_NAME læses som fallback for kunder der havde cookie sat
// før migrationen — efter første request migreres de til cart_session.
export const COOKIE_NAME = "cart_session";
const LEGACY_COOKIE_NAME = "kurv_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Read-only: returns the current session id from the cookie, or null if absent.
 * Læser cart_session først, fallback til legacy kurv_session.
 */
export async function getCartSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return (
    cookieStore.get(COOKIE_NAME)?.value ??
    cookieStore.get(LEGACY_COOKIE_NAME)?.value ??
    null
  );
}

// ---------------------------------------------------------------------------
// Cart accessors
// ---------------------------------------------------------------------------

/**
 * Read-only: returns the cart (with items + products) for the current user
 * (if logged in) or the current session cookie (guest fallback), or null if
 * there is no cart.
 * Never sets a cookie or creates a row.
 */
export async function getCart() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    // Logged-in user: look up by userId (no @unique — use findFirst).
    const cart = await prisma.cart.findFirst({
      where: { userId },
      include: {
        items: {
          orderBy: { id: "asc" },
          include: { product: true, variant: true },
        },
      },
    });
    return cart ?? null;
  }

  // Guest fallback: use the session cookie.
  const sessionId = await getCartSessionId();
  if (!sessionId) return null;

  const cart = await prisma.cart.findUnique({
    where: { sessionId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: { product: true, variant: true },
      },
    },
  });

  return cart ?? null;
}

/**
 * Read-write: ensures a Cart row exists for the current user (if logged in)
 * or the current session cookie (guest fallback).
 * Sets the cookie (requires Server Action / Route Handler context) when
 * no guest session exists yet.
 * Returns the cart with items + products.
 */
export async function getOrCreateCart() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    // Logged-in user: find or create a cart keyed on userId.
    let cart = await prisma.cart.findFirst({
      where: { userId },
      include: {
        items: {
          orderBy: { id: "asc" },
          include: { product: true, variant: true },
        },
      },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: {
          items: {
            orderBy: { id: "asc" },
            include: { product: true, variant: true },
          },
        },
      });
    }

    return cart;
  }

  // Guest fallback: use the session cookie. Læs cart_session FØRST, fall
  // tilbage til legacy kurv_session. Hvis kun legacy findes → migrér ved
  // også at sætte cart_session (begge eksisterer indtil legacy expirer).
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(COOKIE_NAME)?.value;
  const legacySessionId = cookieStore.get(LEGACY_COOKIE_NAME)?.value;

  if (!sessionId && legacySessionId) {
    // Legacy migration: brug legacy-værdien, men set også cart_session så
    // chat-route + nye writes kan finde den. Legacy-cookien expirer naturligt.
    sessionId = legacySessionId;
    cookieStore.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } else if (!sessionId) {
    // No cookie at all — generate a new session id and set the cookie.
    sessionId = crypto.randomUUID();
    cookieStore.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  // Try to find an existing cart for this session.
  let cart = await prisma.cart.findUnique({
    where: { sessionId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: { product: true, variant: true },
      },
    },
  });

  if (!cart) {
    // Edge case: cookie present but no row (e.g. DB was wiped). Create the row.
    cart = await prisma.cart.create({
      data: { sessionId },
      include: {
        items: {
          orderBy: { id: "asc" },
          include: { product: true, variant: true },
        },
      },
    });
  }

  return cart;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Add a product to the cart (or increment its quantity if already present).
 *
 * Task B variant-aware: variantId? — null/undefined betyder "produkt uden variant"
 * (eksisterende adfærd). Hvis sat, valideres at varianten tilhører produktet og
 * cart-row identificeres af (cart, product, variant)-triplet så samme produkt
 * kan have flere varianter i kurven.
 */
export async function addItem(
  productId: string,
  quantity = 1,
  variantId: string | null = null,
): Promise<void> {
  const cart = await getOrCreateCart();

  // Hvis variantId er sat: verificer at varianten tilhører produktet (anti-spoofing
  // — en angriber kunne ellers tilføje en billig variant af et dyrt produkt).
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });
    if (!variant || variant.productId !== productId) {
      throw new Error("Variant tilhører ikke det angivne produkt");
    }
  }

  // SQLite + Prisma quirk: composite-unique accepterer kun ikke-null værdier i
  // upsert-where, og SQLite's UNIQUE-constraint behandler NULL som distinct.
  // Vi splitter derfor: variant-rows kan bruge upsert (variantId er en konkret
  // string), null-variant-rows bruger findFirst+update-or-create pattern så vi
  // konsistent får én row pr. (cart, product) for non-variant produkter.
  if (variantId) {
    await prisma.cartItem.upsert({
      where: {
        cartId_productId_variantId: {
          cartId: cart.id,
          productId,
          variantId,
        },
      },
      create: { cartId: cart.id, productId, variantId, quantity },
      update: { quantity: { increment: quantity } },
    });
  } else {
    const existing = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId, variantId: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity },
      });
    }
  }
}

/**
 * Set the quantity of a specific cart item. Pass quantity <= 0 to delete it.
 * No-ops silently if the item doesn't belong to the current session's cart.
 */
export async function updateItemQuantity(
  cartItemId: string,
  quantity: number
): Promise<void> {
  const cart = await getCart();
  if (!cart) return;

  const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
  if (!item || item.cartId !== cart.id) return; // ownership mismatch — no-op

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: cartItemId } });
  } else {
    await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
  }
}

/**
 * Remove a cart item. No-ops silently if the item doesn't belong to the
 * current session's cart.
 */
export async function removeItem(cartItemId: string): Promise<void> {
  const cart = await getCart();
  if (!cart) return;

  const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
  if (!item || item.cartId !== cart.id) return; // ownership mismatch — no-op

  await prisma.cartItem.delete({ where: { id: cartItemId } });
}

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

/**
 * Read-only: returns the total number of items (sum of quantities) in the
 * current cart, or 0 if there is no cart.
 */
export async function getCartCount(): Promise<number> {
  const cart = await getCart();
  if (!cart) return 0;

  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

// ---------------------------------------------------------------------------
// Guest-cart merge
// ---------------------------------------------------------------------------

/**
 * Merge the guest (session-cookie) cart into the given user's cart.
 * Called during the sign-in event; must not throw — errors are caught and
 * logged so they never break the login flow.
 */
export async function mergeGuestCartIntoUser(userId: string): Promise<void> {
  try {
    // Read the guest session id from the cookie.
    const sessionId = await getCartSessionId();
    if (!sessionId) return;

    // Find the guest cart.
    const guestCart = await prisma.cart.findUnique({
      where: { sessionId },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) return;

    // Find or create the user's cart.
    let userCart = await prisma.cart.findFirst({ where: { userId } });
    if (!userCart) {
      userCart = await prisma.cart.create({ data: { userId } });
    }

    // Edge case: guest cart and user cart are the same row (shouldn't happen).
    if (guestCart.id === userCart.id) return;

    // Merge each guest item into the user's cart. Samme NULL-vs-konkret split
    // som addItem() — upsert kun for variant-rows (composite-unique kræver
    // ikke-null), manuel find-or-create for non-variant rows.
    for (const item of guestCart.items) {
      if (item.variantId) {
        await prisma.cartItem.upsert({
          where: {
            cartId_productId_variantId: {
              cartId: userCart.id,
              productId: item.productId,
              variantId: item.variantId,
            },
          },
          create: {
            cartId: userCart.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });
      } else {
        const existing = await prisma.cartItem.findFirst({
          where: {
            cartId: userCart.id,
            productId: item.productId,
            variantId: null,
          },
          select: { id: true },
        });
        if (existing) {
          await prisma.cartItem.update({
            where: { id: existing.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await prisma.cartItem.create({
            data: {
              cartId: userCart.id,
              productId: item.productId,
              quantity: item.quantity,
            },
          });
        }
      }
    }

    // Clean up the guest cart's items (and optionally the cart row itself).
    await prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } });
    // Optionally delete the now-empty guest Cart row to keep the DB tidy.
    await prisma.cart.delete({ where: { id: guestCart.id } });
  } catch (err) {
    console.error("[mergeGuestCartIntoUser] Failed to merge guest cart:", err);
  }
}
