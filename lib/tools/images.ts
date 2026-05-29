import "server-only";

import { z } from "zod";
import { searchUnsplash } from "@/lib/unsplash";
import { defineTool } from "@/lib/tools/types";

/**
 * Tools til billed-håndtering.
 *
 * v1: kun search via Unsplash. v1.1 vil tilføje file-upload tool +
 * AI-generation til lifestyle/marketing (IKKE pack-shots — brand-integrity).
 */

const searchUnsplashInput = z.object({
  query: z
    .string()
    .min(2, "Search terms must be at least 2 characters")
    .max(100, "Search term is too long"),
  count: z.number().int().min(1).max(10).default(4),
});

export const searchUnsplashTool = defineTool({
  name: "images.search_unsplash",
  description:
    "Search product images on Unsplash (free stock photo service). Returns 4 candidates with thumbnails. The AI should call this after products.create to give the admin image choices. Best queries: 'brand model product-type' (for example 'patagonia jacket' or 'kitchenaid mixer') or 'category descriptor' (for example 'leather wallet brown'). If there are 0 hits, try a broader query.",
  scope: "catalog:read",
  input: searchUnsplashInput,
  skipAudit: true,
  handler: async (args) => {
    const candidates = await searchUnsplash(args.query, args.count);
    return candidates;
  },
});

export const imagesTools = [searchUnsplashTool];
