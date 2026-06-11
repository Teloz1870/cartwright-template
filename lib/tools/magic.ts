import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { getBrand } from "@/lib/brand";
import { planPage, planAndGenerate } from "@/lib/magic/plan";

/**
 * Magic Builder tools — let an AI/chat surface drive the prompt-driven page
 * builder with the plan-first guarantee. Both are READ-ONLY (scope pages:read,
 * skipAudit): they plan/generate but write NOTHING. Publishing is a separate,
 * human-witnessed call to pages.set_layout (confirm-gated + audited + revertible)
 * — the AI can never self-publish a page. Gated by brand.features.magicBuilder.
 */

async function assertEnabled(): Promise<void> {
  const brand = await getBrand();
  if (!brand.features.magicBuilder) {
    throw new Error("Magic Builder er ikke aktiveret (brand.features.magicBuilder).");
  }
}

export const planPageTool = defineTool({
  name: "magic.plan_page",
  description:
    "Plan a whole page as an ordered list of whitelisted section keys (each with a source and a per-section prompt). Read-only: generates and writes NOTHING — returns the plan for review. The model can only plan whitelisted catalog sections.",
  scope: "pages:read",
  skipAudit: true,
  input: z.object({
    intent: z
      .string()
      .min(8)
      .describe("Describe the whole page to plan, e.g. 'a coffee subscription landing page'"),
  }),
  examples: [
    {
      name: "Plan a coffee landing page",
      body: { intent: "En landingsside for et kafferisteri: hero, værdi-kort, priser, anmeldelser, FAQ og en CTA" },
    },
  ],
  handler: async (args: { intent: string }) => {
    await assertEnabled();
    const plan = await planPage(args.intent);
    return { sections: plan.sections };
  },
});

export const generatePageTool = defineTool({
  name: "magic.generate_page",
  description:
    "Plan AND generate a whole page (every section filled on-brand, fail-soft). Read-only: returns the assembled, Zod-valid PageLayout plus per-node statuses (done | skipped-with-reason) WITHOUT writing. To publish, pass the returned layout to pages.set_layout (confirm-gated, audited, revertible) — this tool never self-publishes.",
  scope: "pages:read",
  skipAudit: true,
  input: z.object({
    intent: z.string().min(8).describe("Describe the whole page to build"),
  }),
  examples: [
    {
      name: "Build a coffee landing page",
      body: { intent: "En landingsside for et kafferisteri med hero, priser og anmeldelser" },
    },
  ],
  handler: async (args: { intent: string }) => {
    await assertEnabled();
    const { plan, layout, statuses, sections } = await planAndGenerate(args.intent);
    return {
      layout,
      statuses,
      planned: plan.sections.length,
      generated: sections.length,
    };
  },
});

export const magicTools = [planPageTool, generatePageTool];
