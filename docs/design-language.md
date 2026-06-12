# Cartwright design language — the three shared languages

Every design, scene, SVG item and builder Part in the engine speaks the same three
languages. That's what makes them composable: any motif drops into any palette, any
Part mixes into any mixable skin, and every catalogue ships through one manifest
(`marketplace-manifest.json`, schema `cartwright-marketplace-manifest-v2`).

This doc covers the *language rules*; the mode/theme/palette resolution model lives in
[`docs/design-system.md`](design-system.md).

## 1. Colour — the `cw-*` token chain

All shared atoms, Parts and SVG items paint exclusively with `--color-cw-*` CSS
variables, each with the engine fallback chain and a `currentColor` terminal so the
artwork degrades gracefully outside a themed page:

```css
var(--color-cw-accent,      var(--color-cw-terracotta,        currentColor))
var(--color-cw-accent-deep, var(--color-cw-terracotta-strong, currentColor))
var(--color-cw-gold,        var(--color-cw-oker,              currentColor))
var(--color-cw-cream,       var(--color-cw-paper,             currentColor))
var(--color-cw-sand,        var(--color-cw-stone-100,         currentColor))
var(--color-cw-ink,         currentColor)
var(--color-cw-muted,       var(--color-cw-stone-500,         currentColor))
```

Rules:

