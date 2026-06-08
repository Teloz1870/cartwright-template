import { describe, expect, it } from "vitest";

import { runPlan, sectionsToLayout } from "@/lib/magic/run-plan";
import { pageLayoutSchema } from "@/lib/builder/section-schema";
import type { PagePlan, MagicSource } from "@/lib/magic/plan-schema";
import type { GeneratedSection, SourceAdapter } from "@/lib/magic/types";

/**
 * Magic Builder — page-plan orchestration (fail-soft contract).
 *
 * The security/UX review flagged silent partial failure ("user asks for 6
 * sections, silently gets 4") as unacceptable. runPlan must: run each node
 * through its source adapter, collect successful sections in order, and surface
 * EVERY failed node as an explicit `skipped` status with a reason — never drop
 * one silently. Adapters are injected so this is pure + deterministic.
 */

const ok =
  (key: GeneratedSection["key"]): SourceAdapter =>
  async (_k, _p) => ({ key, props: { ok: true } });

const boom: SourceAdapter = async () => {
  throw new Error("v0 quota reached");
};

function adapters(over: Partial<Record<MagicSource, SourceAdapter>> = {}): Record<MagicSource, SourceAdapter> {
  return { catalog: ok("hero"), v0: ok("vibe"), ...over };
}

const plan = (
  ...nodes: Array<{ key: string; source: MagicSource; prompt: string; effect?: string }>
): PagePlan => ({ sections: nodes } as unknown as PagePlan);

describe("runPlan", () => {
  it("returns a section per successful node, in plan order", async () => {
    const result = await runPlan(
      plan(
        { key: "hero", source: "catalog", prompt: "a" },
        { key: "featureGrid", source: "catalog", prompt: "b" },
      ),
      adapters({ catalog: async (k) => ({ key: k, props: {} }) }),
    );
    expect(result.sections.map((s) => s.key)).toEqual(["hero", "featureGrid"]);
    expect(result.statuses.every((s) => s.state === "done")).toBe(true);
  });

  it("skips a failing node with its reason and keeps the rest (never silent)", async () => {
    const result = await runPlan(
      plan(
        { key: "hero", source: "catalog", prompt: "a" },
        { key: "vibe", source: "v0", prompt: "bespoke" },
        { key: "featureGrid", source: "catalog", prompt: "c" },
      ),
      adapters({ catalog: async (k) => ({ key: k, props: {} }), v0: boom }),
    );
    // The failed node is excluded from sections but reported.
    expect(result.sections).toHaveLength(2);
    expect(result.statuses).toHaveLength(3);
    const skipped = result.statuses.filter((s) => s.state === "skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ state: "skipped", key: "vibe", source: "v0" });
    expect(skipped[0]).toHaveProperty("reason", "v0 quota reached");
  });

  it("threads the plan node's effect (PART 4) onto the generated section", async () => {
    const result = await runPlan(
      plan(
        { key: "hero", source: "catalog", prompt: "a", effect: "fade-up" },
        { key: "featureGrid", source: "catalog", prompt: "b" }, // no effect
      ),
      adapters({ catalog: async (k) => ({ key: k, props: {} }) }),
    );
    expect(result.sections[0].effect).toBe("fade-up");
    expect(result.sections[1].effect).toBeUndefined();
  });

  it("skips a node whose source has no adapter, with a clear reason", async () => {
    const partial = { catalog: ok("hero") } as unknown as Record<MagicSource, SourceAdapter>;
    const result = await runPlan(plan({ key: "vibe", source: "v0", prompt: "x" }), partial);
    expect(result.sections).toHaveLength(0);
    expect(result.statuses[0]).toMatchObject({ state: "skipped", source: "v0" });
  });
});

describe("sectionsToLayout", () => {
  const sections: GeneratedSection[] = [
    { key: "hero", props: { headline: "H", tagline: "T", ctaLabel: "C", ctaHref: "/x" } },
    { key: "hero", props: { headline: "H2", tagline: "T2", ctaLabel: "C2", ctaHref: "/y" } },
  ];

  it("maps sections to layout nodes with unique ids, enabled, preserving order + props", () => {
    const layout = sectionsToLayout(sections);
    expect(layout.sections).toHaveLength(2);
    const ids = layout.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(2); // unique even for repeated keys
    expect(layout.sections[0]).toMatchObject({ key: "hero", enabled: true });
    expect(layout.sections[0].props).toEqual(sections[0].props);
  });

  it("produces a layout that passes the real pageLayoutSchema", () => {
    const layout = sectionsToLayout(sections);
    expect(pageLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("writes a section's effect (PART 4) into the layout node and stays schema-valid", () => {
    const withEffect: GeneratedSection[] = [
      { key: "hero", props: sections[0].props, effect: "zoom-in" },
    ];
    const layout = sectionsToLayout(withEffect);
    expect(layout.sections[0]).toMatchObject({ effect: "zoom-in" });
    expect(pageLayoutSchema.safeParse(layout).success).toBe(true);
  });
});
