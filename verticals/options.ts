/**
 * Vertical / Voice preset metadata — CLIENT-SAFE.
 *
 * Derived from the presets (which are pure data — no React / server-only), so
 * client components (admin VerticalsPanel, the mixer) can list verticals without
 * pulling the server-only apply path. Mirrors designs/options.ts.
 */
import type { VerticalOption, VerticalPreset } from "./types";
import { kindergartenPreset } from "./kindergarten/preset";
import { carpenterPreset } from "./carpenter/preset";
import { cafePreset } from "./cafe/preset";
import { salonPreset } from "./salon/preset";
import { fablePreset } from "./fable/preset";
import { dentistPreset } from "./dentist/preset";
import { restaurantPreset } from "./restaurant/preset";
import { fitnessPreset } from "./fitness/preset";

function toOption(p: VerticalPreset): VerticalOption {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    keywords: p.keywords,
    suggestedDesignSlug: p.suggestedDesignSlug,
  };
}

export const VERTICAL_OPTIONS: VerticalOption[] = [
  toOption(kindergartenPreset),
  toOption(carpenterPreset),
  toOption(cafePreset),
  toOption(salonPreset),
  toOption(fablePreset),
  toOption(dentistPreset),
  toOption(restaurantPreset),
  toOption(fitnessPreset),
];
