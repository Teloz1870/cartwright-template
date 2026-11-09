---
schema: cartwright-design-v1
slug: blank
name: Blank Canvas (build from scratch)
description: >-
  An intentionally bare starting point for a completely unique design.
  Minimal header, footer and homepage — heavily commented, made to be
  rewritten by you or your AI agent — while cart, checkout, admin, auth, AI
  tools and SEO keep working untouched. Neutral grayscale until you decide
  otherwise.
mode: both
premium: false
tokens:
  prefix: cw
  palette:
    accent: "#171717"
    accentDeep: "#000000"
    cream: "#ffffff"
    sand: "#f5f5f5"
    ink: "#171717"
    muted: "#737373"
  fonts:
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
---

# Blank Canvas — design spec

**Blank Canvas** is not a design — it is the engine's official *build-from-
scratch* path. Some shops want a designed look in one click (pick any other
pack); some want the whole front built uniquely, barebone, with totally free
hands. This pack is for the second group, and it is built to be rewritten by
an AI coding agent.

## What ships

1. **`chrome.tsx`** — `BlankHeader` (storeName + Home/Contact links, semantic
   minimal markup, system font stack) and `BlankFooter` (© year + storeName).
   Registered as `siteChrome`, so they replace the shared engine chrome on
   EVERY storefront page while `blank` is active.
2. **`homepage.tsx`** — an h1 with the storeName and one muted line ("This
   canvas is intentionally blank. Build anything."), preceded by the full
   build-anything guide as a comment block: the props contract
   (`DesignHomepageProps` incl. the genome/settings copy chain), how to add
   sections and files, that the cw-*/sol-* tokens are optional here, how
   `siteChrome`/`pages`/`webshop` overrides extend the design to every page,
   and the reduced-motion + a11y reminders.
3. **Neutral grayscale palette** with `applyPaletteAsTheme: true` — the
   do-nothing state renders the whole engine (cart, checkout, account,
   contact) in clean monochrome instead of any branded default. A shop's
   `themeJson` palette overrides it without touching the pack.

## The intended loop

1. Activate: `designSlug: "blank"` in `brand.config.ts`, or `/admin/designs`,
   or the `design.set_slug` tool.
2. Hand your AI agent the prompt from AGENTS.md → "Blank canvas — build a
   design from scratch".
3. The agent rewrites `designs/blank/{homepage,chrome}.tsx` (and adds
   `sections/`, CSS, fonts, `pages`/`webshop` overrides as needed) into a
   completely unique site.
4. Everything behind the front — DB, cart/checkout/Stripe, admin, auth, the
   AI tool surface, JSON-LD/SEO, i18n routing — keeps working untouched.

## Deliberate non-features

- No motif, no 3D scene, no premium badge, no Mixer parts (`mixable: false`
  — the bare markup is token-free, so cw-* Parts would not cohere; flip it
  in `designs/options.ts` if your rewrite paints with cw-* chains).
- No copy beyond the two placeholder lines: blank means blank.
