/**
 * PART 4 — Motion & Effects: the `data-motion` resolver.
 *
 * `data-motion` on <html> (set in app/layout.tsx) is the single switch the whole
 * motion engine (themes/motion.css) reads. The CSS ships unconditionally, but
 * every effect rule is scoped to `:root[data-motion="subtle"|"bold"]` — so when
 * this returns "off" (the default, master flag down) NO rule matches and the
 * render is byte-identical to pre-PART-4 (the canary-safety invariant).
 *
 * Pure + fail-soft: never throws at render. Today it reads `brand.motionPreset`
 * (compile-time); a DB override (BrandingSettings.motionPresetJson) is a deferred
 * follow-up that would slot in here without touching the call site.
 */

export type MotionPresetValue = "subtle" | "bold" | "off";

const VALID: ReadonlySet<string> = new Set<MotionPresetValue>(["subtle", "bold", "off"]);

/** Sensible default when the flag is on but the preset is missing/garbage. */
const DEFAULT_ON: MotionPresetValue = "subtle";

/**
 * Resolve the `data-motion` attribute value.
 * - master flag off (or absent) ⇒ "off" (canary-safe, ignores preset)
 * - on + valid preset ⇒ that preset
 * - on + invalid/absent preset ⇒ "subtle" (fail-soft)
 */
export function resolveMotionAttr(
  features: { motionEffects?: boolean } | null | undefined,
  motionPreset: { preset?: string } | null | undefined,
): MotionPresetValue {
  if (!features?.motionEffects) return "off";
  const preset = motionPreset?.preset;
  return preset && VALID.has(preset) ? (preset as MotionPresetValue) : DEFAULT_ON;
}
