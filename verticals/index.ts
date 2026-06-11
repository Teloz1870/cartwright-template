/**
 * Vertical / Voice preset registry — SERVER entry-point.
 *
 * Register a new vertical by importing its preset here and adding it to the
 * VERTICALS map. The client-safe metadata in verticals/options.ts is derived
 * from these, so admin pickers + the marketplace gallery pick it up.
 *
 * Mirrors designs/index.ts ↔ designs/options.ts. This file carries the full
 * presets (identity + genome copy bodies); options.ts carries metadata only.
 */
import type { VerticalPreset } from "./types";
import { kindergartenPreset } from "./kindergarten/preset";
import { carpenterPreset } from "./carpenter/preset";
import { cafePreset } from "./cafe/preset";
import { salonPreset } from "./salon/preset";
import { fablePreset } from "./fable/preset";

const VERTICALS: Record<string, VerticalPreset> = {
  kindergarten: kindergartenPreset,
  carpenter: carpenterPreset,
  cafe: cafePreset,
  salon: salonPreset,
  fable: fablePreset,
};

/** Look up a vertical preset by slug. Returns null for an unknown slug. */
export function getVertical(slug: string | null | undefined): VerticalPreset | null {
  if (!slug) return null;
  return VERTICALS[slug] ?? null;
}

/** All presets (server-only consumers: apply, generators). */
export function allVerticals(): VerticalPreset[] {
  return Object.values(VERTICALS);
}

export { VERTICAL_OPTIONS } from "./options";
export type { VerticalPreset, VerticalOption } from "./types";
