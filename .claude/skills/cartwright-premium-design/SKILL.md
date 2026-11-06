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
  source-of-truth: designs/types.ts (DesignPack contract), designs/engineered (reference pack; light and site scaffolds prune it), DESIGN.md (taste rules)
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
`designs/engineered/` (dark-luxe agency, three.js hero) — copy its *shape*, not its
look. The default `--profile light` scaffold and `--profile site` both prune that pack; where `designs/engineered/`
is missing, take the shape from `designs/types.ts` and the in-file guides in
`designs/blank/`. When the brief is "something that looks like nothing else", start from
`designs/blank/` rather than adapting a pack's components: that is how a bespoke brief
ends up wearing the borrowed pack's kit. Read `DESIGN.md` §3 (the taste rules) before
you write CSS — this skill sits on top of that playbook, it does not replace it.

## 1. Anatomy of a pack — `designs/<slug>/`

- `index.ts` — the `DesignPack` object: `{ slug, name, description, mode, chrome, premium, source: "design.md", tokens, homepage }`.
- `homepage.tsx` — a **server component** (LCP-friendly) default-exporting the homepage. It receives `DesignHomepageProps` (settings, locale, featured, categories, threeD, editEnabled) — use what you need, ignore the rest.
- `<slug>.css` — all styles, scoped under a unique root class, imported by `homepage.tsx`.
- `facts.ts` — *optional*: what the pack states on its own — the owner's history, provenance, how the place works — one field per fact with its source in a comment (see §6). Not a home for anything `DESIGN.md` §3 rule 8 already gives a place (the database, or `brand.config.ts` → `contact`), and never for something you invented.
- `design.md` — canonical spec (cartwright-design-v1; powers export/share). Required by `source`.
- optional `HeroCanvas.tsx` / sections — bespoke client bits.

Then **register** in two places (both required):
- `designs/index.ts` — import the pack + add to the `DESIGNS` map.
- `designs/options.ts` — append a `DESIGN_OPTIONS` entry (slug, name, description, mode, premium) so the admin picker + marketplace see it.

Keep it **additive + default-off**: a new pack is just *available*; it only renders when a shop sets `designSlug` (config, or `/admin/designs` where the admin exists). Canaries stay byte-identical.

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

## 6. The three rules packs get wrong

Mirrors `DESIGN.md` §3 rules 9-11 — read that section for the full versions.

**9 — Never invent the owner's facts.** Reviews, testimonials, names, follower counts,
awards, certifications: from the DB, `brand.config.ts`, or a source the owner gave you,
or not on the page at all. An invented review is a liability the owner inherits at
launch, and it passes review because it reads as plausible. Services, prices and products
come from the database; opening hours and contact details from `brand.config.ts` →
`contact`; in a `--profile site` scaffold, from its content files (`DESIGN.md` §3 rule 8). What
the pack states on its own — the owner's history, provenance, how the place works — goes
in `designs/<slug>/facts.ts` with a source per field; `UNVERIFIED` marks an
owner-supplied fact you could not confirm, never a fabrication — it goes in that field's
source comment and in your handover to the owner, never in the rendered text.

**10 — Run the template-tells check.** One card treatment for everything · emoji-as-icons ·
ALL-CAPS eyebrows over every heading · arrows on every CTA · one badge repeated ·
middle-dot meta rows · >3 tints of one accent. Three or more together = the default AI
look, not a design.

**11 — `tokens.palette.accent` is the UI accent, not a brand colour.** With
`applyPaletteAsTheme: true` and no `themeJson` override, your palette becomes the shop's
theme and `--color-sol-accent` paints the PDP price, the checkout submit button and field
focus rings. Pick a colour that works as a CTA; a logo or certification-mark colour goes
in `tokens.extraTokens` or the pack's own CSS. (Leave the flag off and those surfaces keep
the engine default palette, or the shop's `themeJson` when it has one — the other half of
the same trap.)

## 7. Verify before you ship

```bash
pnpm exec tsc --noEmit          # types
pnpm test                       # suite (design registry imports must not crash)
# activate it: set designSlug to your slug (brand.config.ts, or /admin/designs where the admin exists) —
# a pack that is merely registered still renders the OLD design.
# then, with `pnpm dev` already running in ANOTHER terminal (verify:design never
# starts a server, and `pnpm dev` blocks — do not chain it into this list):
pnpm verify:design              # if present: 1440px + 390px → .screenshots/, non-zero
                                # exit on horizontal overflow or an <h1> count != 1
```
Then LOOK at both screenshots against `DESIGN.md` §3 — the command proves the page is
not broken, not that it is good. `--full-page` reaches below the fold; `--selector`
captures one component but skips the page-level checks, so it never counts as a gate.
(A `--profile site` scaffold prunes this script — fall back to any headless capture.)
Then `pnpm build` for a full check. Open a PR rather than pushing straight to `main`.
After it deploys, `pnpm verify:deploy <url>` — a design change that breaks the build
still deploys "successfully" if the platform falls back to serving `public/`.

## 8. Quick map

- Contract: `designs/types.ts` · Registry: `designs/index.ts`, `designs/options.ts`
- Reference pack: `designs/engineered/` · Export/share: `lib/designs/export.ts`
- 3D: `components/DesignHero.tsx`, `lib/three/scenes/aurora.ts`
- Resolution: `lib/brand.ts` `resolveStoreIdentity()` (config `designSlug` → DB → infer)
