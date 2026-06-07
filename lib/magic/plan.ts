import "server-only";

import { generateObject } from "ai";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";
import {
  pagePlanSchema,
  MAX_PLAN_SECTIONS,
  type PagePlan,
} from "@/lib/magic/plan-schema";
import { SOURCE_ADAPTERS } from "@/lib/magic/sources";
import { runPlan, sectionsToLayout, type RunPlanResult } from "@/lib/magic/run-plan";
import type { PageLayout } from "@/lib/builder/section-schema";

/**
 * Magic Builder — server-side page planning (the AI step).
 *
 * Mirror of lib/builder/section-generator.ts: chatModelResolved("vibe") (forces
 * Anthropic for reliable structured output) + withAuditContext. The plan schema
 * is built from a real z.enum of section keys, so the model's JSON-Schema only
 * offers whitelisted keys — composition itself is governed, never free-form.
 */

/** Human-readable menu of the section catalog for the planning prompt. */
function sectionMenu(): string {
  return (Object.entries(SECTION_REGISTRY) as [string, { label: string }][])
    .map(([key, def]) => `- ${key}: ${def.label}`)
    .join("\n");
}

/** Plan a page into an ordered list of whitelisted section nodes (no writes). */
export async function planPage(intent: string): Promise<PagePlan> {
  const resolved = await chatModelResolved("vibe");

  const { object } = await withAuditContext(
    { provider: resolved.provider, model: resolved.model, modality: "text" },
    () =>
      generateObject({
        model: resolved.handle,
        schema: pagePlanSchema,
        prompt: `Du planlægger en hel dansk webside som en ORDNET liste af sektioner.

Tilgængelige sektionstyper (vælg KUN blandt disse keys):
${sectionMenu()}

Butiksejerens ønske: "${intent}"

Returnér en 'sections'-liste (max ${MAX_PLAN_SECTIONS}) i den rækkefølge de skal vises på siden. For hver sektion:
- vælg den bedst matchende key fra listen,
- sæt source="catalog" (standard — on-brand, valideret). Brug KUN source="v0" hvis sektionen kræver en helt bespoke visuel struktur kataloget ikke kan udtrykke,
- skriv en kort, konkret dansk 'prompt' der beskriver præcis hvad netop DEN sektion skal indeholde for denne side.`,
      }),
  );

  return pagePlanSchema.parse(object);
}

export type PlanAndGenerateResult = RunPlanResult & {
  plan: PagePlan;
  layout: PageLayout;
};

/**
 * Plan a page, then generate every node through its source adapter (fail-soft).
 * Returns the plan, per-node statuses, the generated sections, and the assembled
 * PageLayout ready for the admin to review + publish via pages.set_layout.
 */
export async function planAndGenerate(intent: string): Promise<PlanAndGenerateResult> {
  const plan = await planPage(intent);
  const result = await runPlan(plan, SOURCE_ADAPTERS);
  return { plan, layout: sectionsToLayout(result.sections), ...result };
}
