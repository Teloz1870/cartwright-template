"use client";

import { useEffect } from "react";
import { addToCartAction, getCartSummaryAction } from "@/app/[locale]/cart/actions";
import { isSameOriginPath } from "@/lib/webmcp/paths";

/**
 * WebMCP staging-eksperiment (brand.features.webMcp, default-off, IKKE på
 * canary-mosaikken). Eksponerer et lille sæt storefront-handlinger som
 * browser-native "tools" til in-browser AI-agenter — den klient-side analog
 * til Cartwrights server-side MCP (/api/mcp). Per modern-web-guidance
 * (webmcp/agentic-javascript-tools).
 *
 * UMODEN MED VILJE: WebMCP er W3C-draft + Chrome-only origin-trial, og API-
 * namespacet skifter (navigator.modelContext → document.modelContext,
 * deprecated i Chrome 150). Vi feature-detekterer BEGGE (foretrækker document),
 * og gør intet hvis ingen findes — så build/SSR + alle andre browsere er
 * upåvirkede. Renderer null. Verificér lokalt i Chrome via
 * chrome://flags/#enable-webmcp-testing (origin-trial-token kræves ikke i
 * flag-stien). Til en ægte origin-trial: server tokenet som `Origin-Trial`
 * HTTP-header / <meta http-equiv> i document-head ved parse-tid.
 */

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  annotations?: { readOnlyHint?: boolean };
};

type ModelContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => void;
};

function resolveModelContext(): ModelContext | null {
  if (typeof window === "undefined") return null;
  // Foretræk det nuværende namespace (document.modelContext); fald tilbage til
  // det deprecated navigator.modelContext for tidlige Chrome-builds.
  const fromDocument = (document as unknown as { modelContext?: ModelContext })
    .modelContext;
  const fromNavigator = (navigator as unknown as { modelContext?: ModelContext })
    .modelContext;
  const mc = fromDocument ?? fromNavigator;
  return mc && typeof mc.registerTool === "function" ? mc : null;
}

export default function WebMcpRegistrar() {
  useEffect(() => {
    const mc = resolveModelContext();
    if (!mc) return; // ingen WebMCP-support → no-op (alle ikke-Chrome-browsere)

    // WebMCP har ingen unregisterTool(): cleanup sker ved at abort'e signalet.
    const controller = new AbortController();

    mc.registerTool(
      {
        name: "search_products",
        description:
          "Search this store's product catalogue by free text and return matching products (name, price, slug, stock).",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Free-text search, e.g. 'sunglasses' or 'oak table'.",
            },
            limit: {
              type: "number",
              description: "Max results to return (1–50). Defaults to 10.",
            },
          },
          required: ["query"],
        },
        async execute(input) {
          const query = String(input.query ?? "");
          const limit = Math.min(Math.max(Number(input.limit ?? 10) || 10, 1), 50);
          const res = await fetch(
            `/api/products/search?q=${encodeURIComponent(query)}&limit=${limit}`,
          );
          if (!res.ok) {
            return { error: `Search failed (HTTP ${res.status}).` };
          }
          return await res.json();
        },
        annotations: { readOnlyHint: true },
      },
      { signal: controller.signal },
    );

    mc.registerTool(
      {
        name: "add_to_cart",
        description:
          "Add a product (optionally a specific variant) to the shopping cart. Reversible — the user can remove it from the cart page.",
        inputSchema: {
          type: "object",
          properties: {
            productId: {
              type: "string",
              description: "The product id to add (from search_products).",
            },
            variantId: {
              type: "string",
              description: "Optional variant id, when the product has variants.",
            },
          },
          required: ["productId"],
        },
        async execute(input) {
          const productId = String(input.productId ?? "");
          if (!productId) return { error: "productId is required." };
          const variantId =
            typeof input.variantId === "string" && input.variantId.length > 0
              ? input.variantId
              : null;
          // Genbruger den eksisterende server-action (samme sti som
          // AddToCartButton) — al validering + stock-logik lever serverside.
          await addToCartAction(productId, variantId);
          return { status: "added", productId, variantId };
        },
        // IKKE readOnly: muterer kurven. Add-to-cart er reversibelt + lav-risiko,
        // så det er ok uden manuel bekræftelse (modsat irreversible handlinger,
        // som modern-web-guidance fraråder at auto-submitte).
      },
      { signal: controller.signal },
    );

    mc.registerTool(
      {
        name: "get_cart",
        description:
          "Read the current shopping cart: line items, quantities, unit prices, and the item count.",
        inputSchema: { type: "object", properties: {} },
        async execute() {
          return await getCartSummaryAction();
        },
        annotations: { readOnlyHint: true },
      },
      { signal: controller.signal },
    );

    mc.registerTool(
      {
        name: "navigate",
        description:
          "Navigate the browser to an internal page on this store, e.g. '/produkter', '/produkter?q=oak', or '/product/<slug>'. Only same-origin paths are allowed.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "An internal path beginning with '/' (no external URLs).",
            },
          },
          required: ["path"],
        },
        execute(input) {
          const path = input.path;
          if (!isSameOriginPath(path)) {
            return { error: "Only internal same-origin paths (starting with '/') are allowed." };
          }
          window.location.assign(path);
          return { status: "navigating", path };
        },
      },
      { signal: controller.signal },
    );

    return () => controller.abort();
  }, []);

  return null;
}
