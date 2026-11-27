/**
 * PART 4 Track B — the per-section motion vocabulary (single source of truth).
 *
 * A section node carries an optional `effect` chosen from THIS whitelist (the
 * Magic Builder's AI can assign one too — see lib/magic/plan-schema.ts — but
 * only ever a performant, on-brand value). Each maps 1:1 to a `.motion-*`
 * utility class in themes/motion.css (compositor-only transform/opacity,
 * reduced-motion + @supports guarded, and itself scoped to data-motion).
 *
 * Isomorphic (no server-only/DB) — bundled into both the storefront render seam
 * and the client live-preview.
 */
import { z } from "zod";

export const SECTION_EFFECTS = [
  "fade-up",
  "fade",
  "zoom-in",
  "slide-left",
  "slide-right",
  "parallax",
] as const;

export type SectionEffect = (typeof SECTION_EFFECTS)[number];

/** "none" is an explicit opt-out (== omitting the field → no class applied). */
export const sectionEffectSchema = z.enum([...SECTION_EFFECTS, "none"]);

export type SectionEffectValue = z.infer<typeof sectionEffectSchema>;

const EFFECT_SET: ReadonlySet<string> = new Set(SECTION_EFFECTS);

/**
 * Map a section's `effect` to its motion utility class, or null when it should
 * NOT be wrapped: "none", absent, empty, or anything off the whitelist. null ⇒
 * PageSections emits the bare Fragment ⇒ byte-identical render.
 */
export function sectionEffectClass(
  effect: string | null | undefined,
): string | null {
  if (!effect || effect === "none") return null;
  return EFFECT_SET.has(effect) ? `motion-${effect}` : null;
}
