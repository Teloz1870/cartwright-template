---
name: cartwright-guidance
description: |
  Cartwright-specific patterns for AI coding agents working on Cartwright stores. Use FIRST when editing Cartwright code (storefront, admin, brand.config.ts, themes, API routes). Layers on top of the modern-web-guidance skill — references its guides by ID rather than duplicating.

  Trigger immediately for:
  - Storefront UX: PLP → PDP navigation, cart drawer, checkout flow, product cards, hero sections.
  - Schema/SEO: JSON-LD, Product/Offer/BreadcrumbList markup, AI-citation optimization.
  - Performance: LCP image priority, INP-friendly scheduling on cart/checkout.
  - Feature flags: anything reading `brand.features.*` (webshop, reviews, mediaLibrary, popoverApi, viewTransitions).
  - Flag-gated API routes: writing or gating a route handler (`app/api/*`, `app/.well-known/*`, your own) that must answer as if it does not exist when its flag is off.
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

---

## 9. Flag-gated routes: the verbs the framework answers for you

**Goal:** a route whose flag is off should give away as little as it can. Full indistinguishability from an absent path is **not** reachable — even after exporting every verb, your 404's body is not the framework's — but the loudest tell is closed in three lines, and it is open by default because Next answers some verbs on your behalf, outside your gate.

Next builds a complete method table for every route module (`autoImplementMethods`, in `next/dist/server/route-modules/app-route/helpers/`). Three consequences, each measured against a production build of this engine on `next@16.3.0` (measured 2026-08; the engine has since taken patch bumps within 16.3.x — re-measure before trusting any of it on another major):

1. **`OPTIONS` is auto-implemented.** Export no `OPTIONS` and Next installs its own: `204` plus an `Allow` header naming your verbs. That handler is framework code, so it never runs your `notFound()`/`guard()` branch. Reproducible in this engine today: `/api/v1/tools` exports only `GET`, so with `mcpPublic` **off** it answers `404` to `GET` and `204 allow: GET, HEAD, OPTIONS` to `OPTIONS`. `/api/mcp` behaved the same way (`204 Allow: DELETE, GET, HEAD, OPTIONS, POST` while `GET`/`POST`/`DELETE` returned `404`) *until* it was given a gated `OPTIONS` export — that is the before/after this section is written from.
2. **`HEAD` is derived from `GET` — and it *is* gated.** When a module exports `GET` and no `HEAD`, Next sets `methods.HEAD = handlers.GET`, so `HEAD` runs your gated handler. Measured with the flag **on**, so the route's own guard is what answers: `HEAD /api/mcp` → `200` with no `Origin`, `403` with a foreign one — i.e. the request really did reach the handler. With the flag off it returns the same 404 as `GET`. `HEAD` therefore belongs in any `Allow` string you write by hand; leaving it out advertises fewer methods than the route serves. Exporting `HEAD` explicitly changes that arithmetic.
3. **Unhandled verbs get a bare `405`.** `PUT`/`PATCH` fall through to `handleMethodNotAllowedResponse()` = `new Response(null, {status:405})` — it sets no headers of its own, and in particular no `Allow`, so the method list does not leak this way (measured: zero `Allow` headers). Treat that as a measurement of this version, not a guarantee to build on. The `405` itself still says *something is mounted here*.

**The comparison that decides whether it is a leak:** measure the same verb against a path that genuinely does not exist, not against what feels like an empty response. `OPTIONS /api/absent-path-xyz` returns **`404`** (measured in prod *and* dev). So the old `204` leaked on two grains — the status said a route is mounted, and the `Allow` header then named its verbs. Fixing only the status leaves the other tell standing.

**The recipe.** Export `OPTIONS` behind the same gate as the rest of the route, returning the *same* 404 the other verbs return — write that 404 once, so a later edit cannot make the two verbs distinguishable again. When the gate is open, answer with `allowResponse()` from `lib/http/allow.ts` (engine helper: `204` + `Allow`, and nothing else — no CORS headers, no cache directive). This is the shape `app/api/acp/feed/route.ts` uses (that route gates on `brand.ecommerceEnabled` rather than a feature flag; the structure is the same):

