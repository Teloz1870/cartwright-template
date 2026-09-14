import "server-only";

import type { SectionKey } from "@/lib/builder/section-registry";
import { generateSectionProps } from "@/lib/builder/section-generator";
import type { GeneratedSection } from "@/lib/magic/types";
import { getBrandVoice, withBrandVoice } from "@/lib/magic/reskin";

/**
 * Catalog source — the DEFAULT, governed, zero-marginal-cost path (the moat).
 *
 * Wraps generateSectionProps: the section's own strict Zod propsSchema IS the
 * generateObject schema, so the output is valid props by construction — the
 * model never picks a tag, color or font. The prompt is enriched with brand
 * voice so copy is on-brand; color cohesion is automatic at the token layer.
 */
export async function generateCatalogSection(
  key: SectionKey,
  prompt: string,
): Promise<GeneratedSection> {
  const voice = await getBrandVoice();
  const props = await generateSectionProps(key, withBrandVoice(prompt, voice));
  return { key, props };
}
