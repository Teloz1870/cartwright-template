/**
 * Webshop Editorial — DesignPack registration.
 */
import type { DesignPack } from "../types";
import WebshopEditorialHomepage from "./homepage";

export const webshopEditorialDesign: DesignPack = {
  slug: "webshop-editorial",
  name: "Webshop Editorial (magazine)",
  description:
    "Split-screen story-driven hero, alternating editorial product cards, typographic billboard categories. For story-led shops.",
  mode: "webshop",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "sol",
    palette: {
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, monospace",
    },
  },
  homepage: WebshopEditorialHomepage,
};
