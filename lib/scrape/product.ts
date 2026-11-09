import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { scrapeUrl } from "@/lib/firecrawl";

/**
 * Scrape produktdata fra en URL → struktureret produkt via generateObject.
 * Firecrawl henter siden; modellen udtrækker felterne. Billeder gemmes som
 * eksterne URL'er (Blob-ingest er en senere udvidelse). Fail-soft.
 */

const ScrapedProductSchema = z.object({
  name: z.string().min(2).max(200).describe("Product name"),
  description: z
    .string()
    .min(10)
    .max(2000)
    .describe("Product description, clean prose, no HTML"),
  priceKr: z
    .number()
    .positive()
    .nullable()
    .describe("Price in DKK (kroner) if found, else null"),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .max(12)
    .describe("Key/value spec attributes (material, size, color, …)"),
});

export type ScrapedProduct = z.infer<typeof ScrapedProductSchema> & {
  imageUrls: string[];
  sourceUrl: string;
};

export type ScrapeResult =
  | { ok: true; product: ScrapedProduct }
  | { ok: false; error: string };

export async function scrapeProduct(url: string): Promise<ScrapeResult> {
  if (!/^https?:\/\//i.test(url.trim())) {
    return { ok: false, error: "Angiv en gyldig URL (http/https)." };
  }
  const scraped = await scrapeUrl(url.trim());
  if (!scraped) {
    return {
      ok: false,
      error: "Firecrawl er ikke konfigureret eller scrape fejlede (sæt FIRECRAWL_API_KEY).",
    };
  }

  const resolved = await chatModelResolved("vibe");
  const prompt = `Extract structured product data from this scraped product page.

Return: name, description (clean prose), priceKr (DKK number or null), and up to 12
spec attributes as key/value pairs. Do NOT invent data not on the page.

SCRAPED CONTENT (markdown):
${scraped.markdown.slice(0, 6000)}`;

  try {
    const { object } = await withAuditContext(
      { provider: resolved.provider, model: resolved.model, modality: "text" },
      () => generateObject({ model: resolved.handle, schema: ScrapedProductSchema, prompt }),
    );
    return {
      ok: true,
      product: { ...object, imageUrls: scraped.images.slice(0, 8), sourceUrl: url.trim() },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke udtrække produktdata." };
  }
}
