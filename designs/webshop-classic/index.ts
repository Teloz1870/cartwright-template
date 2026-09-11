/**
 * Webshop Classic design — DesignPack registration.
 *
 * Pre-v0.7.0 default webshop layout. Extracted fra inline-render i
 * app/[locale]/page.tsx så vi kan adde flere webshop-variants (PR J:
 * webshop-minimal, webshop-editorial, webshop-bold) uden at touch
 * page.tsx.
 */
import type { DesignPack } from "../types";
import WebshopClassicHomepage from "./homepage";

export const webshopClassicDesign: DesignPack = {
  slug: "webshop-classic",
  name: "Webshop Classic (default e-commerce)",
  description:
    "HeroVideo + featured-product grid + lifestyle pitch + 5-col category grid. The default Cartwright webshop layout.",
  mode: "webshop",
  premium: false,
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
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: WebshopClassicHomepage,
};
