import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { brand } from "@/brand.config";
import { chatModel } from "@/lib/ai/client";

/**
 * AI-magic-knap til ADMIN-produkter: genererer description + attributes via
 * Anthropic API. Adopteret fra category-seo-generator-pattern. Brand-portable
 * — virker for solbrillen, panel-hegn, sømosegaard uden kode-ændring.
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
    "Key/value-pairs af tekniske specs. Keys = label, values = konkret værdi. Vælg labels passende til produkt-type (industry-agnostisk). 4-8 attributter typisk.",
  );

const ProductSeoSchema = z.object({
  description: z
    .string()
    .min(80)
    .max(1000)
    .describe(
      "Salgs-beskrivelse 80-250 ord. Fokus på USP, materiale, brug-cases, lifestyle. Naturlig dansk, ikke salgs-spam. Nævn relevante brand-policies (fragt, returret) hvor det giver mening. Skriv som om du vejleder en kunde i butikken.",
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
  const model = await chatModel();

  const policies = brand.policies;
  const policiesText = `gratis fragt over ${policies.shippingFreeThresholdDkk / 100} kr, ${policies.returnDays} dages returret`;
  const priceKr = (input.priceDkk / 100).toFixed(0);

  const prompt = `Du er produkttekst-forfatter for ${brand.storeName} (${brand.tagline}).

OPGAVE: Generér produktbeskrivelse + tekniske attributter for "${input.name}".

BRAND-KONTEKST:
- Shop: ${brand.storeName}
- Tagline: ${brand.tagline}
- Footer-tagline: ${brand.footer.tagline}
- Policies: ${policiesText}

PRODUKT-DATA:
- Navn: ${input.name}
- Brand: ${input.brandName || "(eget brand)"}
- Kategori: ${input.categoryName || "(ingen)"}
- Pris: ${priceKr} kr
- Eksisterende beskrivelse: ${input.existingDescription || "(ingen)"}

TONALITET:
- Hjælpsom, faglig, ikke salgs-spam
- Dansk sprog, du-form
- Konkrete detaljer (materiale, vægt, mål, brug-cases) — ikke fluffy adjektiver
- Nævn brand-policies hvor relevant
- Undgå AI-fraser: "i en verden af...", "vores premium kollektion...", "luksuriøs unik..."

OUTPUT: Returnér struktureret JSON med to felter:
- description: 80-250 ord salgs-beskrivelse
- attributes: key/value-pairs af tekniske specs — vælg labels passende til produkt-type. Industry-eksempler: solbriller (Stelfarve: Sort, UV: UV400), hegn (Højde: 180cm, Materiale: Galvaniseret), keramik (Vægt: 320g, Maskinopvask: Ja).`;

  const { object } = await generateObject({
    model,
    schema: ProductSeoSchema,
    prompt,
  });

  return object;
}
