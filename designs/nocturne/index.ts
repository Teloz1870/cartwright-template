/**
 * "Nocturne" design — DesignPack registration.
 *
 * A premium, dark ORGANIC-luxe homepage built as real code (not the governed
 * section-builder): hand-crafted components, a LOCKED dark theme (no `dark:`
 * variants → no OS dark-mode leak), an editorial italic serif display
 * (Fraunces) over a clean grotesque body (Manrope) via next/font, the shared
 * palette-driven 3D aurora hero (DesignHero) behind a CSS-aurora fallback, and
 * CSS-only motion. Selectable like any design in /admin/designs.
 *
 * Aesthetic: midnight aubergine canvas · warm champagne gold accent · soft
 * cream text · flowing rounded organic shapes · soft glows — a high-end
 * spirits / fragrance / architecture-studio register. Calm, sophisticated.
 *
 * This is the "premium from day one" path: ships as a code module, flows
 * through the mirror → cartwright-template → create-cartwright pipeline, and a
 * customer picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import NocturneHomepage from "./homepage";
import { NocturneHeader, NocturneFooter } from "./chrome";

export const nocturneDesign: DesignPack = {
  slug: "nocturne",
  name: "Nocturne (dark organic, 3D)",
  description:
    "Premium dark-organic luxe design — midnight aubergine canvas + warm champagne gold + soft cream. Palette-driven 3D aurora hero, italic Fraunces display, organic rounded shapes, soft glows, bento layout. Locked dark theme. Real code for full design freedom.",
  mode: "website",
  chrome: "dark",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "noc",
    palette: {
      accent: "#e9c789",
      accentDeep: "#c79a52",
      cream: "#f3ebe1",
      sand: "#1e1525",
      ink: "#160f1c",
      muted: "#9a8aa0",
    },
    extraTokens: {
      "color-noc-gold": "#e9c789",
      "color-noc-plum": "#4a2c52",
      "color-noc-rose": "#b8657a",
    },
    fonts: {
      sans: "Manrope, system-ui, sans-serif",
      mono: "Fraunces, Georgia, serif",
    },
  },
  homepage: NocturneHomepage,
  // Nocturne owns its frame: a midnight header (constellation mark + storeName
  // in Fraunces italic) + a candle-lit footer — instead of the shared store chrome.
  siteChrome: { Header: NocturneHeader, Footer: NocturneFooter },
};
