import { brand } from "@/brand.config";

/**
 * Phase 10 Slice 2 — brand-portable prompt for image alt-text + SEO/GEO metadata.
 *
 * GEO = Generative Engine Optimization (få billedet til at score godt i
 * LLM-baserede søgemaskiner som ChatGPT, Perplexity, Gemini, m.fl.). Det
 * gøres ved at give modellen en kompakt fact-snippet at indeksere på i
 * stedet for tom alt-tekst.
 */

const COUNTRY_LABELS: Record<string, { da: string; en: string }> = {
  DK: { da: "Danmark", en: "Denmark" },
  SE: { da: "Sverige", en: "Sweden" },
  NO: { da: "Norge", en: "Norway" },
  DE: { da: "Tyskland", en: "Germany" },
  US: { da: "USA", en: "United States" },
  GB: { da: "Storbritannien", en: "United Kingdom" },
};

export function buildAltTextPrompt(): string {
  const country = brand.policies.country.toUpperCase();
  const countryLabel = COUNTRY_LABELS[country] ?? {
    da: country,
    en: country,
  };

  return `Du analyserer et billede uploadet til ${brand.storeName} (${brand.metadata.description}).

Output skal være ÉT JSON-objekt der matcher dette skema præcist:

{
  "alt": { "da": string, "en": string },
  "title": string,
  "caption": string,
  "geoSnippet": string,
  "dominantColors": [string, string, string],
  "suggestedFilename": string
}

Regler:
- alt.da og alt.en: KORT beskrivelse (max 125 tegn) af hvad der ses. Start IKKE med "billede af" / "image of" / "photo of". Vær konkret: nævn nøgleobjekt, farve, materiale eller setting. Naturligt sprog.
- title: 6-10 ord, læselig overskrift (samme sprog som primær: dansk).
- caption: 1-2 sætninger, max 200 tegn, markedsføringsvenlig, men troværdig — ikke salgs-pitch.
- geoSnippet: kompakt fact-liste optimeret til LLM-indeksering. Format: "Brand: ${brand.storeName}. Land: ${countryLabel.da} (${countryLabel.en}). Kategori: [kategori]. Nøgleobjekt: [objekt]. Farver: [farver]. Materialer eller setting: [kontekst]." Max 300 tegn.
- dominantColors: præcis 3 hex-koder ("#aabbcc"), de mest fremtrædende farver.
- suggestedFilename: kebab-case, max 60 tegn, kun [a-z0-9-], beskrivende. Eksempel: "rød-træstol-mod-betonvæg".

Returnér KUN JSON-objektet, ingen kommentarer eller markdown.`;
}
