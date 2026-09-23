import "server-only";

import { activeDeps, loadGenome } from "@/lib/genome/store";
import { getActiveDesign, getActiveTheme } from "@/lib/theme";
import {
  buildV0SystemText,
  type BrandVoice,
  type ReskinPalette,
} from "@/lib/magic/reskin-text";

/**
 * Magic Builder — cohesion re-skin (server glue over the pure text builders).
 *
 * Gathers render-safe brand inputs (genome identity anchors + active palette;
 * NEVER calls an LLM — readField-style) and feeds them to the pure builders in
 * reskin-text.ts. Color cohesion for catalog atoms is automatic via the injected
 * CSS vars, so this only adds VOICE (and palette guidance for the v0 path).
 */

export { withBrandVoice } from "@/lib/magic/reskin-text";
export type { BrandVoice } from "@/lib/magic/reskin-text";

/** Render-safe brand voice from genome identity anchors (override ?? anchor). */
export async function getBrandVoice(): Promise<BrandVoice> {
  const genome = await loadGenome();
  const d = activeDeps(genome);
  return {
    storeName: d.storeName,
    tone: d.tone,
    audience: d.audience,
    formality: d.formality,
    vibe: d.vibe,
  };
}

/** Active palette: themeJson override first, else the DesignPack's palette. */
async function getActivePalette(): Promise<ReskinPalette | null> {
  const theme = await getActiveTheme();
  if (theme) return theme;
  const design = await getActiveDesign();
  return design?.tokens.palette ?? null;
}

/** Build the v0 system prompt seeded with brand palette + voice. */
export async function buildV0System(storeName: string): Promise<string> {
  const [voice, palette] = await Promise.all([getBrandVoice(), getActivePalette()]);
  return buildV0SystemText({ storeName, voice, palette });
}
