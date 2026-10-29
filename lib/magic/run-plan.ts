import type { PagePlan, PagePlanNode, MagicSource } from "@/lib/magic/plan-schema";
import type { GeneratedSection, NodeStatus, SourceAdapter } from "@/lib/magic/types";
import type { PageLayout } from "@/lib/builder/section-schema";

/**
 * Magic Builder — page-plan orchestration (pure; adapters injected).
 *
 * Runs every plan node through its source adapter CONCURRENTLY (Mixer 2.0
 * Phase 3 "magic speed": the per-section LLM calls dominate wall-time, so N
 * sequential calls become ~max(call) instead of sum — typically 5-15s → 3-5s).
 * Output order is assembled by plan index, so it is exactly the plan order
 * regardless of which adapter resolves first.
 *
 * Fail-soft per node is preserved: a node whose adapter throws (or whose source
 * has no adapter) is recorded as an explicit `skipped` status with a reason and
 * EXCLUDED from the sections — it is never dropped silently and never persisted.
 * Pure (no DB/LLM/registry imports) so it's deterministically unit-tested; the
 * server wrapper passes the real SOURCE_ADAPTERS.
 */

export type RunPlanResult = {
  /** Successfully generated sections, in plan order — ready for layoutJson. */
  sections: GeneratedSection[];
  /** One status per planned node (done | skipped-with-reason), in plan order. */
  statuses: NodeStatus[];
};

/** Per-node progress callback — fires the moment THAT node settles (any order). */
export type NodeProgress = (index: number, status: NodeStatus) => void;

/** Generate ONE plan node through its adapter — never throws (fail-soft). */
export async function generatePlanNode(
  node: PagePlanNode,
  adapters: Record<MagicSource, SourceAdapter>,
): Promise<NodeStatus> {
  const adapter = adapters[node.source];
  if (!adapter) {
    return {
      state: "skipped",
      key: node.key,
      source: node.source,
      reason: `Ukendt kilde: ${node.source}`,
    };
  }
  try {
    const generated = await adapter(node.key, node.prompt);
    // PART 4: the effect is plan-time metadata (not the adapter's job) — attach
    // it to the section so it flows through to the layout node. "none" is the
    // explicit opt-out and is equivalent to omitting the field.
    const section: GeneratedSection =
      node.effect && node.effect !== "none"
        ? { ...generated, effect: node.effect }
        : generated;
    return { state: "done", key: node.key, source: node.source, section };
  } catch (err) {
    return {
      state: "skipped",
      key: node.key,
      source: node.source,
      reason: err instanceof Error ? err.message : "Generering fejlede",
    };
  }
}

/**
 * Run the whole plan with all nodes generating in parallel. `onNode` (optional)
 * fires as each node settles — the streaming route uses it to push sections to
 * the client the moment they exist, while the returned result stays strictly
 * plan-ordered.
 */
export async function runPlan(
  plan: PagePlan,
  adapters: Record<MagicSource, SourceAdapter>,
  onNode?: NodeProgress,
): Promise<RunPlanResult> {
  // generatePlanNode never rejects, so Promise.all keeps every node's outcome
  // (allSettled semantics, with the fail-soft folded into each task).
  const statuses = await Promise.all(
    plan.sections.map(async (node, index) => {
      const status = await generatePlanNode(node, adapters);
      onNode?.(index, status);
      return status;
    }),
  );

  const sections = statuses
    .filter((s): s is Extract<NodeStatus, { state: "done" }> => s.state === "done")
    .map((s) => s.section);

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
