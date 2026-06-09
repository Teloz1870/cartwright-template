/**
 * "Editorial Ink" design — DesignPack registration.
 *
 * A premium, light EDITORIAL / magazine homepage built as real code (not the
 * governed section-builder): hand-crafted components, a LOCKED light theme (no
 * `dark:` variants → no OS dark-mode leak), characterful serif display
 * (Fraunces) + clean grotesque body (Hanken Grotesk) + mono eyebrow (Space Mono)
 * via next/font, and CSS-only motion. No 3D. Selectable like any design in
 * /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import EditorialInkHomepage from "./homepage";

export const editorialInkDesign: DesignPack = {
  slug: "editorial-ink",
  name: "Editorial Ink (magazine / publication)",
  description:
    "Premium light editorial design — warm paper canvas, deep ink, a single restrained oxblood accent. Characterful Fraunces serif + Hanken Grotesk body + Space Mono eyebrow, hairline rules, drop-cap lede, big pull-quote. Locked light theme. No 3D.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "edi",
    palette: {
      accent: "#7c2230",
      accentDeep: "#511620",
      cream: "#f6f1e7",
      sand: "#c9bca2",
      ink: "#1c1916",
      muted: "#6b6356",
    },
    extraTokens: {
      "color-edi-paper": "#f6f1e7",
      "color-edi-oxblood": "#7c2230",
      "color-edi-ink": "#1c1916",
    },
    fonts: {
      sans: "Hanken Grotesk, system-ui, sans-serif",
      mono: "Space Mono, ui-monospace, monospace",
    },
  },
  homepage: EditorialInkHomepage,
};
