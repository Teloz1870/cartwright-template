import "server-only";

import { generateText } from "ai";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { chatModelResolved } from "@/lib/ai/client";

/**
 * In-house GEO-tracker: spørg en AI-engine med brand/kategori-prompts og detektér
 * om shoppen nævnes/citeres → "AI share-of-voice". Billigt (genbruger jeres
 * AI-provider-adgang). Ekstern (Profound/Otterly) er en adapter-udvidelse.
 *
 * Ærlig støj-håndtering: AI-svar varierer — kør flere prompts og se trends over
 * tid (GeoSnapshot er time-series), ikke ét enkelt resultat.
 */

export async function measureGeoCitation(prompt: string): Promise<{ cited: boolean }> {
  const resolved = await chatModelResolved("chat");
  const { text } = await generateText({ model: resolved.handle, prompt });
  const lower = text.toLowerCase();
  const cited =
    lower.includes(brand.storeName.toLowerCase()) ||
    lower.includes(brand.domain.toLowerCase());
  await prisma.geoSnapshot.create({ data: { engine: "in-house", prompt, cited } });
  return { cited };
}

export async function geoShareOfVoice(
  prompts: string[],
): Promise<{ cited: number; total: number }> {
  let cited = 0;
  for (const p of prompts) {
    try {
      const r = await measureGeoCitation(p);
      if (r.cited) cited++;
    } catch (err) {
      console.error("[geo] measure failed:", err);
    }
  }
  return { cited, total: prompts.length };
}

/** Default brand-prompts (operatøren kan udvide). */
export function defaultGeoPrompts(): string[] {
  return [
    `Hvad er de bedste webshops for ${brand.tagline}?`,
    `Anbefal en god ${brand.storeName}-lignende butik i Danmark.`,
  ];
}