```ts
import { getBrand } from "@/lib/brand";
import { allowResponse } from "@/lib/http/allow";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS"; // HEAD included: Next serves it from GET

function gatedNotFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(): Promise<Response> {
  const brand = await getBrand();
  if (!(brand.features as { yourFlag?: boolean }).yourFlag) return gatedNotFound();
  return new Response("…the real work");
}

export async function OPTIONS(): Promise<Response> {
  const brand = await getBrand();
  if (!(brand.features as { yourFlag?: boolean }).yourFlag) return gatedNotFound();
  return allowResponse(ALLOWED_METHODS);
}
```

Note the difference from §8's page-level gate: a Server Component calls `notFound()`, but a route handler should **return** its own `Response`. `notFound()` does work in a handler — Next catches the thrown access-fallback error (the `isHTTPAccessFallbackError` branch in `next/dist/server/route-modules/app-route/module.js`) and answers `new Response(null, { status })` — but that 404 is *bodyless*, so mixing the two styles across a route's verbs hands a prober two different 404s to compare.

**What this does and does not buy you.** It closes the `204` + `Allow` tell. It does not make the route byte-identical to an absent path, and the two residuals close differently:

- **The `405`.** A verb no handler implements answers `405` where an absent path answers `404`. Closing it means routing every verb through the gate (or gating in the proxy) — and if you do export the extra verbs, remember to answer `405` *yourself* when the gate is **open**, or you have quietly made the route accept `POST`. Note what that costs: the moment a module exports a verb it answers `405` for, the "derive `Allow` from the module's exports" rule stops holding, because it would advertise verbs the route deliberately refuses. Pick one — either derive `Allow` from exports and accept the `405` tell, or close the `405` and write `Allow` by hand.
- **The 404 body.** Your gate's 404 carries whatever body you gave it (`"Not found"` above) while an unmatched path is served the framework's rendered 404 page. No in-route response matches that — a bodyless `new Response(null, {status:404})` is no closer than a plain-text one. Only proxy-level gating removes this. What you *can* hold is that every verb of your route answers the **same** 404, which is why the recipe writes it once.

So **verify against the invariant you can actually hold**: `curl -isX OPTIONS` your route with the flag off, then the same against a nonsense path *under the same prefix*, and require the **status and the absence of `Allow`** to match.

Picking that control path is where this goes wrong, and it depends on `proxy.ts`'s matcher rather than on intuition:

- **Under `/api`** — `/api/absent-path-xyz` answers `404`. Use it.
- **A path containing a dot** — `.well-known/absent-xyz` also answers `404`, because the matcher excludes anything with a dot, so next-intl never sees it. Measured, not assumed.
- **Anywhere else without a dot** — next-intl answers `307` for *both* your route and the control, so a missing `OPTIONS` export passes the comparison and proves nothing. `/oauth/*` is exactly this case. Compare the built module's exports instead, or test through a request that bypasses the rewrite.

Residuals, so nobody claims identity: the body, `content-type`, `X-Powered-By` (route handlers do not get it, rendered pages do) and a differing `Cache-Control` all still distinguish an in-route reply from an absent path.

**Test it at both levels.** A unit test that only calls your handler proves the branch you wrote, not the verb you never exported — but the export itself is observable, so unit tests *can* pin this: assert `typeof mod.OPTIONS === "function"`, and derive the expected `Allow` from the module's own exports — **adding `HEAD` when `GET` is exported without one**, then sorting and joining with `", "`, which is the rule Next's own substitute follows — so a verb added later fails the test. `tests/unit/agentic-options-gate.test.ts` does exactly that for the ACP + UCP routes (the `/api/mcp` equivalent lives in `tests/unit/mcp-origin-guard.test.ts`); copy its shape. Then confirm end-to-end with `curl`, because the substitute handler is installed by the framework and only a real request exercises it.

**Engine status (check before assuming).** Three groups, and only the first is the pattern to copy:

