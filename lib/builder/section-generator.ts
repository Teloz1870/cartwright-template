import "server-only";

import { generateObject } from "ai";
import type { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { SECTION_REGISTRY, type SectionKey } from "@/lib/builder/section-registry";

/**
 * Visual Builder — AI-genererede sektioner (Fase 3, vibe-pipeline-genbrug).
 *
 * Kernen i "Hul B": modellen genererer ALDRIG vilkårlig JSX. Den får sektionens
 * EGEN props-schema (fra section-registry) som `generateObject`-schema, så
 * outputtet per konstruktion er en gyldig, whitelisted props-payload — det
 * samme schema som pages.set_layout håndhæver ved publish. Invalid output kan
 * ikke slippe igennem (generateObject afviser det).
 *
 * Mirror af lib/ai/theme-generator.ts: `chatModelResolved("vibe")` (tvinger
 * Anthropic — structured output kræver pålidelig JSON) + withAuditContext.
 */
export async function generateSectionProps(
  key: SectionKey,
  prompt: string,
): Promise<Record<string, unknown>> {
  const entry = SECTION_REGISTRY[key];
  // propsSchema er en konkret ZodObject pr. sektion; cast så generateObject's
  // generiske inferens accepterer den heterogene registry-union.
  const schema = entry.propsSchema as z.ZodType<Record<string, unknown>>;

  const resolved = await chatModelResolved("vibe");

  const { object } = await withAuditContext(
    {
      provider: resolved.provider,
      model: resolved.model,
      modality: "text",
    },
    () =>
      generateObject({
        model: resolved.handle,
        schema,
        prompt: `Du udfylder indholdet til en "${entry.label}"-sektion på en dansk webside.

Butiksejerens ønske: "${prompt}"

Returnér felterne der matcher sektionens schema. Skriv kort, konkret, salgsklar dansk copy. Brug realistiske, ikke-generiske formuleringer. Links (felter der ender på Href) skal være relative stier som "/kontakt" eller "/produkter" medmindre ønsket angiver andet.`,
      }),
  );

  // generateObject har allerede valideret mod schemaet; dette er et ekstra
  // sikkerheds-net så vi aldrig returnerer noget der ikke parser.
  return schema.parse(object);
}
