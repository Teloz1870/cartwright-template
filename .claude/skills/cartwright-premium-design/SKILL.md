---
name: cartwright-premium-design
description: |
  How to hand-build a PREMIUM, code-level Cartwright DesignPack (a whole-page
  design) with an AI coding agent — the "build your own stunning design"
  path, distinct from the in-product governed section-builder. Use this when a
  developer wants a bespoke, on-brand homepage design in real code (not the
  no-code Magic Builder).

  Trigger immediately for:
  - "build me a custom design / homepage / landing page" in a Cartwright repo
  - creating or editing anything under designs/<slug>/ (a DesignPack)
  - adding a three.js / shader hero to a design
  - registering a new design so it appears in /admin/designs + the marketplace

  DO NOT trigger for:
  - In-product no-code page building (that's the Magic Builder / Visual Builder →
    use the section-vocabulary skill; output is governed DATA, not code).
  - Editing product/category/cart/checkout UX (use cartwright-guidance).
  - Pure backend / infra / tests.
metadata:
  upstream: cartwright-guidance, modern-web-guidance
  source-of-truth: designs/types.ts (DesignPack contract), designs/engineered (reference pack)
  authoring: hand-authored
---

# Cartwright Premium Design

Two design paths exist in Cartwright — do not confuse them:

| | In-product builder | **This skill: code-level design** |
|---|---|---|
| Who | non-technical shop owner (admin only) | **developer + AI agent** |
| Output | governed section DATA (layoutJson) | **real code (a DesignPack)** |
| Freedom | whitelisted sections only | **total** |

A **DesignPack** is a whole-page design that drops into Cartwright's design
registry and is selectable in `/admin/designs` (and listed on cartwright.app).
The canonical contract is `designs/types.ts`; the reference implementation is
`designs/engineered/` (dark-luxe agency, three.js hero). Copy its shape.

## 1. Anatomy of a pack — `designs/<slug>/`

- `index.ts` — the `DesignPack` object: `{ slug, name, description, mode, chrome, premium, source: "design.md", tokens, homepage }`.
- `homepage.tsx` — a **server component** (LCP-friendly) default-exporting the homepage. It receives `DesignHomepageProps` (settings, locale, featured, categories, threeD, editEnabled) — use what you need, ignore the rest.
- `<slug>.css` — all styles, scoped under a unique root class, imported by `homepage.tsx`.
- `design.md` — canonical spec (cartwright-design-v1; powers export/share). Required by `source`.
- optional `HeroCanvas.tsx` / sections — bespoke client bits.

Then **register** in two places (both required):
- `designs/index.ts` — import the pack + add to the `DESIGNS` map.
- `designs/options.ts` — append a `DESIGN_OPTIONS` entry (slug, name, description, mode, premium) so the admin picker + marketplace see it.

Keep it **additive + default-off**: a new pack is just *available*; it only renders when a shop sets `designSlug` (config or `/admin/designs`). Canaries stay byte-identical.

## 2. Locked theme — kill the OS dark-mode leak

The #1 mistake: using Tailwind `dark:` variants. They follow the OS
`prefers-color-scheme`, so the design flips under the user. For a deliberate
premium look:

- Define an explicit token palette as CSS custom properties on the pack's root
  class; reference them everywhere. **No `dark:` variants.**
- Set `color-scheme: dark` (or `light`) on the wrapper so form controls match.
- Use `color-mix(in oklab, …)` for hairlines/tints, `clamp()` for fluid type/space.
- Organize with `@layer`; `:focus-visible` for focus rings (never remove outlines).

(See `modern-web-guidance` `css` guide; the `engineered.css` file is a worked example.)

## 3. three.js hero — opt-in, perf-safe

Don't hand-roll a renderer. Use the shared Live Canvas:

```tsx
import { DesignHero } from "@/components/DesignHero";
// behind your hero content, absolutely positioned:
{/* DesignHero renders the palette-driven `aurora` GLSL scene */}
<DesignHero className="absolute inset-0 -z-10" intensity={0.7} />
```

`DesignHero` is lazy (`ssr:false`), inherits WebGL2 / `prefers-reduced-motion` /
saveData gating, and **renders nothing when unsupported** — so always paint a CSS
gradient/aurora fallback behind it. Colours come from `--color-sol-*`, so it's
on-brand automatically. For a fully bespoke shader, mirror
`designs/engineered/HeroCanvas.tsx` (raw `three`, full cleanup on unmount,
reduced-motion = one static frame).

## 4. Typography & motion

- Distinctive fonts via `next/font/google` at module scope in `homepage.tsx`
  (avoid Inter/Roboto/Arial). Expose as CSS variables. (Tests mock next/font via
  `tests/shims/next-font.ts` — add a new font's named export there if you use one.)
- CSS-only motion: staggered load reveals (`animation-delay`), scroll-driven
  reveals behind `@supports (animation-timeline: view())` (content visible by
  default → no hidden content in Safari). Respect `prefers-reduced-motion: reduce`.

## 5. Content = English-first

Cartwright customers are primarily English. Author homepage copy in English.
(Repo code comments may be Danish — that's fine.)

## 6. Verify before you ship

```bash
pnpm exec tsc --noEmit          # types
pnpm test                       # suite (design registry imports must not crash)
# render it: set designSlug to your slug, open the homepage, eyeball it.
```
Then `pnpm build` for a full check. Open a PR rather than pushing straight to `main`.
After it deploys, `pnpm verify:deploy <url>` — a design change that breaks the build
still deploys "successfully" if the platform falls back to serving `public/`.

## 7. Quick map

- Contract: `designs/types.ts` · Registry: `designs/index.ts`, `designs/options.ts`
- Reference pack: `designs/engineered/` · Export/share: `lib/designs/export.ts`
- 3D: `components/DesignHero.tsx`, `lib/three/scenes/aurora.ts`
- Resolution: `lib/brand.ts` `resolveStoreIdentity()` (config `designSlug` → DB → infer)
