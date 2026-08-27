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
          kategori: {
            type: "string",
            description: "Category slug to filter by.",
            ...(categorySlugs.length > 0 ? { enum: categorySlugs } : {}),
          },
          minPris: {
            type: "integer",
            minimum: 0,
            description: "Minimum price in the shop's base currency (whole units).",
          },
          maxPris: {
            type: "integer",
            minimum: 0,
            description: "Maximum price in the shop's base currency (whole units).",
          },
          sort: {
            type: "string",
            enum: [...SORT_VALUES],
            description: "nyeste = newest, pris-op = price low→high, pris-ned = price high→low.",
          },
        },
      },
      execute(input) {
        const params = new URLSearchParams();
        if (typeof input.q === "string" && input.q.trim()) params.set("q", input.q.trim());
        if (input.kategori !== undefined) {
          if (
            typeof input.kategori !== "string" ||
            !categorySlugs.includes(input.kategori)
          ) {
            return {
              error: `Unknown category "${String(input.kategori)}". Options: ${categorySlugs.join(", ") || "none"}.`,
            };
          }
          params.set("kategori", input.kategori);
        }
        for (const key of ["minPris", "maxPris"] as const) {
          const val = input[key];
          if (val === undefined) continue;
          const n = Number(val);
          if (!Number.isInteger(n) || n < 0) {
            return { error: `${key} must be a non-negative integer.` };
          }
          params.set(key, String(n));
        }
        if (input.sort !== undefined) {
          if (
            typeof input.sort !== "string" ||
            !(SORT_VALUES as readonly string[]).includes(input.sort)
          ) {
            return { error: `sort must be one of: ${SORT_VALUES.join(", ")}.` };
          }
          if (input.sort !== "nyeste") params.set("sort", input.sort);
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
