/**
 * "Engineered" design — DesignPack registration.
 *
 * A premium, dark-luxe agency homepage built as real code (not the governed
 * section-builder): hand-crafted components, a LOCKED dark theme (no `dark:`
 * variants → no OS dark-mode leak), distinctive fonts (Bricolage Grotesque /
 * Hanken Grotesk / JetBrains Mono via next/font), an atmospheric three.js GLSL
 * hero, and CSS-only motion. Selectable like any design in /admin/designs.
 *
 * This is the "premium from day one" path: ships as a code module, flows through
 * the mirror → cartwright-template → create-cartwright pipeline, and a customer
 * picks it in setup. Distinct from the in-product governed data-builder.
 */
import type { DesignPack } from "../types";
import EngineeredHomepage from "./homepage";

export const engineeredDesign: DesignPack = {
  slug: "engineered",
  name: "Engineered (dark-luxe agency)",
  description:
    "Premium dark-luxe agency design — navy canvas + warm cream + a single mint-teal accent. three.js GLSL aurora hero, editorial display type, glassmorphism, bento layout. Locked theme (no OS dark-mode flip). Built in real code for full design freedom.",
  mode: "website",
  chrome: "dark",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "eng",
    palette: {
      accent: "#5fe6c4",
      accentDeep: "#1e3f5a",
      cream: "#f4efe6",
      sand: "#0d141a",
      ink: "#090d11",
      muted: "#737d86",
    },
    extraTokens: {
      "color-eng-mint": "#5fe6c4",
      "color-eng-navy": "#1e3f5a",
      "color-eng-amber": "#e8a06a",
    },
    fonts: {
      sans: "Hanken Grotesk, system-ui, sans-serif",
      mono: "JetBrains Mono, ui-monospace, monospace",
    },
  },
  homepage: EngineeredHomepage,
};
