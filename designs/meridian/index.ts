/**
 * "Meridian" design — DesignPack registration.
 *
 * A premium, crisp-modern light SaaS homepage built as real code (not the
 * governed section-builder): hand-crafted components, a LOCKED light theme (no
 * `dark:` variants → no OS dark-mode leak), distinctive fonts (Sora display /
 * Plus Jakarta Sans body / Space Mono labels via next/font), CSS gradient-mesh +
 * dot-grid visuals, sharp bordered cards with soft shadows, and CSS-only motion.
 * No 3D. Selectable like any design in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import MeridianHomepage from "./homepage";
import { MeridianHeader, MeridianFooter } from "./chrome";

export const meridianDesign: DesignPack = {
  slug: "meridian",
  name: "Meridian (crisp modern SaaS)",
  description:
    "Premium crisp-modern light SaaS design — cool near-white + slate neutrals with one confident electric-blue accent. CSS gradient-mesh hero, sharp bordered cards + soft shadows, precise grid, mono labels, keyboard-hint chips. Locked light theme (no OS dark-mode flip). No 3D — pure CSS motion.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "mer",
    palette: {
      accent: "#2563ff",
      accentDeep: "#143a9c",
      cream: "#f7f9fc",
      sand: "#e6ebf3",
      ink: "#0c1322",
      muted: "#5b6577",
    },
    extraTokens: {
      "color-mer-blue": "#2563ff",
      "color-mer-blue-deep": "#143a9c",
      "color-mer-teal": "#06b6d4",
    },
    fonts: {
      sans: "Plus Jakarta Sans, system-ui, sans-serif",
      mono: "Space Mono, ui-monospace, monospace",
    },
  },
  homepage: MeridianHomepage,
  // Meridian owns its frame: a crisp light header (comet mark + storeName) + a
  // hairline footer — instead of the shared store chrome.
  siteChrome: { Header: MeridianHeader, Footer: MeridianFooter },
};
