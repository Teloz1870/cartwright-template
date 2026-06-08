import type { PagePlan, MagicSource } from "@/lib/magic/plan-schema";
import type { GeneratedSection, NodeStatus, SourceAdapter } from "@/lib/magic/types";
import type { PageLayout } from "@/lib/builder/section-schema";

/**
 * Magic Builder — page-plan orchestration (pure; adapters injected).
 *
 * Runs each plan node through its source adapter, in order. Fail-soft: a node
 * whose adapter throws (or whose source has no adapter) is recorded as an
 * explicit `skipped` status with a reason and EXCLUDED from the sections — it is
 * never dropped silently and never persisted. Pure (no DB/LLM/registry imports)
 * so it's deterministically unit-tested; the server wrapper passes the real
 * SOURCE_ADAPTERS.
 */

export type RunPlanResult = {
  /** Successfully generated sections, in plan order — ready for layoutJson. */
  sections: GeneratedSection[];
  /** One status per planned node (done | skipped-with-reason). */
  statuses: NodeStatus[];
};

export async function runPlan(
  plan: PagePlan,
  adapters: Record<MagicSource, SourceAdapter>,
): Promise<RunPlanResult> {
  const sections: GeneratedSection[] = [];
  const statuses: NodeStatus[] = [];

  for (const node of plan.sections) {
    const adapter = adapters[node.source];
    if (!adapter) {
      statuses.push({
        state: "skipped",
        key: node.key,
        source: node.source,
        reason: `Ukendt kilde: ${node.source}`,
      });
      continue;
    }
    try {
      const generated = await adapter(node.key, node.prompt);
      // PART 4: the effect is plan-time metadata (not the adapter's job) — attach
      // it to the section so it flows through to the layout node.
      const section: GeneratedSection = node.effect
        ? { ...generated, effect: node.effect }
        : generated;
      sections.push(section);
      statuses.push({ state: "done", key: node.key, source: node.source, section });
    } catch (err) {
      statuses.push({
        state: "skipped",
        key: node.key,
        source: node.source,
        reason: err instanceof Error ? err.message : "Generering fejlede",
      });
    }
  }

  return { sections, statuses };
}

/**
 * Convert generated sections into a builder PageLayout (the publish input).
 * Node ids are deterministic (`${key}-${index}`) so repeated keys stay unique
 * and the result passes pageLayoutSchema's duplicate-id refinement. The admin
 * still reviews + publishes through pages.set_layout (Zod re-validate + audit).
 */
export function sectionsToLayout(sections: GeneratedSection[]): PageLayout {
  return {
    sections: sections.map((s, i) => ({
      id: `${s.key}-${i}`,
      key: s.key,
      enabled: true,
      props: s.props,
      ...(s.effect ? { effect: s.effect } : {}),
    })),
  };
}
