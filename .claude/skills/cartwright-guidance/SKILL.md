---
name: cartwright-guidance
description: |
  Cartwright-specific patterns for AI coding agents working on Cartwright stores. Use FIRST when editing Cartwright code (storefront, admin, brand.config.ts, themes, API routes). Layers on top of the modern-web-guidance skill — references its guides by ID rather than duplicating.

  Trigger immediately for:
  - Storefront UX: PLP → PDP navigation, cart drawer, checkout flow, product cards, hero sections.
  - Schema/SEO: JSON-LD, Product/Offer/BreadcrumbList markup, AI-citation optimization.
  - Performance: LCP image priority, INP-friendly scheduling on cart/checkout.
  - Feature flags: anything reading `brand.features.*` (webshop, reviews, mediaLibrary, popoverApi, viewTransitions).
  - Cross-canary work: changes that must pass the 3-canary mosaic (Teloz / Northbound / solbriller).
  - a11y: cart updates, review announcements, modal/drawer focus management.
  - Motion & animation: "make it feel alive", scroll-driven effects, three.js hero scenes, GSAP requests.

  DO NOT trigger for:
  - Pure backend: Prisma migrations, server-side cron jobs, MCP tool implementations.
  - Infrastructure: Vercel config, CI workflows, dependency bumps.
  - Tests with no UI surface.
metadata:
  upstream: modern-web-guidance
---

# Cartwright Guidance

This skill is the Cartwright-specific *layer* on top of `modern-web-guidance`. The upstream skill ships 137 guides across UX, performance, a11y, forms, and more. This file tells you (a) which of those guides apply to Cartwright surfaces, (b) what Cartwright already provides as building blocks, and (c) the feature-flag conventions for opt-in.

**Always check `modern-web-guidance` upstream guides for the actual API surface** — they're token-efficient and current. This file points; it does not duplicate.

---

## 1. Storefront navigation (View Transitions)

**Goal:** smooth visual transitions for PLP → PDP, cart → checkout, and back-navigation.

- Upstream: `modern-web-guidance/guides/user-experience/cross-document-transitions.md`, `user-experience/consistent-cross-document-transitions.md`, `performance/faster-spa-view-transitions.md`.
- Cartwright helper: `app/lib/view-transitions.ts` exposes `wrapNavigation(fn)` — wraps `document.startViewTransition` with a graceful fallback for Firefox/Safari.
- PDP hero `<Image>` carries `view-transition-name: hero-{productId}` so the card→PDP transition morphs correctly.
- Feature flag: `brand.features.viewTransitions` — `true` on modern canaries (Teloz, Northbound), `false` on solbriller legacy until verified.

**Don't:** call `startViewTransition` directly — always go through `wrapNavigation` so the legacy path stays clean.

---

## 2. Modals + menus (Popover / `<dialog>`)

**Goal:** native `<dialog>` + Popover API for overlay surfaces. Browser handles focus trap, escape, backdrop dismiss.

- Upstream: `user-experience/declarative-dialog-popover-control.md`, `user-experience/declarative-button-actions.md` (Invoker Commands API), `user-experience/animate-to-from-top-layer.md`.
- Cartwright usage: `components/MobileMenu.tsx` and `components/AIStylistPanel.tsx` switch to the native `<dialog>`/popover path when `brand.features.popoverApi` is on and the browser supports it (`supportsDialog()` from `lib/features.ts`).
- Feature flag: `brand.features.popoverApi` — flip per-canary, default off for solbriller.

**Don't:** reintroduce React-state-only modals for new surfaces. Use the native primitive + a React controller if state is needed.

---

## 3. Schema.org / JSON-LD (the AI-citation lever)

**Goal:** every page that can be cited by an AI search engine ships structured data. This is the single highest-leverage SEO/AI-Overview lever Cartwright has.

- Upstream: not covered by modern-web-guidance (schema is a Cartwright responsibility).
- Cartwright helper: `components/JsonLd.tsx` — escaped, injection-safe. Already wired across all 3 canaries.
- Currently shipped: `Organization` (root layout), `Product` + `Offer` (PDP), `BreadcrumbList` (PLP + PDP), `AggregateRating` (when `brand.features.reviews`).
- When adding a new content type (Article, Recipe, FAQPage, Event, Service): add the type to `JsonLd.tsx`, place it server-side in the relevant page's layout/page.tsx.

