import type { SectionKey } from "@/lib/builder/section-registry";
import type { MagicSource } from "@/lib/magic/plan-schema";
import type { SectionEffectValue } from "@/lib/builder/effects";

/**
 * Magic Builder — shared types for the prompt-driven page builder.
 *
 * Every generation source (the curated catalog, v0, and — design-only, never
 * shipped — 21st.dev) normalizes to ONE shape: a whitelisted section `key` plus
 * a validated `props` payload. That single contract is why Cartwright is never
 * locked to any one generator and why the governed publish path
 * (pages.set_layout → Zod → audit → revert) is identical regardless of source.
 */

/** One generated section, normalized to the builder's node shape (props only — never code). */
export type GeneratedSection = {
  key: SectionKey;
  props: Record<string, unknown>;
  /** Optional motion effect chosen by the planner (PART 4) — threaded to the layout node. */
  effect?: SectionEffectValue;
};

/** A source turns a per-node prompt into a validated, whitelisted section. */
export type SourceAdapter = (
  key: SectionKey,
  prompt: string,
) => Promise<GeneratedSection>;

/** Per-node status surfaced in the panel — partial failure is never silent. */
export type NodeStatus =
  | { state: "pending"; key: SectionKey; source: MagicSource }
  | { state: "done"; key: SectionKey; source: MagicSource; section: GeneratedSection }
  | { state: "skipped"; key: SectionKey; source: MagicSource; reason: string };
