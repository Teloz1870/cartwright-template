/**
 * "Brutalist" design — DesignPack registration.
 *
 * A premium, neo-brutalist agency homepage built as real code (not the governed
 * section-builder): hand-crafted components, a LOCKED light theme (no `dark:`
 * variants → no OS dark-mode leak), monospace + bold-grotesque type (Archivo /
 * Space Grotesk / Space Mono via next/font), hard (no-blur) drop-shadows, a
 * visible grid, an offset acid-lime slab and a marquee. CSS-only motion (NO 3D).
 * Selectable like any design in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import brutalistHomepage from "./homepage";
import { BrutalistHeader, BrutalistFooter } from "./chrome";

export const brutalistDesign: DesignPack = {
  slug: "brutalist",
  name: "Brutalist (raw / mono)",
  description:
    "Premium neo-brutalist design — paper-white canvas, hard black ink + thick black borders, one acid-lime accent. Monospace labels + bold grotesque headlines, hard drop-shadows, visible grid, offset slabs, marquee. Locked light theme. CSS-only, no 3D.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "bru",
    palette: {
      accent: "#c8ff00",
      accentDeep: "#9bcb00",
      cream: "#f5f3ec",
      sand: "#fffdf6",
      ink: "#0a0a0a",
      muted: "#5a5a52",
    },
    extraTokens: {
      "color-bru-acid": "#c8ff00",
      "color-bru-acid-deep": "#9bcb00",
      "color-bru-hot": "#ff3d00",
    },
    fonts: {
      sans: "Space Grotesk, system-ui, sans-serif",
      mono: "Space Mono, ui-monospace, monospace",
    },
  },
  homepage: brutalistHomepage,
  // Brutalist owns its frame: a hard-bordered paper header (sunburst mark +
  // storeName) + a mono uppercase footer — instead of the shared store chrome.
  siteChrome: { Header: BrutalistHeader, Footer: BrutalistFooter },
};