**Don't:** put JSON-LD in client components — it must be SSR'd so crawlers and LLM-scrapers see it without executing JS.

---

## 4. Performance (LCP / INP)

**Goal:** keep the storefront fast on real customer hardware.

- Upstream: `performance/identify-inp-causes.md`, `performance/break-up-long-tasks.md`, `performance/schedule-tasks-by-priority.md`, `performance/optimize-image-priority.md`, `performance/calculate-total-foreground-time.md`.
- LCP hint: the PDP hero `<Image>` gets the next/image `priority` prop. Below-fold images get `loading="lazy"`.
- INP: use `scheduler.yield()` for long synchronous work on interactive paths (cart, checkout).

**Don't:** add untracked third-party analytics scripts before consent (`brand.features.consentBanner` is the consent path; `analyticsGa4` is the consent-gated analytics flag).

---

## 5. a11y baseline (announce, focus, motion)

**Goal:** every async state change (cart add/remove, review submit, error toast) is announced; modals trap focus; motion-sensitive users are respected.

- Upstream: `accessibility/accessible-error-announcement.md`, `accessibility/accessibility.md`.
- Cartwright helper: `components/a11y/LiveRegion.tsx` — `<div role="status" aria-live="polite">` wrapper. Use for cart updates, review confirmations, form errors.
- `prefers-reduced-motion` already respected in `globals.css`, RevealOnScroll, theme animations, and `<details>` interpolate-size. HeroVideo is the known gap — guard its autoplay behind a media query.

**Don't:** announce on every render. The LiveRegion content should change only when the underlying event fires, otherwise screen readers re-announce noise.

### Byte-identical a11y recipes (safe to add without changing the render)

