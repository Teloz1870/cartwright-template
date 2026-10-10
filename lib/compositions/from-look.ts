/**
 * Looks → full compositions (Mixer 2.0 Phase 2).
 *
 * A curated Look (verticals/looks.ts) is a Skin × Voice pairing; a composition
 * is the SAME pairing expanded into the one-file installable artifact
 * (cartwright-composition-v1): the Voice's identity anchors, pre-written
 * genome copy, palette and 3D scene are inlined from its preset, plus the
 * Look's optional chrome selection. This powers "Download this look" on
 * cartwright.app — the marketplace manifest emits each look WITH its
 * composition (additive within manifest v3).
 *
 * No `server-only`: verticals/index.ts is a plain data registry, so this is
 * safe for the gen-manifest script (tsx) and unit tests. The output is typed
 * as Composition; the marketplace-manifest test parses every emitted
 * composition against CompositionSchema, so a look that drifts out of the
 * registries fails CI.
 */
import { getVertical } from "@/verticals";
import type { LookEntry } from "@/verticals/looks";
import { COMPOSITION_SCHEMA_ID } from "./spec";
import type { Composition } from "./spec";

/** Expand a curated Look into a full composition. Null if its voice slug is unknown. */
export function lookToComposition(look: LookEntry): Composition | null {
  const preset = getVertical(look.voiceSlug);
  if (!preset) return null;

  const identity = Object.keys(preset.identity).length ? preset.identity : undefined;
  const genomeOverrides = Object.keys(preset.genomeOverrides).length
    ? (preset.genomeOverrides as Record<string, string>)
    : undefined;

  return {
    schema: COMPOSITION_SCHEMA_ID,
    name: look.name,
    description: look.description.slice(0, 280),
    skin: look.designSlug,
    ...(preset.palette ? { palette: preset.palette } : {}),
    ...(identity || genomeOverrides
      ? {
          voice: {
            ...(identity ? { identity } : {}),
            ...(genomeOverrides ? { genomeOverrides } : {}),
          },
        }
      : {}),
    ...(look.chrome ? { chrome: look.chrome } : {}),
    ...(preset.scene ? { scene: preset.scene } : {}),
  };
}
