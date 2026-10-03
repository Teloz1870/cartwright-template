"use client";

import { useEffect } from "react";
import { removeCartItemAction, updateCartItemAction } from "@/app/[locale]/cart/actions";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";

/**
 * Kurvsidens kontekstuelle WebMCP-tools: ret antal, fjern en linje, og
 * naviger til checkout-OVERBLIKKET (aldrig et ordre-afgivende tool — det er
 * moat-grænsen; go_to_checkout åbner kun siden hvor MENNESKET gennemfører).
 * Beskrivelserne opremser de aktuelle linjer med deres cartItemId'er, så
 * agenten kan handle uden et get_cart-opslag først.
 *
 * Navne er globalt unikke på tværs af registraren og PDP-mountet. Egen
 * AbortController; effect-dep = den serialiserede item-liste, så hver
 * RSC-refresh efter en mutation re-registrerer med friske id'er/antal.
 */

export type CartToolItem = {
  cartItemId: string;
  productName: string;
  quantity: number;
  maxQuantity: number;
};

/** Moat-binding — samme kontrakt som registrarens WEBMCP_TOOL_BINDINGS. */
export const CART_WEBMCP_TOOL_BINDINGS = {
  update_cart_item_quantity: ["cart.update_quantity"],
  remove_cart_item: ["cart.remove"],
  go_to_checkout: [],
} as const;

function lineList(items: CartToolItem[]): string {
  return items
    .map((i) => `${i.cartItemId} — "${i.productName}" × ${i.quantity} (max ${i.maxQuantity})`)
    .join("; ");
}

function buildCartTools(items: CartToolItem[]): WebMcpToolDescriptor[] {
  return [
    {
      name: "update_cart_item_quantity",
      description: `Change the quantity of a line in the shopping cart. Current lines: ${lineList(items)}. Returns the updated cart so the result can be verified.`,
      inputSchema: {
        type: "object",
        properties: {
          cartItemId: {
            type: "string",
            // The valid set is known at registration time — close the
            // free-string gap. Re-registration on every RSC refresh keeps
            // the enum as fresh as the prose line list.
            ...(items.length > 0 ? { enum: items.map((i) => i.cartItemId) } : {}),
            description: "The cart line to change — an id from this tool's description or from get_cart.",
          },
          quantity: {
            type: "integer",
            description: "New quantity (1–99).",
            minimum: 1,
            maximum: 99,
          },
        },
        required: ["cartItemId", "quantity"],
      },
      async execute(input) {
        const cartItemId = String(input.cartItemId ?? "");
        // Single-function tool (Chrome best practices: fewer, non-overlapping
        // tools): removal is remove_cart_item's whole job, so quantity 0 is
        // rejected rather than quietly duplicating it. Coercion stays
        // forbidden — Number(null|false|"") are all 0, and a malformed call
        // must never mutate anything.
        const quantity = input.quantity;
        if (quantity === 0) {
          return { error: "To remove a line, use remove_cart_item." };
        }
        if (
          typeof quantity !== "number" ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 99
        ) {
          return { error: "quantity must be an integer between 1 and 99." };
        }
        try {
          const result = await updateCartItemAction(cartItemId, quantity);
          if (!result.ok) return { error: result.error };
          const line = result.cart?.items.find((i) => i.cartItemId === cartItemId);
          const stockWarning =
            line && line.quantity > line.maxQuantity
              ? `Line now holds ${line.quantity} of "${line.productName}" but only ${line.maxQuantity} are in stock — checkout will reject the excess.`
              : undefined;
          return {
            status: "updated",
            cartItemId,
            quantity,
            ...(stockWarning ? { stockWarning } : {}),
            cart: result.cart,
          };
        } catch {
          return {
            error:
              "Updating the cart failed — the store had a temporary error. Call get_cart to see the current state.",
          };
        }
      },
    },
    {
      name: "remove_cart_item",
      description: `Remove a line from the shopping cart. Current lines: ${lineList(items)}. Returns what was removed and the updated cart.`,
      inputSchema: {
        type: "object",
        properties: {
          cartItemId: {
            type: "string",
            ...(items.length > 0 ? { enum: items.map((i) => i.cartItemId) } : {}),
            description: "The cart line to remove — an id from this tool's description or from get_cart.",
          },
        },
        required: ["cartItemId"],
      },
      async execute(input) {
        const cartItemId = String(input.cartItemId ?? "");
        try {
          const result = await removeCartItemAction(cartItemId);
          if (!result.ok) return { error: result.error };
          return { status: "removed", removed: result.removed, cart: result.cart };
        } catch {
          return {
            error:
              "Removing the item failed — the store had a temporary error. Call get_cart to see the current state.",
          };
        }
      },
    },
    {
      name: "go_to_checkout",
      description:
        "Open the checkout page where the human reviews shipping and payment and places the order themselves — ordering stays with the human.",
      inputSchema: { type: "object", properties: {} },
      execute() {
        // Canonical, locale-prefixed path: the cart page's own URL carries
        // the locale as its first segment (/en/cart), so reuse it — the
        // unprefixed form 307s through the i18n middleware and hands the
        // agent a non-canonical path.
        const seg = (window.location.pathname ?? "").split("/")[1];
        const path = seg ? `/${seg}/checkout` : "/checkout";
        window.location.assign(path);
        return { status: "navigating", path };
      },
    },
  ];
}

export default function CartWebMcpTools({ items }: { items: CartToolItem[] }) {
  const itemsKey = JSON.stringify(items);
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return;
    const controller = new AbortController();
    void registerWebMcpTools(
      resolved.context,
      buildCartTools(JSON.parse(itemsKey) as CartToolItem[]),
      controller.signal,
    );
    return () => controller.abort();
  }, [itemsKey]);

  return null;
}