Two patterns let you improve accessibility on a shared storefront component **without** altering its visible/rendered output — the only kind of a11y change safe to land against the frozen canaries (localizing *visible* chrome text is not; that's owner territory).

- **Optional prop → conditional a11y attribute.** Add an optional prop to a leaf component and set the attribute only when it's provided: `aria-label={label ? \`Remove ${label} from cart\` : undefined}`. React omits an attribute entirely when its value is `undefined` (not `aria-label=""`, not the string `"undefined"`), so **the prop absent = the legacy render byte-for-byte**; existing callers are untouched and the real caller opts in. Attribute *values* are React-escaped (`"` → `&quot;`, `&` → `&amp;`), so interpolating a product/user name is XSS-safe — no `dangerouslySetInnerHTML`. Test with `renderToStaticMarkup` and assert the **escaped** form; prove non-vacuity by source-mutating the branch. (Reference: `CartQuantity` Remove button, `WishlistButton` `locale?`.)
- **`aria-invalid` tracks FIELD validity, not any error string.** When a form's single `error` state also carries transport/server failures, `aria-invalid={error ? true : false}` wrongly announces a *valid* input as invalid on a server hiccup. Bind `aria-invalid` to a dedicated validity boolean set **only** on the format-validation branch — never to the generic error state (`NewsletterSignup` does exactly this: a separate `invalid` boolean flipped only on the email-format branch). For *byte-identity*, use the `undefined` sentinel on the valid branch — `aria-invalid={isFieldInvalid ? true : undefined}`, **not** `: false` — because React serializes a boolean `false` on an `aria-*`/`data-*` attribute as the literal string `"false"` (unlike a true DOM boolean prop such as `disabled`, which React drops when `false`), so `: false` renders `aria-invalid="false"` and is **not** byte-identical when the legacy input had no attribute; `undefined` omits it. (Note: `NewsletterSignup` predates this refinement and still emits `: false` — copy its validity-boolean split, not its valid-branch value.)

---

## 6. Motion & animation (the 3 blessed paths)

**Goal:** "make it feel alive" without wrecking INP, reduced-motion users, or the canaries. In order of preference:

1. **Native motion presets** — `brand.features.motionEffects: true` (compile-time) + `brand.motionPreset.preset: "subtle" | "bold" | "off"`. Resolves to `data-motion` on `<html>` (`lib/motion.ts`); all effects in `themes/motion.css` are scoped to it, run via scroll-driven `animation-timeline: view()` (compositor thread, `@supports`-detected, `prefers-reduced-motion`-safe, `RevealOnScroll` static fallback). Flag off ⇒ byte-identical render.
2. **three.js scenes** — the `plugins/three-scenes/` plugin (Live Canvas). Runtime flag `threeD`; 9 scene slugs in `plugins/three-scenes/scenes/registry.ts` (`floating-geometry`, `particles`, `blob`, `wireframe`, `aurora`, `waves`, `orb`, `gridflow`, `butterflies`); configure via `/admin/three-d` or the `three.configure` tool. Lazy-loaded, theme-palette-driven, CWV-safe. Render with `ThreeHero`.
3. **GSAP (per-project recipe, NOT an engine dependency)** — `pnpm add gsap`, then a `"use client"` wrapper: all gsap calls inside `useEffect`, scoped with `gsap.matchMedia(ref)`, tween only under `(prefers-reduced-motion: no-preference)`, and `mm.revert()` in the cleanup. The full verified component is in `.claude/CLAUDE.md` → "Motion & animation".

**Don't:** run gsap at module scope of server-rendered files; hide content behind an animation with no reduced-motion fallback; stack all three paths in one viewport.

---

## 7. The 3-canary mosaic

Every Cartwright change must pass:

| Canary | What it proves |
|---|---|
| `teloz-showcase.vercel.app` (`/da`, `/en`) | website-mode (`ecommerceEnabled: false`) — corporate path |
| `demo.cartwright.app` (Northbound) | modern webshop (`brand.mode: "webshop"`) — cart, checkout, Stripe |
| `solbrillen-dk-teloz1.vercel.app` | legacy webshop — `--color-sol-*` tokens, `frameColor`/`lensColor`/`brand` Prisma fields |

**Quick local sanity** (90 seconds):

```bash
pnpm dev
# /da               → website-mode loads cleanly
# /da/produkter     → shop loads cleanly
```

Modern web platform features that may break older browsers (View Transitions, Popover API, container queries) MUST be feature-flagged so solbriller can default off until manually verified.

---

## 8. Where to find things (quick map)

- `brand.config.ts` — single source of truth for brand identity, mode, feature flags, policies.
- `themes/<slug>.css` — palette per shop. Don't rename `--color-sol-*` tokens.
- `lib/ai/prompts/<slug>.ts` — AI assistant prompt module per shop.
- `industry-templates/<slug>/` — seed data per shop type.
- `components/JsonLd.tsx` — structured data helper.
- `components/a11y/LiveRegion.tsx` — announcement helper.
- `app/lib/view-transitions.ts` — navigation wrapper.
- `lib/plugins/spec.ts` + `plugins/registry.ts` — the `cartwright-plugin-v1` contract + plugin catalogue (first plugin: `plugins/phone-widget/`).
- `lib/feature-flags/manifest.ts` — **the** flag registry (compile-enforced `Record<FeatureKey,…>`). Add a flag in `brand.config.ts` → you MUST add a manifest entry or it won't compile. `getFeatureView()` (`lib/feature-flags/status.ts`) reads it and drives `/admin/features`, `llms.txt`, and `/built-with-cartwright` — so those surfaces never go stale.

v0.10.0 subsystems (each behind its flag — gate new code the same way):

- `lib/genome/` — Resolvable Genome (`genomeResolve`). `readField()` renders, `resolveField()` is triggered (never at render).
- `lib/seo/` — SEO/GEO autopilot (`seoAutopilot`). `lib/scrape/` — Firecrawl. `lib/design-import/` — palette-from-URL (`designImport`).
- `lib/hoptify/` + `lib/ai/logo-gen.ts` + `designs/hoptify/` — Hoptify (`hoptify`, `logoGenerator`).
- `lib/gdpr/` — DSAR/erasure/retention. `lib/tax.ts` — Stripe Tax (`stripeTax`). `lib/shipping/` — zones/fulfillment (`shippingZones`).

**Feature-gate example** (server): `if (!(brand.features as { hoptify?: boolean }).hoptify) notFound();` then `requireAdmin()`. Client UI: pass a `xxxEnabled` boolean prop down rather than reading `brand.features` in a client component.

Refer to `modern-web-guidance` for the actual web platform APIs. Refer to this file for *how Cartwright wires them in*.
