"use client";

import { useEffect } from "react";
import { getCartSummaryAction } from "@/app/[locale]/cart/actions";
import { isSameOriginPath } from "@/lib/safe-path";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";

/**
 * WebMCP staging-eksperiment (brand.features.webMcp, default-off, IKKE på
 * canary-mosaikken). Eksponerer storefrontens SITE-WIDE handlinger som
 * browser-native "tools" til in-browser AI-agenter — den klient-side analog
 * til Cartwrights server-side MCP (/api/mcp). Per modern-web-guidance
 * (webmcp/agentic-javascript-tools).
 *
 * Detektion + registrering deles med per-side-mounts og diagnose-siden via
 * lib/model-context.ts (dræbte den duplikerede namespace-detektion, og
 * awaiter registreringerne — draft'en returnerer en promise). WebMCP har
 * ingen unregisterTool(): cleanup sker ved at abort'e signalet.
 *
 * Kontekst-tools (add-to-cart for DET produkt en side viser, update/remove
 * på kurvsiden) registreres af per-side-mounts (components/webmcp/*) på
 * deres egne sider, IKKE her — per-route-registrering som guidancen kræver.
 * En agent andre steder navigerer til siden først, som et menneske; en
 * `toolchange`-lytter ser det nye tool dukke op.
 *
 * PROFIL-NOTE: CLI'ens light-profil linje-filtrerer layoutet på strengen
 * "WebMcpRegistrar" — omdøb aldrig komponenten, og hold mount + import på
 * én linje hver.
 */

/**
 * Moat-binding: hvert WebMCP-tool mapper til de CUSTOMER_TOOL_ALLOWLIST-
 * operationer det svarer til (lib/ai/client.ts). Rene navigations-tools
 * binder til [] — de udfører ingen dataoperation. To tests lukker cirklen:
 * tests/unit/webmcp-moat.test.ts håndhæver at alle bundne operationer er
 * kunde-sikre (og inden for products./cart.-familierne), og
 * tests/unit/webmcp-registrar.test.tsx at de REGISTREREDE navne === disse
 * nøgler — så et tool uden for kurv/katalog-fladen ikke kan tilføjes ubemærket.
 */
export const WEBMCP_TOOL_BINDINGS = {
  search_products: ["products.search"],
  get_cart: ["cart.get_summary"],
  navigate: [],
} as const;

function buildGlobalTools(): WebMcpToolDescriptor[] {
  return [
    {
      name: "search_products",
      description:
        "Search this store's product catalogue by free text and return matching products (id, title, price with currency, url, stock).",
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
    {
      name: "get_cart",
      description:
        "Read the current shopping cart: line items with ids (usable for updates), quantities, per-line and total prices with currency, and stock ceilings.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        try {
          return await getCartSummaryAction();
        } catch {
          return { error: "Reading the cart failed — the store had a temporary error." };
        }
      },
      annotations: { readOnlyHint: true },
    },
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
  ];
}

export default function WebMcpRegistrar() {
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return; // ingen WebMCP-support → no-op (alle ikke-Chrome-browsere)

    const controller = new AbortController();
    void registerWebMcpTools(resolved.context, buildGlobalTools(), controller.signal);
    return () => controller.abort();
  }, []);

  return null;
}
