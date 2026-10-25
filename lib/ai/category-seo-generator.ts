import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { brand } from "@/brand.config";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";

/**
 * AI-magic-knap til admin: genererer SEO-optimeret kategori-content (4 felter)
 * via Anthropic API. Brand-portable — læser fra brand.config så samme funktion
 * virker for fashion-shop, panel-hegn-shop, sømosegaard-shop osv. uden kode-
 * ændring. Bare opdater brand.config.ts + content-niche kan skifte.
 *
 * Bruger AI SDK's generateObject + zod-schema for garanteret valid JSON-output
 * (ingen JSON.parse-fejl, ingen markdown-fences omkring response).
 *
 * Kræver:
 * - ANTHROPIC_API_KEY i .env ELLER IntegrationSettings.anthropicApiKey (admin/integrations)
 * - chatModel() der returnerer konfigureret Anthropic-handle
 */

const FaqItemSchema = z.object({
  q: z.string().min(5).max(200).describe("Question - clearly phrased, not a statement"),
  a: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "Answer - typically 50-300 chars, professional and helpful. Mention brand policies where relevant.",
    ),
});

const CategorySeoSchema = z.object({
  metaTitle: z
    .string()
    .min(20)
    .max(70)
    .describe("Page <title> + OG title. 50-60 chars optimal. Format: 'Keyword + brand + USP'"),
  metaDescription: z
    .string()
    .min(80)
    .max(170)
    .describe(
      "<meta description> + OG description. 150-155 chars optimal. Hook + USP + CTA. Must mention at least one policy (free shipping or returns).",
    ),
  descriptionLong: z
    .string()
    .min(800)
    .max(3000)
    .describe(
      "Long-form SEO content. 300-400 words. Markdown-like with 2-3 ## h2 headings ('What is X?', 'How to choose', 'Our X range'). Each h2 is followed by 2-4 paragraphs. Mention brand policies + 2-3 brand names from the category + domain-specific quality markers (industry-specific - GOTS-certification for textiles, galvanization for fencing, organic certification for agriculture). Natural keyword density, NOT spam. Write in English.",
    ),
  faq: z
    .array(FaqItemSchema)
    .min(4)
    .max(6)
    .describe(
      "FAQ - 4-5 questions covering: size/fit, material/durability, delivery/returns, price level, care, brand-specific features.",
    ),
});

export type CategorySeoResult = z.infer<typeof CategorySeoSchema>;

export type CategoryGenerationInput = {
  name: string;
  slug: string;
  shortDescription?: string | null;
  productCount: number;
  topBrands: string[];
};

/**
 * Genererer SEO-content for en kategori via Anthropic. Returnerer struktureret
 * JSON med 4 felter klar til at gemme i Category-tabellen.
 *
 * Tager ~10-30 sek typisk. Caller bør vise loading-state.
 */
export async function generateCategorySEO(
  input: CategoryGenerationInput,
): Promise<CategorySeoResult> {
  // vibe-intent tvinger Anthropic — structured output via Zod skal være pålidelig.
  const resolved = await chatModelResolved("vibe");

  const policies = brand.policies;
  const policiesText = `free shipping over ${policies.shippingFreeThresholdDkk / 100} kr, ${policies.returnDays} days return policy`;

  const prompt = `You are an SEO copywriter for ${brand.storeName} (${brand.tagline}).

TASK: Generate SEO-optimized category content for the category "${input.name}".

BRAND CONTEXT:
- Shop name: ${brand.storeName}
- Tagline: ${brand.tagline}
- Footer-tagline: ${brand.footer.tagline}
- Policies: ${policiesText}, ${policies.currency}

CATEGORY DATA:
- Name: ${input.name}
- Slug: ${input.slug}
- Number of products: ${input.productCount}
- Brands in the category: ${input.topBrands.length > 0 ? input.topBrands.join(", ") : "(not specified)"}
- Existing short description: ${input.shortDescription || "(none)"}

TONE:
- Helpful, professional, not pushy
- English language, direct second-person voice
- Natural keyword density (not spam)
- Mention concrete brand names + policies where relevant
- Avoid generic AI phrases such as "in a world of..." or "our premium collection"

OUTPUT: Return structured JSON with four fields: metaTitle, metaDescription, descriptionLong, faq.`;

  const { object } = await withAuditContext(
    {
      provider: resolved.provider,
      model: resolved.model,
      modality: "text",
    },
    () =>
      generateObject({
        model: resolved.handle,
        schema: CategorySeoSchema,
        prompt,
      }),
  );

  return object;
}
