import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { GENOME_FIELD_KEYS, type GenomeFieldKey } from "@/lib/genome/fields";
import { applyFieldOverride } from "@/lib/genome/apply";
import { resolveField } from "@/lib/genome/resolve";
import { inspectGenome } from "@/lib/genome/inspect";
import { applyIdentityAnchor, reharmonizeAll } from "@/lib/genome/identity";
import { describeBusiness } from "@/lib/genome/describe";

/**
 * AI tools for the Resolvable Genome — the operator says "set the footer tagline
 * to X" or "re-resolve the footer in a playful voice" and the assistant calls
 * genome.set / genome.resolve. Shares the apply/resolve core with /admin/genome
 * (one code path). Scope reuses settings:read/write (genome fields are settings)
 * — admin-only, never customer chat.
 */

const fieldKeyEnum = z.enum([...GENOME_FIELD_KEYS] as [string, ...string[]]);

export const getGenomeTool = defineTool({
  name: "genome.get",
  description:
    "Get the Resolvable Genome snapshot: every registered field with its anchor (config default), current override, last resolved value, what renders now, and status (anchor|override|resolved|stale), plus the active identity deps (tone/audience/formality/vibe). Read-only.",
  scope: "settings:read",
  input: z.object({}),
  skipAudit: true,
  handler: async () => inspectGenome(),
});

export const setGenomeTool = defineTool({
  name: "genome.set",
  description:
    "Set or reset a genome field override. key: one of the registered field keys. value: the exact string to pin (validated against the field schema), or null to reset to anchor/resolver. Applies instantly (30s cache). Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    key: fieldKeyEnum,
    value: z.string().nullable(),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    {
      name: "Pin footer tagline",
      body: { key: "footer.tagline", value: "Coffee worth slowing down for.", confirm: true },
    },
    {
      name: "Reset footer tagline to anchor",
      body: { key: "footer.tagline", value: null, confirm: true },
    },
  ],
  handler: async (args, ctx) => {
    const result = await applyFieldOverride(
      args.key as GenomeFieldKey,
      args.value,
      ctx.actor,
    );
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const resolveGenomeTool = defineTool({
  name: "genome.resolve",
  description:
    "Trigger LLM resolution of a genome field in the current brand voice (identity tone/audience/formality/vibe). Writes the result to the resolved-cache so it renders without further LLM calls. No-op if an override is pinned. Requires confirm: true.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    key: fieldKeyEnum,
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    { name: "Resolve footer tagline", body: { key: "footer.tagline", confirm: true } },
  ],
  handler: async (args, ctx) => {
    const result = await resolveField(args.key as GenomeFieldKey, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const setIdentityTool = defineTool({
  name: "genome.set_identity",
  description:
    "Set a brand identity anchor that resolvable fields harmonize to. key: tone | audience | formality | vibe. tone: professional|playful|luxurious|technical|warm. audience: general|business|consumer|enthusiast. formality: formal|balanced|casual. vibe: free-form 2-40 chars. Fields depending on the changed anchor go stale — call genome.reharmonize to re-resolve them. Requires confirm: true. Revertible.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    key: z.enum(["tone", "audience", "formality", "vibe"]),
    value: z.string(),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    { name: "Make the voice playful", body: { key: "tone", value: "playful", confirm: true } },
  ],
  handler: async (args, ctx) => {
    const result = await applyIdentityAnchor(args.key, args.value, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const reharmonizeTool = defineTool({
  name: "genome.reharmonize",
  description:
    "Re-resolve every resolvable genome field against the current identity anchors — the self-harmonizing rebrand. Pinned overrides stay; anchored/legal fields are skipped; fresh caches are reused (no redundant LLM calls). Requires confirm: true.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  handler: async (_args, ctx) => ({ results: await reharmonizeAll(ctx.actor) }),
});

export const describeBusinessTool = defineTool({
  name: "genome.describe_business",
  description:
    "Spawn the brand voice from one sentence: infer the identity anchors (tone/audience/formality/vibe) from a plain-English description of the business, set them, and re-resolve every resolvable field. The 'describe your business → it writes itself' move. Requires confirm: true. Revertible.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    sentence: z.string().min(8),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    {
      name: "Spawn from a sentence",
      body: {
        sentence: "We roast small-batch single-origin coffee for calm slow mornings.",
        confirm: true,
      },
    },
  ],
  handler: async (args, ctx) => {
    const result = await describeBusiness(args.sentence, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const genomeTools = [
  getGenomeTool,
  setGenomeTool,
  resolveGenomeTool,
  setIdentityTool,
  reharmonizeTool,
  describeBusinessTool,
];
