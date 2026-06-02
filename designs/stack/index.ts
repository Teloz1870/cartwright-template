/**
 * Stack — DesignPack registration.
 *
 * Cartwright Studio premium design #3. Dark-mode-first developer-tools
 * landing page. Sketch towards v0.8.0 marketplace.
 */
import type { DesignPack } from "../types";
import StackHomepage from "./homepage";

export const stackDesign: DesignPack = {
  slug: "stack",
  name: "Stack (Cartwright Studio)",
  description:
    "Dark-mode-first developer-tools landing page. Terminal hero with typed command + animated output, code-block feature cards, monospace everywhere. For dev SaaS, AI APIs, infrastructure.",
  mode: "website",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "st",
    palette: {
      accent: "#00d97e",
      accentDeep: "#00b368",
      cream: "#050505",
      sand: "#0e0e10",
      ink: "#fafafa",
      muted: "#888888",
    },
    extraTokens: {
      "color-st-prompt": "#00d97e",
      "color-st-cyan": "#6ee7ff",
      "color-st-magenta": "#ff6ec7",
      "color-st-amber": "#ffb800",
      "color-st-line": "rgba(250, 250, 250, 0.08)",
      "color-st-glow": "rgba(0, 217, 126, 0.15)",
      "color-st-code-bg": "#0a0a0c",
      "color-st-code-border": "rgba(0, 217, 126, 0.25)",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: StackHomepage,
};
