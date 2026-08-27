"use client";

import { useEffect } from "react";
import { addToCartAction } from "@/app/[locale]/cart/actions";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";

/**
 * PDP-kontekstuelt WebMCP-tool: add-to-cart for DET produkt siden viser —
 * per-route-registrering som WebMCP-guidancen kræver, i stedet for et
 * globalt add_to_cart der skal fodres med id'er. Beskrivelsen bygges per
 * produkt (navn, pris, variantliste), så agenten kan handle uden først at
 * søge. Navnet er globalt unikt (dublet-adfærd er udefineret i spec'en) og
 * kan aldrig kollidere med registrarens site-wide tools.
 *
 * Egen AbortController pr. mount: React kører unmount-cleanup før næste
 * sides effects, så PDP→PDP-navigation abort'er de gamle tools før de nye
 * registreres — intet dublet-vindue. Effect-dep er den serialiserede
 * produkt-prop, så en revalidate med nye priser/lager re-registrerer.
 */

export type PdpToolProduct = {
  id: string;
  name: string;
  slug: string;
  inStock: boolean;
  priceFormatted: string;
  variants: { id: string; label: string; priceFormatted: string; stock: number }[];
};

/** Moat-binding — samme kontrakt som WEBMCP_TOOL_BINDINGS i registraren. */
export const PDP_WEBMCP_TOOL_BINDINGS = {
  add_current_product_to_cart: ["cart.add"],
} as const;

function buildPdpTools(product: PdpToolProduct): WebMcpToolDescriptor[] {
  const variantLines = product.variants
    .map((v) => `${v.id} — ${v.label} — ${v.priceFormatted} — ${v.stock} in stock`)
    .join("; ");
  const description = [
    `Add "${product.name}" (${product.priceFormatted}) — the product on this page — to the shopping cart.`,
    product.variants.length > 0
      ? `This product has variants; pass variantId. Variants: ${variantLines}.`
      : null,
    product.inStock ? null : "NOTE: this product is currently out of stock.",
    "Reversible — the user can remove it from the cart page. Returns the updated cart so the result can be verified.",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    {
      name: "add_current_product_to_cart",
      description,
      inputSchema: {
        type: "object",
        properties: {
          variantId: {
            type: "string",
            description:
              product.variants.length > 0
                ? "Which variant to add — an id from the variant list in this tool's description."
                : "Not needed — this product has no variants.",
          },
          quantity: {
            type: "integer",
            description: "How many to add (1–99). Defaults to 1.",
            minimum: 1,
            maximum: 99,
          },
        },
        // Schema-niveau-krav så planlæggere afviser FØR execute; execute
        // håndhæver det samme (skemaet er vejledende for agenten, ikke
        // en garanti).
        ...(product.variants.length > 0 ? { required: ["variantId"] } : {}),
      },
      async execute(input) {
        const variantId =
          typeof input.variantId === "string" && input.variantId.length > 0
            ? input.variantId
            : null;
        // Et variantprodukt UDEN variantId ville blive en basepris-linje
        // (checkout opkræver produktpris og trækker produkt-lager i stedet
        // for variantens) — serveren afviser kun FORKERT ownership, ikke
        // manglende valg, så kravet håndhæves her hvor variantlisten bor.
        if (product.variants.length > 0) {
          if (!variantId) {
            return {
              error: `This product has variants — pass variantId. Options: ${product.variants
                .map((v) => v.id)
                .join(", ")}.`,
            };
          }
          if (!product.variants.some((v) => v.id === variantId)) {
            return {
              error: `Unknown variantId "${variantId}" — the options are listed in this tool's description.`,
            };
          }
        }
        const quantity = Number(input.quantity ?? 1);
        // Agent-fladens eget vindue (serveren re-validerer): kurv-ACTIONEN
        // må ikke loft-begrænses (flag-off UI'en for lager > 99), men
        // AGENTEN skal.
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          return { error: "quantity must be an integer between 1 and 99." };
        }
        try {
          const result = await addToCartAction(product.id, variantId, quantity);
          if (!result.ok) return { error: result.error };
          const line = result.cart?.items.find(
            (i) => i.productId === product.id && i.variantId === variantId,
          );
          const stockWarning =
            line && line.quantity > line.maxQuantity
              ? `Cart now holds ${line.quantity} of "${line.productName}" but only ${line.maxQuantity} are in stock — checkout will reject the excess. Use update_cart_item_quantity on the cart page, or the cart page itself, to reduce it.`
              : undefined;
          return {
            status: "added",
            product: { id: product.id, name: product.name, slug: product.slug },
            variantId,
            quantity,
            ...(stockWarning ? { stockWarning } : {}),
            cart: result.cart,
          };
        } catch {
          return {
            error:
              "Adding to cart failed — the variant may not belong to this product, or the store had a temporary error.",
          };
        }
      },
    },
  ];
}

export default function PdpWebMcpTools({ product }: { product: PdpToolProduct }) {
  const productKey = JSON.stringify(product);
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return;
    const controller = new AbortController();
    void registerWebMcpTools(
      resolved.context,
      buildPdpTools(JSON.parse(productKey) as PdpToolProduct),
      controller.signal,
    );
    return () => controller.abort();
  }, [productKey]);

  return null;
}
