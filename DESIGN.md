# DESIGN.md — the Cartwright design playbook

This is the one file every AI coding agent (Claude, Gemini, Codex, Copilot, Cursor,
Windsurf — anyone) reads before designing this site. It answers four questions:
**which path do I take, what's already built in, what does "good" look like, and how
do I verify my own work.** Boot/setup steps live in `AGENTS.md`; this file is purely
about making the site *stunning*.

---

## 1. The three design paths — pick ONE before you start

### Path A — Compose a look (~99 seconds, no design work)

Pre-built Skins + Voices. One REST call applies palette + copy + design + 3D scene.
Mint an agent key first (`AGENTS.md` → "Your first 10 minutes", step 2), then:

```bash
# enable genome copy rendering (Voices write copy through the Resolvable Genome)
curl -s -X POST http://localhost:3000/api/v1/tools/features.set \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"key":"genomeResolve","enabled":true,"confirm":true}'

# apply a designed look — instant, no LLM involved
curl -s -X POST http://localhost:3000/api/v1/tools/magic.compose_look \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"vertical":"cafe","confirm":true}'
```

Voices: `cafe`, `carpenter`, `dentist`, `fable`, `fitness`, `kindergarten`, `restaurant`, `salon` (`verticals/`).
Pick a specific Skin with `"design":"<slug>"` — slugs live in `designs/options.ts`
(aurora-site, apex, nocturne, editorial-ink, brutalist, fable, …) — or call
`design.set_slug`. Browser equivalents: `/admin/designs`, `/admin/verticals`,
`/admin/mixer`.

Use when: the owner wants a great site NOW and a curated look is good enough.

### Path B — Mockup first (vision → live homepage in seconds)

