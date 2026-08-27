/**
 * "Crema" design — DesignPack registration.
 *
 * Cinematic dark-roast storefront for specialty coffee (and any
 * photography-led small-catalogue brand). The locked dark theme reaches the
 * WHOLE site through two cooperating mechanisms:
 *
 *  1. `applyPaletteAsTheme` — the engine's standard root token bridge
 *     (app/layout.tsx → paletteToFullThemeCss) maps the six-colour palette
 *     onto the sol-* chrome tokens AND the cw-* section atoms at `:root`,
 *     so every default body (PLP, cart, checkout, account, /info/*, blog,
 *     built-with-cartwright) self-darkens; `extraTokens` below covers the
 *     auxiliary sol tokens the bridge doesn't derive (sun, glass family,
 *     hero overlay, accent variants).
 *  2. `siteChrome.Shell` (CremaShell) — wraps every page in the
 *     `.crema-site` scope: pack fonts site-wide, scoped sol pins that beat
 *     any stray DB themeJson, `color-scheme: dark`, and the compensation
 *     rules for hardcoded light utilities.
 *
 * The SHARED header/footer stay (dark via the `chrome: "dark"` hint) — no
 * bespoke chrome to maintain, full commerce functionality untouched.
 *
 * Copy is i18n from birth: every string lives in the `Crema` message
 * namespace (da + en) — the northern-coffee retrofit (#458/#459) as a
 * birthright instead of a bugfix.
 */
import type { DesignPack } from "../types";
import CremaHomepage from "./homepage";
import { CremaShell } from "./chrome";
import { CremaPdpLayout } from "./webshop/PdpLayout";
import { CremaPlpFrame } from "./webshop/PlpFrame";
import { CremaProductCard } from "./webshop/ProductCard";
import { CREMA_WEBMCP_TOOL_BINDINGS } from "./webshop/BrewWebMcpTools";

export const cremaDesign: DesignPack = {
  slug: "crema",
  name: "Crema (cinematic dark roast)",
  description:
    "Cinematic dark-roast storefront: locked espresso palette with copper accents, full-bleed video hero, Fraunces display type, and a product rail that makes a three-bag catalogue feel like a collection. CSS-only motion, reduced-motion safe.",
  mode: "webshop",
  chrome: "dark",
  premium: true,
  source: "design.md",
  // Root token bridge: sol-* + cw-* (incl. the derived cw-stone ramp, which
  // inverts into a correct dark ramp for this palette) follow the roast on
  // every page. Inert for every other pack — the flag is per-design.
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "crema",
    palette: {
      accent: "#cf7a3c",
      accentDeep: "#241610",
      cream: "#16100b",
      sand: "#211711",
      ink: "#f4ead9",
      muted: "#a08b74",
    },
    extraTokens: {
      "color-crema-copper": "#cf7a3c",
      "color-crema-foam": "#f4ead9",
      "color-crema-shadow": "#0e0906",
      "color-crema-line": "rgba(244, 234, 217, 0.14)",
      "color-crema-forest": "#5d7a5c",
      // Auxiliary sol tokens paletteToFullThemeCss doesn't derive — crema-toned
      // so the shared chrome's kickers, glass surfaces (mobile menu, AI panel)
      // and hero overlays read correctly on the dark canvas. Emitted at :root
      // only while crema is the active design (designToInlineCss).
      "color-sol-sun": "#e8975a",
      "color-sol-accent-dark": "#a85f28",
      "color-sol-accent-light": "#e8975a",
      "color-sol-overlay-hero": "rgba(14, 9, 6, 0.55)",
      "color-sol-glass-light": "rgba(33, 23, 17, 0.6)",
      "color-sol-glass-light-strong": "rgba(33, 23, 17, 0.85)",
      "color-sol-glass-dark": "rgba(14, 9, 6, 0.6)",
      "color-sol-glass-tint": "rgba(244, 234, 217, 0.06)",
      "color-sol-glass-border": "rgba(244, 234, 217, 0.16)",
      "color-sol-glass-border-dark": "rgba(244, 234, 217, 0.28)",
      "color-sol-glass-ethereal": "rgba(33, 23, 17, 0.5)",
    },
    fonts: {
      sans: "Instrument Sans, system-ui, sans-serif",
      mono: "IBM Plex Mono, ui-monospace, monospace",
    },
  },
  homepage: CremaHomepage,
  // Theme shell (NOT a chrome replacement — the shared dark header/footer
  // stay): every page renders inside the `.crema-site` scope. See chrome.tsx.
  siteChrome: { Shell: CremaShell },
  // The pack registers its own WebMCP tool (the brew calculator's math as
  // `calculate_brew_ratio`) — these bindings feed the moat test's global
  // aggregation. See webshop/BrewWebMcpTools.tsx.
  webMcpToolBindings: CREMA_WEBMCP_TOOL_BINDINGS,
  // Fullscreen video hero — the engine's <main> wrapper must not force a
  // 60vh minimum in front of it.
  layout: { mainClassName: "" },
  // The KompositZaun port: attribute-driven merchandising on the shop pages.
  // The card + PDP frame read `Product.attributes` (roast/origin/process/
  // notes/weightG) and omit any element that doesn't parse — never guess.
  // The frame renders its own breadcrumb (halo pattern) → ownsBreadcrumb.
  webshop: {
    productCard: CremaProductCard,
    pdpLayout: CremaPdpLayout,
    // Editorial shelf head instead of the default stock-photo band
    // (designSurfaces-gated, like every surface hook).
    plpLayout: CremaPlpFrame,
    ownsBreadcrumb: true,
  },
};
