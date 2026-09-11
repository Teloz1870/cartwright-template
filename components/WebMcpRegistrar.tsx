"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

/**
 * The locale prefix of the page the agent is standing on.
 *
 * Two consumers, and they need it at DIFFERENT moments. `search_products`
 * reads it inside `execute`, so it is current by construction. The `navigate`
 * and `get_cart` DESCRIPTIONS, though, are plain strings baked when the
 * descriptor is built — a prefix captured there goes stale the moment the
 * shopper switches language client-side, and an agent following the example
 * verbatim would be sent back into the language they just left. That is why
 * the registrar re-registers on locale change (see the effect below) rather
 * than mounting once: the descriptions are rebuilt with the new prefix.
 *
 * Falls back to "" (an unprefixed path) rather than guessing a locale — an
 * unprefixed internal path still resolves, via one redirect.
 */
export function localeSegmentOf(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(segment) ? segment : "";
}

function localePrefix(): string {
  if (typeof window === "undefined") return "";
  const segment = localeSegmentOf(window.location.pathname);
  return segment ? `/${segment}` : "";
}

function buildGlobalTools(): WebMcpToolDescriptor[] {
  return [
    {
      name: "search_products",
      description:
        "Search this store's product catalogue by free text and return matching products (id, title, minor-unit price, formatted price, currency, url, stock). Returns results directly without changing the page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search, e.g. 'sunglasses' or 'oak table'.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Max results to return. Defaults to 10.",
          },
        },
        required: ["query"],
      },
      async execute(input) {
        const query = String(input.query ?? "");
        const limit = Math.min(Math.max(Number(input.limit ?? 10) || 10, 1), 50);
        try {
          // The locale travels with the request. Without it the route fell
          // back to the store-wide default, and an agent on /en was handed
          // /da/product/... links — which pulled the conversation into Danish.
          const locale = localePrefix().replace(/^\//, "");
          const res = await fetch(
            `/api/products/search?q=${encodeURIComponent(query)}&limit=${limit}` +
              (locale ? `&locale=${encodeURIComponent(locale)}` : ""),
          );
          if (!res.ok) {
            return { error: `Search failed (HTTP ${res.status}).` };
          }
          // Reduced, bounded rows — exactly the advertised shape. The REST
          // route serves other consumers and carries more (images, checkout
          // endpoint); the browser tool re-states only what it promises, so
          // nothing order-adjacent ever enters the in-browser surface.
          const data = (await res.json()) as {
            query?: string;
            resultsCount?: number;
            products?: Array<Record<string, unknown>>;
          };
          return {
            query: data.query ?? query,
            resultsCount: data.resultsCount ?? data.products?.length ?? 0,
            products: (data.products ?? []).map((p) => {
              const unitPrice =
                p.unitPrice && typeof p.unitPrice === "object"
                  ? (p.unitPrice as Record<string, unknown>)
                  : {};
              return {
              id: p.id,
              title: p.title,
              description:
                typeof p.description === "string" && p.description.length > 200
                  ? `${p.description.slice(0, 200)}…`
                  : p.description,
              price: unitPrice.amountMinor ?? p.price,
              formattedPrice: unitPrice.formatted,
              currency: unitPrice.currency ?? p.currency,
              url: p.url,
              inStock: p.inStock,
              };
            }),
          };
        } catch {
          return { error: "Search failed — the store had a temporary error." };
        }
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "get_cart",
      description:
        "Read the current shopping cart: line items with ids (usable with the cart page's update and remove tools — navigate to '" +
        `${localePrefix()}/cart` +
        "' to use them), quantities, per-line and total prices with currency, and stock ceilings.",
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
        // The example paths carry the CURRENT locale prefix. They used to be
        // unprefixed, so an agent on /en followed the example verbatim and
        // took a 307 into whatever the store-wide default was. Note the
        // segment itself stays `produkter` in every locale — that IS the
        // route (/en/products is a 404); only the prefix was missing.
        "Navigate the browser to an internal page on this store, e.g. '" +
        `${localePrefix()}/produkter` +
        "', '" +
        `${localePrefix()}/produkter?q=oak` +
        "', or '" +
        `${localePrefix()}/product/<slug>` +
        "'. Accepts same-origin paths beginning with '/'.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "An internal path beginning with '/'.",
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
  // The locale SEGMENT, not the whole pathname: re-registering on every
  // in-locale navigation would be churn for no gain (the descriptors do not
  // depend on which page you are on), while a /da → /en switch genuinely
  // changes what the descriptions should say.
  const pathname = usePathname();
  const localeSegment = localeSegmentOf(pathname);

  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return; // ingen WebMCP-support → no-op (alle ikke-Chrome-browsere)

    const controller = new AbortController();
    void registerWebMcpTools(resolved.context, buildGlobalTools(), controller.signal);
    // WebMCP has no unregisterTool(): aborting the signal is the cleanup, so a
    // re-registration cannot leave the previous locale's descriptors behind.
    return () => controller.abort();
  }, [localeSegment]);

  return null;
}
