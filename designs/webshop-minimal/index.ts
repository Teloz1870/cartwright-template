/**
 * Webshop Minimal — DesignPack registration.
 */
import type { DesignPack } from "../types";
import WebshopMinimalHomepage from "./homepage";

export const webshopMinimalDesign: DesignPack = {
  slug: "webshop-minimal",
  name: "Webshop Minimal (Apple-like)",
  description:
    "Full-bleed hero image + oversized typography + 2-col featured grid. Premium DTC-look — fewer, bigger products, generous whitespace.",
  mode: "webshop",
  premium: false,
  source: "design.md",
  tokens: {
    prefix: "sol",
    palette: {
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#ffffff",
      sand: "#f5f5f4",
      ink: "#0a0a0b",
      muted: "#737373",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
    },
  },
  homepage: WebshopMinimalHomepage,
};
