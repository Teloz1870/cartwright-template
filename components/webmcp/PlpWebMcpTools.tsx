"use client";

import { useEffect } from "react";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";

/**
 * Catalogue-page contextual WebMCP tools — the listing page teaches the agent
 * its own filters (per-route registration per the WebMCP guidance, like the
 * PDP/cart mounts):
 *
 * - `list_visible_products` (read-only, zero network): returns exactly the
 *   server-narrowed product list the HUMAN currently sees, plus the active
 *   filter state — the agent reads the page instead of re-querying it.
 * - `filter_products` (navigation-only, binds []): builds a validated
 *   `/{locale}/produkter?…` URL from a server-derived schema (live category
 *   slugs as an enum) and navigates. After the RSC re-render, the effect dep
 *   re-registers `list_visible_products` with the NEW visible set — the
 *   `toolchange` listener on /webmcp-check shows the loop live.
 *
 * `filter_products.q` deliberately overlaps the declarative `site_search`
 * form tool: one is the human's own search form (autosubmit, form-native),
 * this one is schema-validated navigation that composes with the other
 * filter dimensions. The descriptions tell agents which to pick.
 *
 * Own AbortController per mount; effect dep is the serialized props, so a
 * filter navigation (fresh server render) re-registers with fresh data.
 */

export type PlpToolProduct = {
  id: string;
  name: string;
  slug: string;
  priceFormatted: string;
  inStock: boolean;
  category: string | null;
};

export type PlpToolCategory = { slug: string; name: string };

export type PlpToolFilters = {
  q?: string;
  kategori?: string;
  minPris?: string;
  maxPris?: string;
  sort?: string;
};

const SORT_VALUES = ["nyeste", "pris-op", "pris-ned"] as const;

/**
 * The tool speaks ENGLISH parameters (agents are English-first; Chrome's
 * best-practices ask for natural-language values) while the ROUTE keeps its
 * Danish query params (`?kategori=…&sort=pris-op` — public URLs, unchanged).
 * The map is the seam; Danish inputs stay accepted leniently below.
 */
const SORT_MAP: Record<string, (typeof SORT_VALUES)[number]> = {
  newest: "nyeste",
  "price-asc": "pris-op",
  "price-desc": "pris-ned",
  // Lenient: the route's own values keep working.
  nyeste: "nyeste",
  "pris-op": "pris-op",
  "pris-ned": "pris-ned",
};
const SORT_INPUT_VALUES = ["newest", "price-asc", "price-desc"] as const;

/** Moat bindings — same contract as WEBMCP_TOOL_BINDINGS in the registrar. */
export const PLP_WEBMCP_TOOL_BINDINGS = {
  list_visible_products: ["products.search"],
  filter_products: [],
} as const;

type PlpToolsProps = {
  products: PlpToolProduct[];
  totalCount: number;
  categories: PlpToolCategory[];
  filters: PlpToolFilters;
  locale: string;
};

function buildPlpTools(props: PlpToolsProps): WebMcpToolDescriptor[] {
  const { products, totalCount, categories, filters, locale } = props;
  const categorySlugs = categories.map((c) => c.slug);
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => typeof v === "string" && v.length > 0),
  );

  return [
    {
      name: "list_visible_products",
      description:
        "List the products currently visible on this catalogue page — exactly what the user sees, after the active filters. " +
        `${totalCount} match right now${totalCount > products.length ? ` (first ${products.length} returned)` : ""}. ` +
        "Read-only and instant (no network). Use filter_products to change what is visible, or navigate to a product's url for details.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute() {
        return {
          activeFilters,
          totalCount,
          returnedCount: products.length,
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            url: `/${locale}/product/${encodeURIComponent(p.slug)}`,
            price: p.priceFormatted,
            inStock: p.inStock,
            ...(p.category ? { category: p.category } : {}),
          })),
        };
      },
    },
    {
      name: "filter_products",
      description:
        "Filter or sort this catalogue page. Navigates to the filtered listing (same page, new filters) — after it loads, list_visible_products reflects the new selection. " +
        `Categories: ${categorySlugs.join(", ") || "none"}. ` +
        "For free-text search the site_search form tool also works; this tool composes search with category, price and sort.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Free-text search within the catalogue." },
          category: {
            type: "string",
            description: "Category slug to filter by.",
            ...(categorySlugs.length > 0 ? { enum: categorySlugs } : {}),
          },
          minPrice: {
            type: "integer",
            minimum: 0,
            description: "Minimum price in the shop's base currency (whole units).",
          },
          maxPrice: {
            type: "integer",
            minimum: 0,
            description: "Maximum price in the shop's base currency (whole units).",
          },
          sort: {
            type: "string",
            enum: [...SORT_INPUT_VALUES],
            description: "newest, price-asc (low→high) or price-desc (high→low).",
          },
        },
      },
      execute(input) {
        const params = new URLSearchParams();
        if (typeof input.q === "string" && input.q.trim()) params.set("q", input.q.trim());
        // English parameter surface; the route's Danish query params are the
        // implementation detail the map below feeds. Danish keys/values stay
        // accepted leniently (older transcripts, the site's own URLs).
        const category = input.category ?? input.kategori;
        if (category !== undefined) {
          if (typeof category !== "string" || !categorySlugs.includes(category)) {
            return {
              error: `Unknown category "${String(category)}". Options: ${categorySlugs.join(", ") || "none"}.`,
            };
          }
          params.set("kategori", category);
        }
        for (const [key, param] of [
          ["minPrice", "minPris"],
          ["maxPrice", "maxPris"],
        ] as const) {
          const val = input[key] ?? input[param];
          if (val === undefined) continue;
          const n = Number(val);
          if (!Number.isInteger(n) || n < 0) {
            return { error: `${key} must be a non-negative integer.` };
          }
          params.set(param, String(n));
        }
        if (input.sort !== undefined) {
          const mapped =
            typeof input.sort === "string" ? SORT_MAP[input.sort] : undefined;
          if (!mapped) {
            return { error: `sort must be one of: ${SORT_INPUT_VALUES.join(", ")}.` };
          }
          if (mapped !== "nyeste") params.set("sort", mapped);
        }
        const qs = params.toString();
        const path = `/${locale}/produkter${qs ? `?${qs}` : ""}`;
        window.location.assign(path);
        return { status: "navigating", path };
      },
    },
  ];
}

export default function PlpWebMcpTools(props: PlpToolsProps) {
  const propsKey = JSON.stringify(props);
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return;
    const controller = new AbortController();
    void registerWebMcpTools(
      resolved.context,
      buildPlpTools(JSON.parse(propsKey) as PlpToolsProps),
      controller.signal,
    );
    return () => controller.abort();
  }, [propsKey]);

  return null;
}
