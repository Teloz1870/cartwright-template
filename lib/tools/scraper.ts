import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { scrapeProduct } from "@/lib/scrape/product";

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
  skipAudit: true,
  handler: async (args) => {
    const result = await scrapeProduct(args.url);
    if (!result.ok) throw new Error(result.error);
    return result.product;
  },
});

export const scraperTools = [scrapeUrlTool];
