import "server-only";

import { generateObject } from "ai";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { DesignMdSchema, type DesignMdSpec } from "./spec";

/**
 * Prompt → design. The AI counterpart of the drag-drop import: the admin
 * describes a design in words; the model emits a validated cartwright-design-v1
 * spec, which the existing codegen (lib/designs/codegen.ts scaffoldDesign) turns
 * into a real DesignPack. Same governed pipeline as a hand-written design.md —
 * just authored by the model.
 *
 * Uses chatModelResolved("vibe") (Anthropic, structured output) like the Magic
 * Builder; throws a clear "configure an Anthropic key" error when none is set
 * (admin- + key-gated, inert otherwise). Writing the pack files is the codegen
 * step (local/dev; read-only prod FS is handled there).
 */
export async function generateDesignSpec(prompt: string): Promise<DesignMdSpec> {
  const resolved = await chatModelResolved("vibe");

  const { object } = await withAuditContext(
    { provider: resolved.provider, model: resolved.model, modality: "text" },
    () =>
      generateObject({
        model: resolved.handle,
        schema: DesignMdSchema,
        prompt: `You are designing a premium, on-brand Cartwright "design" as a cartwright-design-v1 spec.

The shop owner's request: "${prompt}"

Rules:
- schema MUST be "cartwright-design-v1".
- slug: short, kebab-case, descriptive, unique-sounding (e.g. "midnight-press", "warm-atelier").
- name + description: ENGLISH, premium agency voice. description ≤ 240 chars.
- mode: "website" unless the request is clearly an e-commerce storefront.
- tokens.prefix: 2–4 lowercase letters, unique (matches /^[a-z][a-z0-9]*$/).
- tokens.palette: 6 cohesive hex colours (accent, accentDeep, cream, sand, ink, muted) that fit the requested mood. For dark designs, ink/sand are the dark canvas + surface; cream is the light text.
- tokens.fonts: optional { sans, mono } — distinctive, NOT Inter/Roboto/Arial.
- sections: an ordered, COHERENT page (4–8 sections) using ONLY the allowed section types (hero, value-props, feature-grid, how-it-works, stack-grid, cta-footer). Start with a hero and end with a cta-footer. Write real, specific ENGLISH copy for every field — no placeholders.

Return ONLY the spec object.`,
      }),
  );

  return DesignMdSchema.parse(object);
}
