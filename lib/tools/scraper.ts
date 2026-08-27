import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { scrapeProduct } from "@/lib/scrape/product";

const scrapedProductOutput = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10).max(2000),
  priceKr: z.number().positive().nullable(),
  attributes: z.array(z.object({
    key: z.string(),
    value: z.string(),
  }).strict()).max(12),
  imageUrls: z.array(z.string()).max(8).describe(
    "Image references returned by Firecrawl. Usually absolute URLs; metadata-provided references can be relative.",
  ),
  sourceUrl: z.string().url(),
}).strict();

/**
 * AI tool: scrap produktdata fra en URL (Firecrawl + AI-udtræk). Returnerer
 * struktureret produkt til gennemsyn — opretter ikke selv (operatøren bekræfter
 * i UI eller via products.create). Admin-gated.
 */
export const scrapeUrlTool = defineTool({
  name: "scraper.scrape_url",
  description:
    "Scrape a product page from a URL and extract structured product data (name, description, priceKr, attributes, image URLs) for review. Read-only — does not create the product. Requires FIRECRAWL_API_KEY.",
  scope: "products:write",
  input: z.object({ url: z.string().url() }),
  output: scrapedProductOutput,
  skipAudit: true,
  handler: async (args) => {
    const result = await scrapeProduct(args.url);
    if (!result.ok) throw new Error(result.error);
    return result.product;
  },
});

export const scraperTools = [scrapeUrlTool];
