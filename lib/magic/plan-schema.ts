import { z } from "zod";
import { SECTION_REGISTRY, type SectionKey } from "@/lib/builder/section-registry";

/**
 * Magic Builder — page-PLAN schema (the composition-is-governed core).
 *
 * A page-level prompt is structurally constrained to emit only an ordered array
 * of { key, source, prompt }. `key` is a real `z.enum` built from the section
 * registry (NOT a loose `z.string().refine`), so the JSON-Schema handed to the
 * model LISTS the allowed section keys — the model literally cannot plan a
 * section that isn't whitelisted. Each node is then filled by its own source
 * adapter against the section's strict propsSchema. Full-page generation can
 * never produce arbitrary structure, tags, colors or fonts.
 *
 * `source` excludes "21st-dev" by design — that path is licensing-blocked and
 * not shippable (see the Magic Builder plan, Phase 5).
 */

/** Generation sources the planner may choose. Catalog is the default, governed path. */
export const MAGIC_SOURCES = ["catalog", "v0"] as const;
export type MagicSource = (typeof MAGIC_SOURCES)[number];

// Real enum of whitelisted keys → constrains generation, not just validation.
const SECTION_KEYS = Object.keys(SECTION_REGISTRY) as [SectionKey, ...SectionKey[]];
export const sectionKeyEnum = z.enum(SECTION_KEYS);

/** Soft cap: a page plan over this many sections costs too much + rarely coheres. */
export const MAX_PLAN_SECTIONS = 12;

export const pagePlanNodeSchema = z.object({
  /** Whitelisted section key (enum → model only ever sees valid options). */
  key: sectionKeyEnum,
  /** Which generator fills this node. Defaults to the governed catalog path. */
  source: z.enum(MAGIC_SOURCES).default("catalog"),
  /** Per-section intent the source adapter turns into props. */
  prompt: z.string().min(1),
});

export const pagePlanSchema = z.object({
  sections: z.array(pagePlanNodeSchema).min(1).max(MAX_PLAN_SECTIONS),
});

export type PagePlan = z.infer<typeof pagePlanSchema>;
export type PagePlanNode = z.infer<typeof pagePlanNodeSchema>;
