/**
 * Aurora (website) — DesignPack registration.
 *
 * The Cartwright flagship DEFAULT for website-mode (free, not premium). Composed
 * from the shared section atoms; `applyPaletteAsTheme: true` maps its 6-colour
 * palette onto BOTH the sol-* chrome and the cw-* atom tokens at runtime, so the
 * homepage adopts the active brand's palette (themeJson) when one is set, and the
 * Aurora default otherwise. No themes/aurora.css needed (the cw-* core would
 * collide with themes/studio.css — runtime injection is the correct mechanism).
 */
import type { DesignPack } from "../types";
import AuroraSiteHomepage from "./homepage";

export const auroraSiteDesign: DesignPack = {
  slug: "aurora-site",
  name: "Aurora — Website (Cartwright default)",
  description:
    "The flagship Cartwright website default. Light, airy and modern — composed from the same section atoms the Magic Builder uses, so the homepage and the builder are one design system. Adopts your brand palette automatically.",
  mode: "website",
  premium: false,
  source: "index.ts",
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#5b54f0",
      accentDeep: "#4138c7",
      cream: "#fdfcfb",
      sand: "#f3f1ee",
      ink: "#18171f",
      muted: "#6c6a78",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: AuroraSiteHomepage,
};
