/**
 * ULTRAPLAN-lite UL4: industry-template loader.
 *
 * Vælger template baseret på brand.industryTemplate (eller fallback til
 * "eyewear" for bagudkompatibilitet med solbrillen.dk). Bruges af
 * prisma/seed.ts for at oprette domain-specifik content.
 *
 * Ved fork:
 * 1. Vælg en eksisterende template (eyewear, generic), ELLER
 * 2. Opret en ny: cp industry-templates/generic industry-templates/<navn>
 *    + rediger seed-data.ts, registrer i TEMPLATES nedenfor, sæt
 *    brand.industryTemplate = "<navn>" i brand.config.ts
 */

import type { IndustryTemplate } from "./types";
import { genericTemplate } from "./generic/seed-data";

const TEMPLATES: Record<string, IndustryTemplate> = {
  generic: genericTemplate,
};

export function getIndustryTemplate(slug: string | undefined): IndustryTemplate {
  if (!slug) return genericTemplate;
  return TEMPLATES[slug] ?? genericTemplate;
}

/**
 * P1.4: Dynamisk derive af tilgængelige industry-templates fra TEMPLATES-map.
 * Bruges af setup-wizard, fork-smoke-script og tests så vi kun har ÉT sted
 * der registrerer templates — tilføj en ny industry i TEMPLATES, og den
 * dukker automatisk op overalt.
 */
export const INDUSTRY_TEMPLATE_OPTIONS = Object.entries(TEMPLATES).map(
  ([slug, tpl]) => ({ slug, label: tpl.label, description: tpl.description }),
);

export type { IndustryTemplate, SeedCategory, SeedPage, SeedProduct } from "./types";
