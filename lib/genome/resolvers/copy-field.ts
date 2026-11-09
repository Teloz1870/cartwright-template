import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import type { GenomeDeps } from "../types";

/**
 * Generisk copy-resolver — ÉN funktion der skriver et hvilket som helst kort
 * display-streng-felt i brandets stemme, drevet af en data-spec. Mønster lånt
 * 1:1 fra lib/ai/category-seo-generator.ts: generateObject + Zod + vibe-intent
 * (tvinger Anthropic, pålidelig structured output) + withAuditContext-stamping.
 *
 * Dette er det uniforme primitiv: at tilføje et nyt resolvable felt = en
 * data-spec + et registry-entry, ikke en ny resolver-funktion (se A2).
 */

export type CopyFieldSpec = {
  /** Kort label (fx "footer tagline"). */
  label: string;
  /** Hvad strengen ER / hvor den vises — styrer modellens forståelse. */
  purpose: string;
  minLength: number;
  maxLength: number;
  /** Valgfri ekstra instruktion (fx "must mention the return policy"). */
  guidance?: string;
};

export async function resolveCopyField(
  spec: CopyFieldSpec,
  deps: GenomeDeps,
): Promise<string> {
  // vibe-intent → altid Anthropic; structured output skal være pålideligt.
  const resolved = await chatModelResolved("vibe");

  const schema = z.object({
    text: z
      .string()
      .min(spec.minLength)
      .max(spec.maxLength)
      .describe(`${spec.label}: ${spec.purpose}`),
  });

  const prompt = `You are a brand copywriter for "${deps.storeName}".

TASK: Write the ${spec.label} — ${spec.purpose}

BRAND VOICE (match precisely):
- Tone: ${deps.tone}
- Audience: ${deps.audience}
- Formality: ${deps.formality}
- Vibe: ${deps.vibe}

CONSTRAINTS:
- ${spec.minLength}-${spec.maxLength} characters, ONE line, no emojis.
- Sound like the brand voice above — that is the whole point.
- No generic AI clichés ("in a world of...", "premium", "unleash", "elevate", "seamless").
${spec.guidance ? `- ${spec.guidance}\n` : ""}
Return JSON { "text": "..." }.`;

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
        prompt,
      }),
  );

  return object.text;
}
