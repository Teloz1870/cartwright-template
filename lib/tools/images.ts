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
    .min(2, "Søgeord skal være mindst 2 tegn")
    .max(100, "Søgeord for langt"),
  count: z.number().int().min(1).max(10).default(4),
});

export const searchUnsplashTool = defineTool({
  name: "images.search_unsplash",
  description:
    "Søg produkt-billeder på Unsplash (gratis stockphoto-tjeneste). Returnerer 4 kandidater med thumbnails. AI'en bør kalde dette efter products.create for at give admin billed-valg. Bedste queries: 'brand model sunglasses' (fx 'ray ban wayfarer sunglasses') eller 'category sunglasses' (fx 'aviator sunglasses gold'). Hvis 0 hits, prøv bredere query.",
  scope: "catalog:read",
  input: searchUnsplashInput,
  skipAudit: true,
  handler: async (args) => {
    const candidates = await searchUnsplash(args.query, args.count);
    return candidates;
  },
});

export const imagesTools = [searchUnsplashTool];