- **No hex values** in shared artwork or atoms — palette adaptation only works when
  every paint reads a token. (`paletteToFullThemeCss` in `lib/theme.ts` maps each
  shop's effective 6-colour palette onto the `cw-*` tokens at request time.)
- A premium pack may own a *different* prefix (`eng-*`, `at-*`, …) with a locked
  theme — but then it is a whole skin, not a mix target (see
  `MIXABLE_DESIGN_SLUGS` in `designs/options.ts`).
- Never rename existing tokens (`--color-sol-*` legacy rule applies engine-wide).

The same six colours are the contract for 3D: every Live Canvas scene
(`lib/three/scenes/registry.ts`) receives a `ThreePalette` of
accent/accentDeep/cream/sand/ink/muted resolved at runtime — which is why one scene
renders correctly in every shop's colours.

## 2. Signature motifs — the SVG item library

`components/svg-items/` is the hand-authored, palette-adaptive SVG library
(21 items: marks, dividers, illustrations — 12 static + 9 animated). Each is a
pure, zero-import server component with **stable namespaced gradient ids**
(`cwsi-<item>-*`), so rendered markup is deterministic and self-resolving — the
manifest ships each item's `renderToStaticMarkup` output verbatim (including
the animated items' scoped `<style>` blocks).

Animated items (`animated: true` in `SVG_ITEMS`) follow the motion vocabulary
below: pure CSS in a per-component scoped `<style>` block — compositor-only
transform/opacity keyframes (plus a scroll-driven `stroke-dashoffset` draw-in
for `vine-divider-grow`, double-gated behind `@supports
(animation-timeline: view())`), 8–20s ease loops with staggered child delays,
namespaced `cwsi-<slug>-*` selectors, and everything inside
`@media (prefers-reduced-motion: no-preference)` so reduced motion always gets
a beautiful static frame. Four static items (`orbit-mark`, `comet-mark`,
`sunburst-mark`, `moth-illustration`) additionally ship opt-in hover motion:
wrap them in an element carrying the `cwsi-animate` class and they wake on
hover; without it their render is visually unchanged.

A premium design may claim ONE item as its *signature motif* via
`components/svg-items/design-motifs.ts` (`DESIGN_MOTIFS`), emitted per design as
`motifSlug` in the manifest:

| Design | Motif |
|---|---|
| `apex` | `orbit-mark` |
| `engineered` | `lattice-mark` |
| `nocturne` | `constellation-mark` |
| `jungle` | `vine-divider` |
| `meridian` | `comet-mark` |
| `editorial-ink` | `prism-mark` |
| `brutalist` | `sunburst-mark` |
| `studio` | `bloom-illustration` |
| `fable` | `moth-illustration` |

Designs without a pairing simply emit `motifSlug: null`. The manifest test validates
every motif slug against the SVG library, so a typo fails CI.

## 3. Motion — the shared vocabulary

Motion is one whitelisted vocabulary, not per-design improvisation:

- **Compositor-only**: animate `transform` and `opacity` exclusively — never layout
  properties. (The per-section effects in `lib/builder/effects.ts` →
  `themes/motion.css` follow this; so must pack-local animation.)
- **Reduced-motion guarded**: every animation lives inside
  `@media (prefers-reduced-motion: no-preference)`. Motion is opt-in; static is the
  baseline. (3D scenes get the same signal via `SceneMountOpts.reducedMotion`.)
- **Scoped `<style>`**: a design pack's keyframes/animations ship in a scoped
  `<style>` block keyed to the pack's own class/data-attribute namespace — never
  global selectors, so packs can't leak motion into each other or the admin.
- Section-level effects use only the `SECTION_EFFECTS` whitelist
  (`fade-up`, `fade`, `zoom-in`, `slide-left`, `slide-right`, `parallax`) mapped to
  `.motion-*` utilities; anything off-whitelist renders static.

## Adding design #26 — checklist

1. **Build the pack** in `designs/<slug>/` (see the `cartwright-premium-design`
   skill). Palette-adaptive packs speak `cw-*`; locked-theme packs own their prefix.
2. **Register** (compile/test-enforced — each miss fails an invariant):
   - `designs/index.ts` — the DesignPack object.
   - `designs/options.ts` — `DESIGN_OPTIONS` metadata (+ `MIXABLE_DESIGN_SLUGS` if
     its `cw-*` tokens track the palette).
   - `designs/tokens.ts` — `DESIGN_TOKENS` palette + `threeD`.
   - `designs/chrome-slugs.ts` — only if the pack ships its own
     Shell/Header/Footer chrome.
3. **Motif (optional)**: pick or author an svg-item, pair it in
   `components/svg-items/design-motifs.ts`.
4. **Capture previews** for the cartwright.app gallery:
   `apps/web/public/designs/<slug>.{jpg,webm,mp4}` in the cartwright-app repo —
   generated with `pnpm capture:gallery` (see below).
5. **Regenerate the manifest**: `pnpm gen:manifest`, commit the JSON —
   `tests/unit/marketplace-manifest.test.ts` fails CI if you skip this.
6. **Gates**: `pnpm exec tsc --noEmit · pnpm test · pnpm build`, then the standard
   3-canary smoke before release.

## Capturing gallery assets — `pnpm capture:gallery`

`scripts/capture-gallery.mjs` is the committed pipeline that produces the gallery
previews (step 4 above). It temporarily pins each design via `designSlug` in
`brand.config.ts` (always auto-restored with `git checkout -- brand.config.ts`,
even on crash), photographs `localhost:<port>/da` with Playwright chromium
(1280×800, light color-scheme, networkidle + settle + reload), and refuses to save
a capture whose page rendered the Next.js error page — those slugs are logged as
`FAIL` and the run exits non-zero.

```bash
pnpm capture:gallery                          # every slug in DESIGN_OPTIONS → gallery-assets/<slug>.jpg
pnpm capture:gallery -- --slugs halo,apex     # just these designs
pnpm capture:gallery -- --video               # + 60-step slow-scroll webm/mp4 for threeD designs
pnpm capture:gallery -- --out shots --port 3017
```

- `--slugs a,b` — defaults to ALL slugs parsed from `designs/options.ts`
  `DESIGN_OPTIONS`.
- `--video` — only records designs with `threeD: true` in `designs/tokens.ts`.
  Output is `<slug>.webm` + `<slug>.mp4` (libx264, faststart, crf 23) with the
  first 2 s (recompile flash) trimmed from both. Requires `ffmpeg` on PATH.
- `--out <dir>` — default `gallery-assets/` (gitignored; copy the files into
  `apps/web/public/designs/` in the cartwright-app repo).
- `--port <n>` — default 3000. If nothing answers on the port the script spawns
  its own `pnpm dev` (`PORT=<n>`) and kills it on exit; an already-running server
  is reused (and left running). Use a free port if another checkout already
  serves :3000 — its `brand.config.ts` would win otherwise.

Prereqs: a seeded local DB (`pnpm db:setup`) — the dev seed's product images come
from `picsum.photos`, which is why that hostname is a permanent
`images.remotePatterns` entry in `next.config.ts`.
