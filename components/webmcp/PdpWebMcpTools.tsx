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
  /**
   * Flat product specifications, already narrowed and localised by the server
   * mount. They travel in the tool DESCRIPTION rather than a tool of their own:
   * a new tool name would have to be added to the moat consts and their
   * exact-equality tests, and the agent does not need a round trip to read six
   * facts that fit in one sentence.
   */
  specs?: Record<string, string>;
  variants: { id: string; label: string; priceFormatted: string; stock: number }[];
};

/** Moat-binding — samme kontrakt som WEBMCP_TOOL_BINDINGS i registraren. */
export const PDP_WEBMCP_TOOL_BINDINGS = {
  add_current_product_to_cart: ["cart.add"],
} as const;

/**
 * Natural-language variant values (Chrome best-practices: `variant: "Whole
 * beans, 250 g"`, not an internal id). Labels are the human option text; if
 * two variants share a label the price disambiguates. Internal ids are still
 * ACCEPTED at execute time (lenient input), but the schema teaches values a
 * human would recognise.
 */
function variantOptions(product: PdpToolProduct) {
  const labelCounts = new Map<string, number>();
  for (const v of product.variants) {
    labelCounts.set(v.label, (labelCounts.get(v.label) ?? 0) + 1);
  }
  return product.variants.map((v) => ({
    value:
      (labelCounts.get(v.label) ?? 0) > 1 ? `${v.label} (${v.priceFormatted})` : v.label,
    variant: v,
  }));
}

function buildPdpTools(product: PdpToolProduct): WebMcpToolDescriptor[] {
  const options = variantOptions(product);
  const variantLines = options
    .map((o) => `"${o.value}" — ${o.variant.priceFormatted} — ${o.variant.stock} in stock`)
    .join("; ");
  const description = [
    `Add "${product.name}" (${product.priceFormatted}) — the product on this page — to the shopping cart.`,
    product.variants.length > 0
      ? `This product has variants; pass one as \`variant\`. Options: ${variantLines}.`
      : null,
    product.specs && Object.keys(product.specs).length > 0
      ? `Specifications: ${Object.entries(product.specs)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ")}.`
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
          // The variant property exists only when the product has variants —
          // a parameter the agent must not use should not be in the schema.
          ...(product.variants.length > 0
            ? {
                variant: {
                  type: "string",
                  enum: options.map((o) => o.value),
                  description: "Which variant to add, by its option name.",
                },
              }
            : {}),
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
        ...(product.variants.length > 0 ? { required: ["variant"] } : {}),
      },
      async execute(input) {
        const requested =
          typeof input.variant === "string" && input.variant.length > 0
            ? input.variant
            : typeof input.variantId === "string" && input.variantId.length > 0
              ? input.variantId
              : null;
        // Et variantprodukt UDEN variantvalg ville blive en basepris-linje
        // (checkout opkræver produktpris og trækker produkt-lager i stedet
        // for variantens) — serveren afviser kun FORKERT ownership, ikke
        // manglende valg, så kravet håndhæves her hvor variantlisten bor.
        let variantId: string | null = null;
        if (product.variants.length > 0) {
          if (!requested) {
            return {
              error: `This product has variants — pass \`variant\`. Options: ${options
                .map((o) => `"${o.value}"`)
                .join(", ")}.`,
            };
          }
          // Natural-language value first (the schema's enum); raw internal
          // ids and bare labels stay accepted for lenient input handling.
          const match =
            options.find((o) => o.value === requested) ??
            options.find((o) => o.variant.label === requested) ??
            options.find((o) => o.variant.id === requested);
          if (!match) {
            return {
              error: `Unknown variant "${requested}" — the options are listed in this tool's description.`,
            };
          }
          variantId = match.variant.id;
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
          // Transport-level failure AFTER the request left the page: the
          // outcome is genuinely unknown, so say that — a blind retry after a
          // lost response double-adds the line.
          return {
            error:
              "The add may or may not have gone through — the store had an error mid-request. Call get_cart to check the current cart before retrying.",
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
