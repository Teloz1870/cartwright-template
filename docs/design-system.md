# Cartwright design system — site vs shop, themes, and how it fits together

This is the single reference for "which design do I use, and how do colours work?" — the
thing that used to be confusing.

## Two orthogonal axes

A Cartwright shop's look is the product of **two independent choices**:

1. **Mode** (`brand.mode`) — *what the site IS*: `website` (corporate/marketing, no cart),
   `webshop` (cart/checkout/PLP/PDP), or `agent-marketplace`. This is the canonical identity.
   `ecommerceEnabled` and `features.webshop` are **derived from `mode`** — read them through
   the predicates in [`lib/mode.ts`](../lib/mode.ts) (`isWebshop()`, `isEcommerce()`, …), never
   hand-roll `!features.webshop` vs `!ecommerceEnabled` vs `mode === "website"`. The invariant
   test `tests/unit/mode-invariants.test.ts` keeps the three from drifting.

2. **Design** (a DesignPack in `designs/<slug>/`) — *how it's rendered*: the homepage component,
   the palette, the chrome (light/dark). Independent of the industry seed-data
   (`industry-templates/<slug>/`, which only seeds products/categories/pages).

## The default: Aurora (free, palette-adaptive)

Out of the box a shop gets the **Aurora** flagship, inferred from mode
([`designs/options.ts` `inferDesignFromIndustry`](../designs/options.ts)):

| Mode | Default design |
|---|---|
| `website` | `aurora-site` |
| `webshop` | `aurora-shop` |

Aurora is composed from the **same section atoms the Magic Builder uses**
(`designs/studio/sections/*`), so the default homepage and the builder are one design system —
editing the homepage in the Magic Builder "just works".

### How Aurora adapts to each brand's colours (the key idea)

The atoms render against `--color-cw-*` tokens. Aurora sets `applyPaletteAsTheme: true`, so at
request time [`lib/theme.ts` `paletteToFullThemeCss`](../lib/theme.ts) maps the effective 6-colour
palette onto **both** the `sol-*` chrome tokens **and** the `cw-*` atom tokens (plus the derived
`cw-stone` ramp). The effective palette is:

```
BrandingSettings.themeJson  (per-shop override, set in the setup wizard)
  ?? the Aurora pack's default palette  (a fresh shop)
```

So **one** Aurora-shop design renders a coffee shop in coffee colours and a sunglasses shop in
its own colours — no per-vertical design packs needed. (This is what fixed the old "webshop mode
is industry-blind" problem.)

> There is deliberately **no `themes/aurora.css`** — a static `cw-*` block would collide with
> `themes/studio.css`. Runtime palette injection is the correct mechanism.

## Site vs shop taxonomy

Every design declares a `mode` (`"website" | "webshop" | "both"`). Pick within your mode:

| Mode | Designs |
|---|---|
| **website** | **aurora-site** (default) · saas-dark · studio (Pro) · stack (Pro) · corporate-baseline |
| **webshop** | **aurora-shop** (default) · webshop-minimal · webshop-editorial (Pro) · webshop-bold (Pro) · northern-coffee (Pro) · atelier (Pro) · webshop-classic · hoptify |

Choosing a non-default design = set `BrandingSettings.designSlug` (setup wizard → Design pack).
`getActiveDesign()` resolves `designSlug ?? inferDesignFromIndustry(...)`.

## Chrome (light vs dark header/footer)

The shared Header/Footer pick light vs dark from the **active design's `chrome` hint**, not from
the industry template:

- `chrome: "dark"` → saas-dark, stack (dark nav + footer).
- `chrome: "light"` (or unset) → Aurora, studio, webshop-*, … (light chrome).

Resolved server-side via `getActiveDesign()` in `components/Header.tsx` + `components/Footer.tsx`
and passed to `HeaderClient` as `darkChrome`. A null design (DB error) → light, matching the
inferred Aurora homepage that renders in that degraded state.

## Motion & effects

A flag-gated layer that makes pages feel alive — off by default, so a fresh shop and the
canaries render exactly as before until you turn it on.

- **Master switch:** `brand.features.motionEffects` (default-off). On ⇒ a `data-motion`
  attribute is written on `<html>` (`lib/motion.ts` → `app/layout.tsx`); off ⇒
  `data-motion="off"`.
- **Preset:** `brand.motionPreset.preset` — `"subtle"` (Apple/Linear-calm, small reveals,
  3D off) · `"bold"` (larger transforms + animated aurora gradient, 3D-ready) · `"off"`.
  Scales the whole feel via CSS variables.
- **The engine:** `themes/motion.css` — scroll-driven reveal classes, an animated aurora
  gradient (`.motion-aurora-bg`), and a glassmorphism utility. Every animation runs on the
  **compositor** (transform/opacity only), is wrapped in `@media (prefers-reduced-motion:
  no-preference)`, and scroll-driven effects sit behind `@supports (animation-timeline:
  view())` — no polyfill; unsupported browsers (Firefox today) stay static. Effect rules are
  scoped to `:root[data-motion="subtle"|"bold"]`, so `"off"` matches nothing → byte-identical.
- **Per-section vocabulary:** a section node may carry an optional `effect`
  (`fade-up | fade | zoom-in | slide-left | slide-right | parallax | none`, from
  `lib/builder/effects.ts`) — a governed `z.enum`, so the Magic Builder's AI can assign a
  performant, on-brand effect but never a janky one. `PageSections` wraps a node in the
  matching `.motion-*` class **only when set**.
- **Animated hero:** `aurora-site` wraps its hero in `.motion-aurora-bg` and mounts
  `<ThreeHero>` behind it when the `threeD` flag is on (gradient is the fallback).
  `aurora-shop` keeps `HeroVideo` untouched (preserves the `hero-poster-*` smoke markers).

## Canary safety

Changing the default design touches the 3-canary mosaic. The identity contract
(`scripts/smoke-canaries.sh`) checks brand name, `ecommerceEnabled`, no "Demo store" banner on
Teloz, the `hero-poster-*` markers and product names on the shops, and that all internal links
return 200 — **not** pixel design. Aurora-shop keeps `HeroVideo` + `ProductGrid` + the category
grid precisely so those markers survive. Run the smoke script before **and** after any canary
redeploy.
