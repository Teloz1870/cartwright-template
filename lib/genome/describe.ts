import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import type { AuditActor } from "@/lib/audit";
import {
  applyIdentityAnchor,
  reharmonizeAll,
  IDENTITY_OPTIONS,
  type ReharmonizeEntry,
} from "./identity";
import type { GenomeAnchorKey } from "./types";

/**
 * "Spawn fra én sætning" — den selv-byggende demo. Én plain-English beskrivelse
 * af forretningen → en model udleder identity-ankrene (tone/audience/formality/
 * vibe, begrænset til de tilladte enums) → ankrene sættes → hvert resolvable
 * felt re-resolves. Beskriv din forretning, og den skriver sig selv.
 */

const InferredIdentitySchema = z.object({
  tone: z
    .enum([...IDENTITY_OPTIONS.tone] as [string, ...string[]])
    .describe("The brand's writing voice."),
  audience: z
    .enum([...IDENTITY_OPTIONS.audience] as [string, ...string[]])
    .describe("Primary audience the copy speaks to."),
  formality: z
    .enum([...IDENTITY_OPTIONS.formality] as [string, ...string[]])
    .describe("How formal the language is."),
  vibe: z
    .string()
    .min(2)
    .max(40)
    .describe("One short stylistic keyword (e.g. 'cozy', 'precision', 'bold')."),
});

export type InferredIdentity = z.infer<typeof InferredIdentitySchema>;

export type DescribeResult =
  | { ok: true; identity: InferredIdentity; reharmonized: ReharmonizeEntry[] }
  | { ok: false; error: string };

export async function describeBusiness(
  sentence: string,
  actor: AuditActor,
): Promise<DescribeResult> {
  const s = sentence.trim();
  if (s.length < 8) {
    return { ok: false, error: "Beskriv forretningen i mindst én sætning." };
  }

  const resolved = await chatModelResolved("vibe");
  const prompt = `Infer the brand voice for this business from a one-line description.

DESCRIPTION: "${s}"

Pick the best-fitting:
- tone (one of: ${IDENTITY_OPTIONS.tone.join(", ")})
- audience (one of: ${IDENTITY_OPTIONS.audience.join(", ")})
- formality (one of: ${IDENTITY_OPTIONS.formality.join(", ")})
- vibe (one short stylistic keyword you choose)

Return JSON { "tone", "audience", "formality", "vibe" }.`;

  let identity: InferredIdentity;
  try {
    const { object } = await withAuditContext(
      { provider: resolved.provider, model: resolved.model, modality: "text" },
      () =>
        generateObject({
          model: resolved.handle,
          schema: InferredIdentitySchema,
          prompt,
        }),
    );
    identity = object;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke udlede identitet.",
    };
  }

  // Persistér de udledte ankre (hver valideres igen i applyIdentityAnchor).
  for (const key of ["tone", "audience", "formality", "vibe"] as const) {
    const r = await applyIdentityAnchor(key as GenomeAnchorKey, identity[key], actor);
    if (!r.ok) return { ok: false, error: r.error };
  }

  const reharmonized = await reharmonizeAll(actor);
  return { ok: true, identity, reharmonized };
}
