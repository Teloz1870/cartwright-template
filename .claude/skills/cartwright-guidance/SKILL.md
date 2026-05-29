---
name: cartwright-guidance
description: |
  Cartwright-specific patterns for AI coding agents working on Cartwright stores. Use FIRST when editing Cartwright code (storefront, admin, brand.config.ts, themes, API routes). Layers on top of the modern-web-guidance skill — references its guides by ID rather than duplicating.

  Trigger immediately for:
  - Storefront UX: PLP → PDP navigation, cart drawer, checkout flow, product cards, hero sections.
  - Schema/SEO: JSON-LD, Product/Offer/BreadcrumbList markup, AI-citation optimization.
  - Performance: Web Vitals wiring, LCP image priority, INP-friendly scheduling on cart/checkout.
  - Feature flags: anything reading `brand.features.*` (webshop, webVitals, passkeys, reviews, mediaLibrary).
  - Cross-canary work: changes that must pass the 3-canary mosaic (Teloz / Northbound / solbriller).
  - Auth: passkey registration / authentication flows.
  - a11y: cart updates, review announcements, modal/drawer focus management.

  DO NOT trigger for:
  - Pure backend: Prisma migrations, server-side cron jobs, MCP tool implementations.
  - Infrastructure: Vercel config, CI workflows, dependency bumps.
  - Tests with no UI surface.
metadata:
  upstream: modern-web-guidance
  baseline: see internal-docs/modern-web-baseline.md
---

# Cartwright Guidance

This skill is the Cartwright-specific *layer* on top of `modern-web-guidance`. The upstream skill ships 137 guides across UX, performance, a11y, forms, passkeys, etc. This file tells you (a) which of those guides apply to Cartwright surfaces, (b) what Cartwright already provides as building blocks, and (c) the feature-flag conventions for opt-in.

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

## 2. Cart drawer + modals (Popover / `<dialog>`)

**Goal:** native `<dialog>` + Popover API for cart drawer and welcome modal. Browser handles focus trap, escape, backdrop dismiss.

- Upstream: `user-experience/declarative-dialog-popover-control.md`, `user-experience/declarative-button-actions.md` (Invoker Commands API), `user-experience/animate-to-from-top-layer.md`.
- Cartwright drawer: `components/cart/CartDrawer.tsx` uses `<dialog popover="manual">` with a React state controller. WelcomeModal uses `popover="auto"` for click-outside dismiss.
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

## 4. Web Vitals self-hosted (Phase 0)

**Goal:** measure INP/LCP/CLS/FCP/TTFB on real customer traffic; gate on regressions.

- Upstream: `performance/identify-inp-causes.md`, `performance/break-up-long-tasks.md`, `performance/schedule-tasks-by-priority.md`, `performance/optimize-image-priority.md`, `performance/calculate-total-foreground-time.md`.
- Cartwright wiring: `components/WebVitalsReporter.tsx` posts to `/api/vitals`. Admin dashboard at `/admin/performance` renders p75/p99 trends.
- Feature flag: `brand.features.webVitals` — consent-gated (requires `brand.features.consentBanner` accepted analytics bucket).
- LCP hint: PDP hero `<Image>` gets `fetchPriority="high"`. Below-fold images get `loading="lazy"`.

**Don't:** add untracked third-party analytics scripts before consent. Vitals reporting is the consent-compliant path.

---

## 5. Passkeys (Phase 5b)

**Goal:** WebAuthn passkey login alongside magic-link and password.

- Upstream: `passkeys/passkey-registration.md`, `passkeys/passkey-authentication.md`, `passkeys/passkey-conditional-create.md`, `passkeys/passkey-reauthentication.md`, `passkeys/passkey-management.md`.
- Cartwright scaffolding: `/account/security` page, `/api/auth/passkey/*` routes, Prisma `Authenticator` table. `LoginForm` accepts `passkeysEnabled` prop.
- Feature flag: `brand.features.passkeys`. Default `false`. Magic-link remains fallback.

**Known gap:** the actual WebAuthn ceremony (`navigator.credentials.create()` / `get()`) is not yet wired in the route handlers. When implementing, follow the upstream registration guide exactly — origin/RP-ID matching is the most common breakage point.

---

## 6. a11y baseline (announce, focus, motion)

**Goal:** every async state change (cart add/remove, review submit, error toast) is announced; modals trap focus; motion-sensitive users are respected.

- Upstream: `accessibility/accessible-error-announcement.md`, `accessibility/accessibility.md`.
- Cartwright helper: `components/a11y/LiveRegion.tsx` — `<div role="status" aria-live="polite">` wrapper. Use for cart updates, review confirmations, form errors.
- `prefers-reduced-motion` already respected in `globals.css`, RevealOnScroll, theme animations, and `<details>` interpolate-size. HeroVideo is the known gap — guard its autoplay behind a media query.

**Don't:** announce on every render. The LiveRegion content should change only when the underlying event fires, otherwise screen readers re-announce noise.

---

## 7. The 3-canary mosaic

Every Cartwright change must pass:

| Canary | What it proves |
|---|---|
| `teloz-showcase.vercel.app` (`/da`, `/en`) | website-mode (`ecommerceEnabled: false`) — corporate path |
| `teloz-showcase.vercel.app/da/produkter` (Northbound) | modern webshop (`brand.mode: "webshop"`) — cart, checkout, Stripe |
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
- `components/WebVitalsReporter.tsx` — Phase 0 vitals.
- `components/a11y/LiveRegion.tsx` — announcement helper.
- `app/lib/view-transitions.ts` — navigation wrapper (when Phase B5 ships).

Refer to `modern-web-guidance` for the actual web platform APIs. Refer to this file for *how Cartwright wires them in*.
