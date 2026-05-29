import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { brand } from "@/brand.config";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";

/**
 * AI-magic-knap til ADMIN-produkter: genererer description + attributes via
 * Anthropic API. Adopteret fra category-seo-generator-pattern. Brand-portable
 * — virker for fashion, panel-hegn, sømosegaard uden kode-ændring.
 *
 * Kører som server-action. Admin trigger via knap i ProductForm → resultat
 * fylder textareas/fields → admin reviewer + klikker Gem.
 *
 * NB: Tags droppet fra schema per Ultraplan-review (Product har ikke tags-felt
 * i Prisma; ekstra migration ville være scope-creep). Hvis admin vil tagge
 * et produkt, kan det gemmes som ekstra key i attributes-JSON (fx
 * { "tags": "klassisk,casual,hverdag" }).
 *
 * Kræver ANTHROPIC_API_KEY i env eller IntegrationSettings.anthropicApiKey.
 */

const AttributesSchema = z
  .record(z.string().min(1).max(50), z.string().min(1).max(200))
  .describe(
    "Key/value pairs of technical specs. Keys = label, values = concrete value. Choose labels appropriate for the product type (industry-agnostic). 4-8 attributes is typical.",
  );

const ProductSeoSchema = z.object({
  description: z
    .string()
    .min(80)
    .max(1000)
    .describe(
      "Sales description of 80-250 words. Focus on USP, material, use cases, lifestyle. Natural English, not sales spam. Mention relevant brand policies (shipping, returns) where it makes sense. Write as if you are advising a customer in the shop.",
    ),
  attributes: AttributesSchema,
});

export type ProductSeoResult = z.infer<typeof ProductSeoSchema>;

export type ProductGenerationInput = {
  name: string;
  slug: string;
  brandName?: string | null;
  categoryName?: string | null;
  priceDkk: number;
  existingDescription?: string | null;
};

/**
 * Genererer produkt-content via Anthropic. Returnerer struktureret JSON klar
 * til at gemme i Product-tabellen. Tager ~10-25 sek typisk.
 */
export async function generateProductSEO(
  input: ProductGenerationInput,
): Promise<ProductSeoResult> {
  // vibe-intent tvinger Anthropic — structured output via Zod skal være pålidelig.
  const resolved = await chatModelResolved("vibe");

  const policies = brand.policies;
  const policiesText = `free shipping over ${policies.shippingFreeThresholdDkk / 100} kr, ${policies.returnDays} days return policy`;
  const priceKr = (input.priceDkk / 100).toFixed(0);

  const prompt = `You are a product copywriter for ${brand.storeName} (${brand.tagline}).

TASK: Generate product description + technical attributes for "${input.name}".

BRAND CONTEXT:
- Shop: ${brand.storeName}
- Tagline: ${brand.tagline}
- Footer-tagline: ${brand.footer.tagline}
- Policies: ${policiesText}

PRODUCT DATA:
- Name: ${input.name}
- Brand: ${input.brandName || "(own brand)"}
- Category: ${input.categoryName || "(none)"}
- Price: ${priceKr} kr
- Existing description: ${input.existingDescription || "(none)"}

TONE:
- Helpful, professional, not sales spam
- English language, direct second-person voice
- Concrete details (material, weight, dimensions, use cases) - not fluffy adjectives
- Mention brand policies where relevant
- Avoid AI phrases: "in a world of...", "our premium collection...", "luxurious unique..."

OUTPUT: Return structured JSON with two fields:
- description: 80-250 word sales description
- attributes: key/value pairs of technical specs - choose labels appropriate for the product type. Industry examples: apparel (Material: Cotton, Fit: Slim), fencing (Height: 180cm, Material: Galvanized), ceramics (Weight: 320g, Dishwasher safe: Yes).`;

  const { object } = await withAuditContext(
    {
      provider: resolved.provider,
      model: resolved.model,
      modality: "text",
    },
    () =>
      generateObject({
        model: resolved.handle,
        schema: ProductSeoSchema,
        prompt,
      }),
  );

  return object;
}