- **Gated `OPTIONS`:** `/api/mcp`, the ACP routes, the `.well-known/oauth-*` documents, `/oauth/token|register|revoke`, `/api/ucp/orders`.
- **Framework default (still leaking):** `/.well-known/mcp.json`, `/api/v1/tools*` — `GET` only, so they still hand out the framework's `204`. This list is derived by grepping the gate helpers (`a2aDisabledResponse`, `acpDisabledResponse`, `mcpPublicDisabledResponse`, `ucpIdentityLinkingEnabled`, the `ecommerceEnabled`/`merchantFeed` conjunct), **not** from memory — a prose-derived version of this list has been wrong twice, in the same direction. `/api/agent-card`, `/api/negotiate`, `/api/escrow/verify` and `/feed/google.xml` were on it until cartwright#436 closed them.
- **Deliberately ungated preflight:** `/api/look` and `/api/registry` are gated on their own flags but export a hand-written `OPTIONS` returning `204` + `Access-Control-Allow-Origin: *` *outside* the gate, because browser-based agents must be able to preflight them. That is a choice, not the default — and it does mean those two answer a CORS preflight while their flag is off.

**Don't:** treat "the handler returns 404" as proof the route is gated; assume closing the `OPTIONS` tell also closed the `405` one; or add `Access-Control-Allow-*` to an `allowResponse()` reply to make the shape look symmetric. That last one is a real decision, not a style point: `OPTIONS` is also the browser's CORS preflight. The routes that use `allowResponse()` are not called cross-origin, which is why it omits those headers — if yours genuinely is, write the deliberate preflight instead (`/api/look` and `/api/registry` are the worked examples), and decide on purpose whether it sits inside or outside the gate.

## 10. WebMCP (in-browser agent tools — experimental, `webMcp` flag)

WebMCP exposes storefront actions as browser-native tools for in-browser AI
agents (`document.modelContext`, W3C draft + Chrome 149 origin trial +
ChatGPT's built-in browser). Default-off, runtime tier. The rules when you
touch this surface:

- **Shared plumbing lives in `lib/model-context.ts`** (zero-import core —
  NOT `lib/webmcp/`, which the CLI light profile deletes). Use
  `resolveModelContext()` + `registerWebMcpTools()`; never hand-roll
  detection or fire-and-forget `registerTool` (the draft returns a promise).
  There is NO `unregisterTool()` — cleanup is aborting the `AbortSignal`
  you registered with.
- **Per-route tools, not a global toolbox.** Site-wide tools live in
  `components/WebMcpRegistrar.tsx` (mounted in the locale layout — the CLI
  light profile line-filters on that exact name: never rename it, keep its
  import + mount on one line each). Page-contextual tools live in
  `components/webmcp/*` as server-gated mounts (gate INSIDE the mount via
  `getBrand()`, return `null` when off = byte-identical) with `"use client"`
  leaves that re-register on prop change.
- **Tool names are globally unique** across every surface — duplicate names
  are undefined behavior in the draft.
- **The moat applies in the browser too**: every REGISTERED tool declares
  its `CUSTOMER_TOOL_ALLOWLIST` operations in a `*_WEBMCP_TOOL_BINDINGS`
  const, and `tests/unit/webmcp-moat.test.ts` holds that surface to the
  `products.`/`cart.` families. No order-placing, build or admin tools in
  the browser — `go_to_checkout` only OPENS checkout for the human.
  **Declarative carve-out:** the form tools carry no bindings by design —
  they are the human's own forms through the same public endpoints, human-
  confirmed (no autosubmit on communication). Their names come from
  `WEBMCP_FORM_TOOL_NAMES` in `lib/model-context.ts`, which the moat test
  folds into the global name-uniqueness check. `site_search` (declarative:
  navigates to the results page) deliberately coexists with
  `search_products` (imperative: returns data) — different verbs, both
  read-only.
- **Declarative forms** (`toolname`/`tooldescription`/`toolautosubmit` on a
  `<form>`, typed in `types/webmcp-dom.d.ts`): gate the attributes on the
  flag via `useFeature("webMcp")` (byte-identity), answer agent submits via
  `event.agentInvoked` + `event.respondWith(promise)`, and pass
  `toolautosubmit: ""` (a string — React drops boolean unknown attributes).
  Autosubmit only for read-only actions (search); never for communication
  (contact, newsletter) or anything financial (`CheckoutForm` is deliberately
  unannotated).
- **Verify** on `/<locale>/webmcp-check` (lists live tools via `toolchange`)
  in Chrome with `chrome://flags/#enable-webmcp-testing`, or via the
  origin-trial token (`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN`, emitted from
  the root layout when the runtime flag is on).

---

Refer to `modern-web-guidance` for the actual web platform APIs. Refer to this file for *how Cartwright wires them in*.
