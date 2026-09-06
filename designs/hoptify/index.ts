/**
 * Hoptify design — DesignPack registration.
 *
 * Cartwrights parodi-pendant til Shopify: velkendt webshop-look, frisk grøn
 * accent i VORES nuance (ikke Shopifys), Cartwright-magi under. applyPaletteAsTheme
 * så Hoptify-grønnen mapper til de aktive sol- og cw-tokens når designet er valgt.
 */
import type { DesignPack } from "../types";
import HoptifyHomepage from "./homepage";

export const hoptifyDesign: DesignPack = {
  slug: "hoptify",
  name: "Hoptify (Shopify pendant, parody)",
  description:
    "Et velkendt, rent webshop-look à la de store — men på Cartwright-motoren, med en frisk Hoptify-grøn og et glimt i øjet (“Hop off Shopify”). Inkl. parodi-import-onboarding i /admin/hoptify.",
  mode: "webshop",
  premium: false,
  source: "design.md",
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "sol",
    palette: {
      accent: "#2f9e54",
      accentDeep: "#1f7a40",
      cream: "#f6faf6",
      sand: "#e7f1e8",
      ink: "#16241b",
      muted: "#5c6b60",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: HoptifyHomepage,
};
