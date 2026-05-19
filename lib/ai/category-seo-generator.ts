import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { brand } from "@/brand.config";
import { chatModel } from "@/lib/ai/client";

/**
 * AI-magic-knap til admin: genererer SEO-optimeret kategori-content (4 felter)
 * via Anthropic API. Brand-portable — læser fra brand.config så samme funktion
 * virker for solbrillen-shop, panel-hegn-shop, sømosegaard-shop osv. uden kode-
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
  q: z.string().min(5).max(200).describe("Spørgsmål — klart formuleret, ikke statement"),
  a: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "Svar — 50-300 chars typisk, faglig og hjælpsom. Mention brand-policies hvor relevant.",
    ),
});

const CategorySeoSchema = z.object({
  metaTitle: z
    .string()
    .min(20)
    .max(70)
    .describe("Page <title> + OG title. 50-60 chars optimalt. Format: 'Keyword + brand + USP'"),
  metaDescription: z
    .string()
    .min(80)
    .max(170)
    .describe(
      "<meta description> + OG description. 150-155 chars optimalt. Hook + USP + CTA. Skal nævne mindst én policy (gratis fragt eller returret).",
    ),
  descriptionLong: z
    .string()
    .min(800)
    .max(3000)
    .describe(
      "Long-form SEO-content. 300-400 ord. Markdown-like med 2-3 ## h2-headings ('Hvad er X for noget?', 'Sådan vælger du', 'Vores X-sortiment'). Hver h2 efterfølges af 2-4 paragrafer. Nævn brand-policies + 2-3 brand-navne fra kategorien + domain-specifikke kvalitetsmarkører (industry-specifik — UV400 for solbriller, galvanisering for hegn, økologi for landbrug). Naturlig keyword-density, IKKE spam. Skriv på dansk.",
    ),
  faq: z
    .array(FaqItemSchema)
    .min(4)
    .max(6)
    .describe(
      "FAQ — 4-5 spørgsmål dækkende: størrelse/fit, materiale/holdbarhed, levering/returret, prisniveau, pleje, brand-specifikke features.",
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
  const model = await chatModel();

  const policies = brand.policies;
  const policiesText = `gratis fragt over ${policies.shippingFreeThresholdDkk / 100} kr, ${policies.returnDays} dages returret`;

  const prompt = `Du er SEO-copywriter for ${brand.storeName} (${brand.tagline}).

OPGAVE: Generér SEO-optimeret kategori-content for kategorien "${input.name}".

BRAND-KONTEKST:
- Shop-navn: ${brand.storeName}
- Tagline: ${brand.tagline}
- Footer-tagline: ${brand.footer.tagline}
- Policies: ${policiesText}, ${policies.currency}

KATEGORI-DATA:
- Navn: ${input.name}
- Slug: ${input.slug}
- Antal produkter: ${input.productCount}
- Brands i kategorien: ${input.topBrands.length > 0 ? input.topBrands.join(", ") : "(ikke specificeret)"}
- Eksisterende kort beskrivelse: ${input.shortDescription || "(ingen)"}

TONALITET:
- Hjælpsom, faglig, ikke salgsagtig
- Dansk sprog, du-form
- Naturlig keyword-density (ikke spam)
- Nævn konkrete brand-navne + policies hvor relevant
- Undgå generiske AI-fraser som "i en verden af..." eller "vores premium kollektion"

OUTPUT: Returnér struktureret JSON med fire felter: metaTitle, metaDescription, descriptionLong, faq.`;

  const { object } = await generateObject({
    model,
    schema: CategorySeoSchema,
    prompt,
  });

  return object;
}