Publish a disposable HTML mockup as the homepage, get approval, then build it for real:

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.set \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<section>…the whole mockup…</section>","confirm":true}'
```

**The no-scripts rule:** `mockup.set` runs `sanitizeVibeHtml`
(`lib/v0/transform/sanitize.ts`) which strips `<script>`, iframes/objects/embeds,
inline event handlers and `javascript:` URLs. So mockups are static HTML + Tailwind
classes + **inline SVG + CSS animation** (keyframes in a `<style>` block are fine).
**GSAP and three.js can NOT run in a mockup** — anything needing real JS goes through
Path C. When approved: implement for real (Path C or governed sections), then
`mockup.clear` (`{"confirm":true}`) to drop the takeover.

Use when: the owner wants to SEE the vision before committing to an implementation.

### Path C — Blank Canvas (fully unique, real code, total freedom)

The first-class path for a **completely unique design**: rewrite `designs/blank/*` —
own header, own footer, the whole homepage — while everything behind the front keeps
working untouched (section 5).

1. Activate: `designSlug: "blank"` in `brand.config.ts` (or `/admin/designs`, or the
   `design.set_slug` tool).
2. Rewrite `designs/blank/homepage.tsx` (the entire homepage, Server Component) and
   `designs/blank/chrome.tsx` (`BlankHeader`/`BlankFooter` — rendered on EVERY page).
   Each file carries its own in-file contract guide.
3. Add anything: `designs/blank/sections/*.tsx`, a scoped CSS file,
   `next/font/google` fonts. The engine's `cw-*`/`sol-*` tokens are OPTIONAL here.
4. Optional, in `designs/blank/index.ts`: `pages: { contact, info, notFound }` and
   `webshop: { productCard, pdpLayout, categoryLayout }` (contracts in
   `designs/types.ts`).

Full walkthrough: `AGENTS.md` → "Blank canvas — build a design from scratch".

Use when: the owner wants a bespoke site that looks like nothing else. **This is the
path where the taste rules (section 3) and self-verification (section 4) matter most.**

---

## 2. Built-ins inventory — already shipped, do NOT reinstall

### three.js hero scenes (do NOT `pnpm add three` — it's already here)

The 3D hero ships as the `plugins/three-scenes/` plugin. Enable the runtime flag
`threeD`, render with `ThreeHero` (`components/ThreeHero.tsx`):

```tsx
import { ThreeHero } from "@/components/ThreeHero";
// behind your hero content, e.g.:
<ThreeHero scene="aurora" intensity={0.7} className="absolute inset-0 -z-10 h-full w-full" />
```

9 scenes (`plugins/three-scenes/scenes/registry.ts`): `floating-geometry`,
`particles`, `blob`, `wireframe`, `aurora`, `waves`, `orb`, `gridflow`,
`butterflies`. All lazy-loaded (only the active scene's module is fetched),
palette-reactive (they read the shop's theme tokens — they recolor themselves in any
palette), and CWV-safe. Configure site-wide via `/admin/three-d` or the
`three.configure` tool (`{ scene, intensity: 0..1, paletteSource, confirm: true }`).

### SVG item library (hand-authored, palette-adaptive, zero-JS)

`components/svg-items/` — 21 inline-SVG server components (marks, dividers,
illustrations; 12 static + 9 animated). Every one reads its colors from the `cw-*`
palette tokens, so they recolor with the shop's theme automatically. Import and drop in:

```tsx
import { OrbitMark, WaveDivider, AuroraRibbon } from "@/components/svg-items";
```

Static: `orbit-mark`, `prism-mark`, `constellation-mark`, `comet-mark`,
`sunburst-mark`, `lattice-mark`, `wave-divider`, `vine-divider`,
`bloom-illustration`, `mountain-illustration`, `crystal-illustration`,
`moth-illustration`. Animated (pure CSS, reduced-motion-safe): `orbit-mark-live`,
`constellation-twinkle`, `comet-streak`, `wave-divider-flow`, `vine-divider-grow`,
`aurora-ribbon`, `butterfly-swarm`, `bloom-open`, `firefly-field`. Full manifest:
`SVG_ITEMS` in `components/svg-items/index.ts`; language rules in
`docs/design-language.md`.

### Native motion presets (scroll-driven CSS — no JS, no deps)

Flip `brand.features.motionEffects: true` in `brand.config.ts` and pick
`brand.motionPreset.preset`: `"subtle"` (calm ~12px reveals), `"bold"` (pronounced
transforms + animated aurora background) or `"off"`. Effects live in
`themes/motion.css` (`animation-timeline: view()`, `@supports`-detected,
`prefers-reduced-motion`-safe). Flag off ⇒ byte-identical render.

### GSAP (recipe — NOT a dependency; install only if you need choreography)

For timelines, stagger, scroll-scrubbed sequences CSS can't express:
`pnpm add gsap` in YOUR project, then use this verified SSR-safe wrapper pattern:

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

export function GsapReveal({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // All gsap work happens client-side after mount (SSR-safe) and is
    // scoped to this subtree. matchMedia = built-in reduced-motion guard.
    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-gsap-item]", {
        opacity: 0,
        y: 24,
        duration: 0.6,
        stagger: 0.12,
        ease: "power2.out",
      });
    });
    return () => mm.revert(); // cleanup on unmount — kills tweens, restores styles
  }, []);

  return <div ref={scope}>{children}</div>;
}
```

This exact wrapper also ships as a drop-in at
`designs/blank/examples/GsapMotion.tsx.example` — rename to `.tsx` after `pnpm add gsap`.

Mark animated children with `data-gsap-item`. The rules: gsap calls only inside
`useEffect` (never at module scope of a file that renders on the server), always
scope with `gsap.matchMedia(ref)`/`gsap.context`, always `revert()` in cleanup, and
always leave content visible when `prefers-reduced-motion: reduce` (the `matchMedia`
guard above does this — the tween simply never runs, content stays at full opacity).
Register plugins (e.g. `ScrollTrigger`) inside the effect too.

**Motion order of preference:** presets for ambient feel → a three.js scene for a
hero statement → GSAP for bespoke one-off choreography. Don't stack all three on the
same viewport. Remember: NONE of these run inside a Path-B mockup (scripts are
stripped) — mockups animate with CSS only.

### Typed-terminal / code hero (CSS-only — do NOT hand-roll a JS simulator)

Want a terminal that types a command then reveals output (the "watch it install"
hero)? It already exists as a pure-CSS, reduced-motion-safe pattern in the **Stack**
design — `designs/stack/homepage.tsx` (markup) + `themes/studio.css`
(`.cw-typed-line` / `.cw-caret` / `.cw-typed-output` `@keyframes`). Copy that pattern
instead of building a React terminal with `setTimeout`s: no JS, compositor-friendly,
and it falls back to static text under `prefers-reduced-motion`.

### Blank Canvas CSS starter

A minimal scoped stylesheet (display-font hookup, section-rhythm vars, dark-band
utility) ships at `designs/blank/examples/blank.css.example` — rename to `blank.css`
and import it from `designs/blank/homepage.tsx`.

---

## 3. The taste rules — hard rules, not suggestions

Every one of these exists because an AI build got it wrong and a human had to fix it.

1. **The hero is full-bleed — never a boxed banner in a centered column.** A hero
   that sits inside a card/container reads as an ad, not a site. Backgrounds span
   edge to edge; only the *text* gets a max-width.
2. **Generous whitespace.** Sections breathe: think `py-24`/`py-32`, not `py-8`.
   Cramped sections are the #1 tell of a generated site.
3. **One display font, loaded via `next/font`.** Pick a single distinctive display
   face for headlines (body can stay a system/neutral face) and load it with
   `next/font/google` at module scope — never a `<link>` tag, never three fonts.
4. **Asymmetric sections.** Don't stack identical centered blocks. Alternate:
   text-left/media-right, then media-left/text-right; vary column splits (7/5, 2/3);
   let one element overhang. Symmetry everywhere = template smell.
5. **Edge-to-edge dark bands.** Full-width contrast sections (dark on light sites,
   light on dark sites) give the page rhythm. A page that is one continuous
   background color has no rhythm.
6. **Flawless mobile.** 390px is not an afterthought: no horizontal scroll, tap
   targets ≥44px, type scales down (clamp or responsive sizes), heroes still
   full-bleed. Verify it (section 4) — don't assume it.
7. **Real a11y minimums always:** one `<h1>` per page, semantic landmarks, alt
   text, visible `:focus-visible`, and `prefers-reduced-motion` guards on every
   animation.
8. **Bind real data — never hardcode the owner's content.** Services, prices,
   products, opening hours and contact details must read from the database
   (`Service` model via the services helpers, `Product` via the catalog helpers,
   settings/genome for copy) — NOT be string literals in your JSX. Why: the owner
   edits a price in `/admin/services` in ten seconds; a hardcoded price needs an
   AI session and a deploy. A design whose content the owner cannot edit without
   you is not finished. (Found live: a dentist site where every treatment price
   was hardcoded.)

---

## 4. Verify your own work — non-negotiable

You are not done when the code compiles. You are done when it LOOKS stunning.

1. Run the site: `pnpm dev` → `http://localhost:3000/<defaultLocale>` (check
   `brand.defaultLocale` in `brand.config.ts` — e.g. `/da` or `/en`).
2. **Screenshot at 1440px wide (desktop) AND 390px wide (mobile).** Use whatever
   browser/screenshot tooling you have (Playwright, a DevTools MCP, simple headless
   capture).
3. **LOOK at both screenshots.** Check them against every taste rule in section 3:
   is the hero full-bleed? Does it breathe? Does mobile hold up?
4. **Iterate.** Fix what looks wrong and screenshot again. Repeat until you would
   proudly show both screenshots to the owner. One pass is almost never enough.

If you cannot take screenshots in your environment, say so explicitly and ask the
owner to look at both widths before you call the work done.

---

## 5. What keeps working for free

Whatever path you take, you are ONLY painting the front. All of this keeps working
untouched: database + Prisma, cart + checkout + Stripe, auth + customer accounts,
the whole `/admin`, the AI tool surface (`/api/v1/tools` + MCP), JSON-LD structured
data, sitemap/robots/`llms.txt`, and i18n locale routing. Don't rebuild any of it,
don't route around it, and don't rename `--color-sol-*`/`--color-cw-*` tokens.

### Style the engine overlays via these hooks

The floating engine overlays (FABs, banners, panels) render OUTSIDE your design's
markup, so you can't restyle them from your components — and their Tailwind class
lists are NOT a stable API. Every overlay root carries a stable `data-cw-*`
attribute instead; target those from your design's CSS:

| Hook | Overlay |
|---|---|
| `[data-cw-ai-assistant="fab"]` | AI assistant floating button (`components/AIStylistButton.tsx`) |
| `[data-cw-ai-assistant="panel"]` | AI assistant chat panel root (`components/AIStylistPanel.tsx`) |
| `[data-cw-phone-widget]` | Phone widget root — FAB + call panel (`plugins/phone-widget/`) |
| `[data-cw-voice-shop="fab"]` | Voice-shop microphone button |
| `[data-cw-voice-shop="overlay"]` | Voice-shop dialog overlay |
| `[data-cw-consent-banner]` | Cookie-consent banner root |
| `[data-cw-welcome-guide]` | First-visit welcome guide dialog |
| `[data-cw-sticky-atc]` | Mobile sticky add-to-cart bar (PDP) |
| `[data-first-run-welcome]` | First-run welcome canvas (also the smoke-test marker) |

Example — recolor the AI FAB to your design's palette:

```css
[data-cw-ai-assistant="fab"] {
  background: var(--your-accent);
}
```

The attributes are pure hooks (no styles attached) and are kept stable across
engine updates; the class lists around them may change at any time.

One built-in responsive default to know: at very small viewports (≤420px) the AI
FAB's own classes render compact — smaller padding/text, tighter corner offset — so
it covers less content on phones. Your design can still reposition or resize it
freely via `[data-cw-ai-assistant="fab"]`: unlayered design CSS always beats the
FAB's (layered) utility classes, media query or not.

Quick gates before you hand over: `pnpm typecheck` · `pnpm dev` renders
`/<defaultLocale>` (and `/<defaultLocale>/produkter` in webshop mode) · screenshots
per section 4.
