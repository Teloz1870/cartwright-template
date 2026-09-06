/**
 * Crema — brew math, extracted so the calculator island and the pack's
 * WebMCP tool (`calculate_brew_ratio`) compute from ONE source and can never
 * drift. Pure functions: no DB, no network, no DOM.
 *
 * One cup = 2 dl (200 g water); ratios match the shop's own brewing guide
 * (1:15 strong · 1:16 balanced · 1:17 bright) — 2 cups at 1:16 = 25 g
 * coffee / 400 g water.
 */

export const CUP_G = 200;

export const RATIOS = [15, 16, 17] as const;
export type Ratio = (typeof RATIOS)[number];

/** Agent-facing strength vocabulary → ratio (the tool's input enum). */
export const STRENGTH_RATIO = {
  strong: 15,
  balanced: 16,
  bright: 17,
} as const satisfies Record<string, Ratio>;
export type Strength = keyof typeof STRENGTH_RATIO;

export function computeBrew(cups: number, ratio: Ratio) {
  const waterGrams = cups * CUP_G;
  const coffeeGrams = Math.round(waterGrams / ratio);
  return { cups, ratio: `1:${ratio}`, coffeeGrams, waterGrams };
}
