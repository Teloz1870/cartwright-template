/**
 * Webshop Bold — DesignPack registration.
 */
import type { DesignPack } from "../types";
import WebshopBoldHomepage from "./homepage";

export const webshopBoldDesign: DesignPack = {
  slug: "webshop-bold",
  name: "Webshop Bold (neo-brutalism)",
  description:
    "High-contrast color-blocks + thick black borders + zero shadows. Inspired by DTC-modern and the brutalism web trend.",
  mode: "webshop",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "bold",
    palette: {
      accent: "#d97757",
      accentDeep: "#c4623e",
      cream: "#fef3c7",
      sand: "#ffffff",
      ink: "#0a0a0b",
      muted: "#525252",
    },
    extraTokens: {
      "color-bold-accent": "#d97757",
      "color-bold-oker": "#e8b339",
      "color-bold-paper": "#fef3c7",
      "color-bold-ink": "#0a0a0b",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
    },
  },
  homepage: WebshopBoldHomepage,
};
