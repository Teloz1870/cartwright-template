/**
 * "Blank Canvas" — the build-from-scratch DesignPack.
 *
 * Not a design — a STARTING POINT. The pack ships deliberately bare files
 * (homepage.tsx + chrome.tsx, heavily commented) that an AI coding agent (or
 * a developer) rewrites into a completely unique site: own header, own
 * footer, own every page — while ALL backend (DB, cart, checkout, admin,
 * auth, AI tools, SEO/JSON-LD) keeps working untouched.
 *
 * The customer-facing path: tell your AI agent
 *   "Build me a completely new design: edit designs/blank/* — header,
 *    footer, homepage, all content unique. Set it live with
 *    designSlug: 'blank' (brand.config.ts) or via /admin/designs."
 * Full guide: AGENTS.md → "Blank canvas — build a design from scratch",
 * plus the in-file guides in homepage.tsx and chrome.tsx.
 *
 * Design decisions (deliberate — keep when rewriting the LOOK, not the docs):
 * - mode "both": selectable in website AND webshop mode (the picker keeps
 *   "both" designs visible either way; webshop pages render their default
 *   token-adaptive bodies until you add `webshop` overrides).
 * - applyPaletteAsTheme + a neutral grayscale palette: if you change nothing,
 *   every built-in surface (cart/checkout/account/contact) renders clean
 *   monochrome instead of the engine's default purple — a true blank slate.
 *   A shop's themeJson palette still wins if set.
 * - mixable: false (via designs/options.ts MIXABLE_DESIGN_SLUGS, where blank
 *   is intentionally absent): the bare markup is token-free, so cw-* Mixer
 *   Parts would not visually cohere with whatever you build here. If your
 *   rewrite paints everything with cw-* token chains, you can flip this by
 *   adding "blank" to MIXABLE_DESIGN_SLUGS.
 */
import type { DesignPack } from "../types";
import BlankHomepage from "./homepage";
import { BlankHeader, BlankFooter } from "./chrome";

export const blankDesign: DesignPack = {
  slug: "blank",
  name: "Blank Canvas (build from scratch)",
  description:
    "An intentionally bare starting point for a completely unique design. Minimal header, footer and homepage — heavily commented, made to be rewritten by you or your AI agent — while cart, checkout, admin, auth, AI tools and SEO keep working untouched. Neutral grayscale until you decide otherwise.",
  mode: "both",
  chrome: "light",
  premium: false,
  source: "design.md",
  // Neutral grayscale mapped onto the sol-*/cw-* tokens: the do-nothing state
  // is clean monochrome across all built-in surfaces. themeJson overrides win.
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#171717",
      accentDeep: "#000000",
      cream: "#ffffff",
      sand: "#f5f5f5",
      ink: "#171717",
      muted: "#737373",
    },
    fonts: {
      sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
  },
  homepage: BlankHomepage,
  // Control the engine's shared <main> wrapper (app/[locale]/layout.tsx wraps
  // every page body in <main className="min-h-[60vh]">). Unset = today's default.
  //   layout: { mainClassName: "" },         // full-bleed: no min-height
  //   layout: { mainClassName: "min-h-screen" }, // fullscreen hero
  //   layout: { ownsMain: true },            // YOU render the <main> (in a Shell)
  // The blank chrome reaches every page; rewrite it in designs/blank/chrome.tsx.
  // For full frame control add a Shell (see BlankShell in chrome.tsx):
  //   siteChrome: { Shell: BlankShell, Header: BlankHeader, Footer: BlankFooter },
  siteChrome: { Header: BlankHeader, Footer: BlankFooter },
};
