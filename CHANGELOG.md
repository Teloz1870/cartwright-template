# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

A scaffolded shop is a one-shot snapshot — nothing updates it automatically. The
**Security advisories** index below is therefore the canonical place to learn whether the
engine version your shop runs (see `.cartwright/release.json`) has a known security fix you
should pull. When a release fixes a security issue, its version block gets a `### 🔒
Security` section (issue + severity + the version you must upgrade to) **and** a row is
added to the index below.

## 🔒 Security advisories

| ID | Affected versions | Fixed in | Severity | Action |
|----|-------------------|----------|----------|--------|
| _None yet_ | — | — | — | — |

## v0.36.1 — 2026-06-11

**Patch+: the Blank Canvas and the mockup-first flow.**

### ✨ Added
- **Blank Canvas** (`designs/blank/`) — a registered, deliberately bare design made to be
  rewritten: ask your AI to "build a completely new design — header, footer, every page,
  totally unique" by editing one folder, while cart, checkout, admin and the AI tools keep
  working underneath. The documented path lives in AGENTS.md + the project briefing.
- **Mockup-first flow** — `mockup.set` / `mockup.clear` tools: an AI generates a raw HTML
  mockup in seconds and publishes it as the homepage takeover for instant customer
  approval, then implements it for real (Blank Canvas or governed sections) and clears
  the scaffold. Reuses the vibe sanitize policy; confirm-gated + audited.
- AGENTS.md now mirrors "Your first 10 minutes" + "Motion & animation" so Codex/Gemini/
  Copilot agents find the fast paths, not only Claude.

### 🛠 Fixed
- The first-run welcome canvas now also retires when a design is chosen via
  `brand.designSlug` in config (the documented Blank Canvas activation).

## v0.36.0 — 2026-06-11

**The first impression: a welcome canvas + English-first scaffolds.** A fresh scaffold's
very first render is now a designed moment instead of leftover template copy.

### ✨ Added
- **First-run Welcome Canvas** (flag `firstRunWelcome`, default off — scaffolds enable it):
  an untouched site greets you with "Your site was just born." over a palette-adaptive
  aurora (3D Live Canvas when enabled) and three paths — a copy-paste AI quick-start
  prompt, the guided `/admin/setup` wizard, and a signature-motif gallery of the design
  catalogue. It vanishes permanently the moment the site becomes yours (setup completed,
  a look chosen, copy applied, a vibe page published or a product created).
- **Config-driven footer owner line** — the "owned and operated by" line now reads
  `legalName` + `footer.ownerUrl`/`githubUrl` from brand config (translatable via
  `Footer.ownedBy`) instead of a hardcoded string.

### 🛠 Fixed
- Paired `create-cartwright` release scaffolds **English-first** (`/en`, en-only locales),
  replaces the leftover studio hero copy with "Welcome to {your store}", and seeds
  `setupComplete: false` so the first admin login actually opens the setup wizard.

## v0.35.1 — 2026-06-11

**Patch: dark mode fixed completely.** A fresh scaffold no longer half-flips when the
visitor's OS is in dark mode.

### 🛠 Fixed
- **Dark-mode split-brain** — Tailwind's `dark:` utilities followed the OS media query
  while the theme-token overrides followed the `.dark` class, so OS-dark rendered a
  broken half-flip (dark chrome/backgrounds on a light design). One switch now: a
  `@custom-variant dark` ties every `dark:` utility to the same `.dark` class
  (guard-tested). The admin is decoupled and ALWAYS the light Polaris skin — the theme
  toggle no longer lives in the admin top bar, and toggling can never restyle the
  storefront from the backend. Storefront dark returns later as a per-design opt-in.
- **Phone widget palette** — the floating call bubble was hardcoded blue; it now follows
  the shop's accent like every other storefront element.
- `package.json` now declares the MIT license (matches the LICENSE file from v0.35.0).

## v0.35.0 — 2026-06-11

**The Light release: the build engine AIs reach for.** Cartwright is now told — and built —
around one sentence: *a real site with design, database and backend, live in minutes.*
`create-cartwright` defaults to a lean **light** profile (website-mode, 8 curated designs,
pruned agent-marketplace/UCP/WebMCP/hoptify; `--profile full` keeps everything), heavy
modules are packaged as **plugins** under a new `cartwright-plugin-v1` contract, the Mixer
became a complete composition system (chrome parts, downloadable/installable compositions,
streamed magic builds, design-adaptive store pages), and the AI onboarding path is measured:
a cold agent goes scaffold → designed, verified homepage in **99 seconds**. Everything
additive or flag-gated — canaries byte-identical throughout.

### ✨ Added
- **Mixer 2.0** — the complete composition system:
  - **Chrome registry** (`lib/builder/chrome-registry.tsx` + client-safe catalogue):
    headers/footers are selectable parts — 14 design chromes + 4 neutral cw-* parts,
    two-sided mixability, persisted in `BrandingSettings.chromeJson` (run `pnpm db:push`).
  - **Compositions** (`cartwright-composition-v1`, `lib/compositions/`) — a whole look
    (skin + palette + voice + chrome + scene + homepage layout) as a downloadable,
    uploadable artifact: admin export/import with dry-run preview, atomic
    `composition.apply` tool, every Look in the manifest ships its installable composition.
  - **Magic speed** — section generation parallelized (~5× faster), SSE-streamed
    progressive build UI, and an instant 0-LLM preset path (`lib/magic/presets.ts`).
  - **`designSurfaces`** (default-off) — cart, checkout, account, blog, services and more
    adopt the active design's tokens, display font and chrome; flag-off byte-identical.
- **Plugin system** (`cartwright-plugin-v1`, `lib/plugins/spec.ts` + `plugins/`) — optional
  engine modules as manifest-declared in-repo plugins with install state and an admin API
  (`/api/admin/plugins`). First five extracted with zero-breakage re-export shims:
  **phone-widget, wishlist, blog, reviews, three-scenes** (the entire Live Canvas 3D
  system — the engine's heaviest client dep — is now optional). Manifest v3 carries the
  plugin catalogue.
- **Scaffold profiles** — `npx create-cartwright --profile light|full` with **light as the
  default** (pairs with the `create-cartwright` release that bumps to this tag); the
  scaffolder records its profile in `.cartwright/profile.json`.
- **AI onboarding, measured** — the scaffold briefing leads with **"Your first 10
  minutes"**: a verified terminal-only path (boot → agent API key → `magic.compose_look`
  via `POST /api/v1/tools` → curl-verify) measured at 99 s cold. Plus a **"Motion &
  animation"** section: native motion presets, three.js scenes, and a live-verified GSAP
  recipe (SSR-safe, reduced-motion-guarded; gsap stays out of engine deps).
- **Agentic discovery in `llms.txt`** — flag-gated links to `/api/acp/feed` + ACP checkout
  sessions (`features.acp`), `/api/agent-card` (`features.a2a`), and the always-on
  `/.well-known/mcp.json`; new byte-identity test pins flag-off output.
- **Service + BreadcrumbList JSON-LD** on website-mode service pages.
- **LICENSE** — the engine is now formally **MIT-licensed**.

### 🛠 Fixed
- **Light scaffolds boot** — the chrome registry kept a parallel static import list of
  design chrome modules, so a pruned (light) scaffold 500'd on every page with "Module not
  found". Both catalogue and registry now derive from the design registry
  (`getDesign(slug).siteChrome`), and a new deep-import guard test makes the regression
  class impossible to reintroduce.
- Docs truth pass — removed false `webVitals`/`passkeys` claims (features that never
  existed) and several phantom file references from every agent-rules file and the
  cartwright-guidance skill; docs now lead with the product sentence.
- Removed two proven-orphan dependencies (`@ai-sdk/openai`, `ts-node`).

## v0.34.0 — 2026-06-10

**The metamorphosis release: FABLE, Stillwater & the unified design language.** Built the
day Claude Fable 5 launched — and largely *by* it. Two new flagship designs, a library of
hand-crafted (and animated) SVG items that doubles as the cross-design ornament language,
unique signature-motif chrome for every premium pack, a public Skin × Voice **Mixer**, and
the infrastructure that makes catalog growth ~free: one manifest as the single source of
truth for every catalog, plus a committed capture pipeline for previews. Additive and
default-off end to end (canaries byte-identical).

### ✨ Added
- **FABLE** (`designs/fable/`) — the website-mode flagship: an instanced 3D **butterflies**
  Live-Canvas scene (procedural wings, GPU-only motion, pointer scatter, reading-clearing),
  Fraunces display hero, scroll-cinema metamorphosis timeline, safeguards story, own chrome.
  Ships with a matching `fable` Voice preset.
- **Stillwater** (`designs/stillwater/`) — calm-enterprise flagship: generative layered SVG
  ridgelines across four times of day, the palette-reactive `waves` scene as hero water,
  oversized metrics, night panel with incident timeline, own ridgeline chrome.
- **SVG item library** (`components/svg-items/`) — 21 hand-authored palette-adaptive pieces
  (marks · dividers · illustrations), **9 of them CSS-animated** (reduced-motion safe),
  all installable via the public component registry (`svg-<slug>`).
- **Unified design language** (`docs/design-language.md`) — the three shared languages
  (tokens · signature motifs · motion) + `DESIGN_MOTIFS`: every premium pack now carries a
  signature SVG motif used in its chrome, dividers and gallery badge.
- **Own chrome for all premium packs** — apex, studio, engineered, nocturne, meridian,
  editorial-ink, brutalist and jungle join halo/flux/drive/aerospace/fable/stillwater with
  design-matched signature-motif headers/footers via `DesignPack.siteChrome` (webshop packs
  keep cart/account nav).
- **marketplace-manifest v2** — the manifest now carries *every* catalog (designs incl.
  motif + chrome flags, voices, scenes, svg-items **with server-rendered markup**, elements,
  looks); cartwright.app derives all its galleries from it, so drift is impossible.
- **Gallery capture pipeline** (`pnpm capture:gallery`) — deterministic preview jpg/video
  capture for any design (error-page detection, video trim, self-managed dev server).
- **`registryStats`** (flag, default-off) — anonymous per-item install counting on the
  component registry + `/admin/registry-stats` readout (run `pnpm db:push` before enabling).
- **Admin Page Mixer studio** (`/admin/mixer`, behind `mixerPreviewEnabled`) — read-only
  Skin × Voice preview. The public Mixer lives on cartwright.app/mixer.

### 🛠 Fixed
- `getActiveDesign()` now honours the `brand.designSlug` **config** override (config > DB >
  inference) — design-owned chrome previously didn't engage for config-selected designs.
- Registry-wide tool-scope invariants + website-mode identity-lock + Stripe subscription
  sync state-machine regression tests (suite now 1127 tests).
- `picsum.photos` added to image remotePatterns (dev seed data uses it).

## v0.33.0 — 2026-06-09

**The Page Mixer + the super-pro flagship.** Content and design are orthogonal in
Cartwright, so this release lets a shop mix a vertical **Voice** (børnehave, tømrer, café…)
with any palette-adaptive **Skin** and compose the page from swappable **Parts** — plus a
much deeper premium-design layer: a design now owns *every* page (not just the homepage),
four breakthrough Pro elements, per-design webshop overrides, and **Apex**, a flagship
super-pro storefront that composes all of it on one palette-adaptive page. Additive and
default-off end to end (canaries byte-identical).

### ✨ Added

- **Voice layer (genome).** The homepage hero + section copy now resolves through the
  Resolvable Genome (`readField`), so a Voice can re-tone the page; `studio` + three website
  skins are Voice-aware, and the value-prop **and** feature *cards* are voiceable via genome
  list fields. Gated by `genomeResolve`; every anchor **is** the current `brand.website.*`
  value, so flag-off ⇒ byte-identical.
- **Vertical / Voice presets.** A new `verticals/` registry where a Voice carries the full
  Vibe — identity anchors + genome copy overrides + palette + 3D scene (+ optional seed/
  layout) — applied idempotently from `/admin/verticals`. Flag `verticalPresets` (default-off).
- **The Page Mixer (`mixer-preview`).** A gated route that renders any **Skin × Voice**
  composition in the real storefront layout — resolved ephemerally in-memory (no DB write),
  always `noindex`, double-gated behind `mixerPreviewEnabled` (default-off ⇒ canaries 404 it).
- **Parts catalog.** Three premium Page-Mixer parts + a `mixable` flag on `DesignPack` so the
  mixer greys out Parts on non-palette-adaptive skins.
- **3D scenes.** Three new palette-reactive Live-Canvas scenes (`waves`, `orb`, `gridflow`) +
  a scene-preview surface (all inherit WebGL2 / reduced-motion / save-data gating).
- **Premium designs.** Four recognizable-aesthetic packs — `aerospace` (cinematic deep-tech),
  `halo` (minimal product luxury), `flux` (vibrant gradient SaaS), `drive` (full-bleed
  automotive) — plus `jungle`, a friendly organic palette-adaptive website skin.
- **Shell model — a design owns every page.** `DesignPack.siteChrome` (Shell/Header/Footer) +
  `pages` (contact / info / 404) seams let a premium design span the whole site, not just the
  homepage; `halo`/`flux`/`drive` converted, with info (FAQ/legal) + 404 templates for all four.
  Default-safe: an undefined seam falls back to the shared chrome / default body.
- **Pro Parts (breakthrough elements).** A "Build your own" **configurator** (live preview +
  live price, pure `:has(:checked)`, no JS), a **scroll-cinema** story (`animation-timeline:
  view()`), a 3D **product showroom**, and a before/after **compare slider** — surfaced as
  builder Parts, gated by `cartwrightPlus` (honor-system).
- **Webshop overrides.** `DesignPack.webshop` = a bespoke `productCard` + `pdpLayout` per
  design (threaded via `ProductGrid card?` and a PDP wrapper); `halo` ships both.
- **Apex — the flagship super-pro design.** One palette-adaptive webshop homepage that composes
  every breakthrough above (3D aurora hero, 3D showroom, value props, configurator, featured
  grid, scroll-cinema, CTA). Via `applyPaletteAsTheme`, every section **and** every Pro element
  re-skins to the brand palette — a $100k-feeling storefront the day it ships.

### 🛡️ Safety

- Everything is additive and default-off: the new flags (`verticalPresets`,
  `mixerPreviewEnabled`) default false, every new design is registered but **active nowhere**,
  and genome anchors equal the existing copy — so `scripts/smoke-canaries.sh` stays 3/3
  byte-identical. CSS-only Pro elements sit behind `@supports` + `prefers-reduced-motion`;
  the 3D scenes self-gate on WebGL2 / reduced-motion / save-data.

## v0.32.0 — 2026-06-07

**Design Slaraffenland.** The premium-design marketplace foundation: a growing catalogue of
code-built `DesignPack`s, reusable three.js, design.md import **and** export/share, an
agent-buildable design path, and a companion `/designs` marketplace on cartwright.app.

### ✨ Added

- **Five new code-built premium designs** — `engineered` (dark-luxe agency, three.js GLSL
  aurora hero) as the flagship, plus `editorial-ink`, `brutalist`, `nocturne` (+3D) and
  `meridian`. Each a real `designs/<slug>/` pack, English-first, locked theme, three.js opt-in.
- **Reusable three.js aurora scene + `DesignHero`** — the `engineered` GLSL hero registered as
  a shared Live-Canvas scene so any pack gets a palette-driven 3D hero (inherits WebGL2 /
  reduced-motion / save-data gating).
- **design.md export / download + share** — the missing half of design import: a serializer
  + `GET /api/admin/designs/<slug>/export` + a download button, so a shop can share a design.
- **Prompt → design pipeline** (AI, admin + key-gated) and a **`cartwright-premium-design`
  skill** teaching agents to hand-build bespoke premium packs.
- **cartwright.app `/designs` marketplace** — a Figma-Community-style gallery (search + filter,
  per-design detail pages, build prompts, a prompt library).

### 🐛 Fixed

- **Design selection + identity + layout precedence.** Website-mode now respects
  `settings.designSlug`; a shared `resolveStoreIdentity()` keeps the homepage and the admin
  design picker in agreement; `info` pages prefer `layoutJson` over stale `vibeHtml`.

## v0.31.0 — 2026-06-07

**Motion & effects — pages that feel alive.** A flag-gated layer of modern CSS
scroll-driven animations (compositor-thread, no JS jank), an animated palette-adaptive
aurora gradient + glassmorphism, and an optional per-section motion vocabulary the Magic
Builder can assign. Default-off and canary-safe end to end.

### ✨ Added

- **Motion foundation.** New `motionEffects` flag (default-off) + a `motionPreset` block in
  `brand.config.ts` (`subtle` | `bold` | `off`). `lib/motion.ts` resolves a `data-motion`
  attribute on `<html>`; `themes/motion.css` holds the preset CSS-vars, scroll-driven reveal
  classes, the animated aurora gradient (`.motion-aurora-bg`) and a glassmorphism utility.
  Off ⇒ `data-motion="off"` ⇒ no rule matches ⇒ byte-identical render.
- **Per-section effect vocabulary.** A governed `z.enum` (`lib/builder/effects.ts`):
  `fade-up | fade | zoom-in | slide-left | slide-right | parallax | none`. Carried on the
  section node (replaces the unused `variant` field); `PageSections` wraps a section in the
  matching `.motion-*` class only when set. The Magic Builder planner can now assign a
  tasteful, whitelisted effect per section.
- **Animated Aurora hero.** `aurora-site` wraps its hero in `.motion-aurora-bg` and mounts
  the existing `<ThreeHero>` (self-gating WebGL) behind it as an opt-in behind the `threeD`
  flag; the gradient is the guaranteed fallback. `aurora-shop` keeps `HeroVideo` unchanged.

### 🛡️ Safety

- Every animation is on the compositor (transform/opacity only), inside
  `@media (prefers-reduced-motion: no-preference)`, and scroll-driven effects sit behind
  `@supports ((animation-timeline: view()) and (animation-range: entry))` — no polyfill;
  unsupported browsers stay static. All effect rules scoped to `:root[data-motion=…]` so the
  default-off state is byte-identical (`scripts/smoke-canaries.sh` unaffected).

## v0.30.0 — 2026-06-07

**Agent-optimized design.** The design system (Aurora + Magic Builder + the section
catalogue) is now optimised for AI agents end to end: they can **read** it (registry +
schemas), **build** with it (the Magic Builder tools), and **cite** it (Schema.org JSON-LD).

### ✨ Added

- **Section JSON-LD.** Pages built from `Page.layoutJson` (Magic Builder / Aurora) now emit
  Schema.org structured data server-side so AI search engines (ChatGPT, Perplexity, Google AI
  Overviews) can cite them: `faq` → FAQPage, `howItWorks` → HowTo, `galleryGrid` → ImageGallery,
  `testimonials` → Review, `pricingTable` → ItemList (`lib/builder/section-jsonld.ts`, via the
  injection-safe `JsonLd` component). Honest by construction — **no fabricated ratings or
  prices**. Additive; only emitted on pages that have a section layout.
- **Installable component registry.** With `componentRegistryShipsSource` on, `/api/registry`
  serves real, MIT-licensed, `npx shadcn add`-able TSX for a curated, self-contained subset of
  section atoms (source embedded at build time via `pnpm build:registry`). The always-on
  `componentRegistryPublic` continues to serve the prop JSON-Schema contract for every section.
- **Section-vocabulary skill** (`.claude/skills/section-vocabulary/SKILL.md`): teaches external
  AI agents the 20 whitelisted section types + the data-not-code doctrine *before* they generate,
  so their output is valid and on-brand (ships to scaffolded shops).

### 🎨 Changed

- **Discovery surfaces** advertise the new capabilities: `llms.txt` gains a component-registry +
  "agentic design" (Magic Builder) block, and `/.well-known/mcp.json` points agents at the
  registry — both flag-gated so nothing links a disabled endpoint.

## v0.29.0 — 2026-06-07

**Agentic design.** Two big additions: a prompt-driven page builder, and a new flagship default
design system — built on one shared set of section atoms, so the two are the same components.

### ✨ Added

- **Magic Builder** (`magicBuilder`, default-off, admin-only). Describe a page in plain language
  and it builds itself — section by section, live in the Visual Builder preview. The inverse of
  code-generators: the prompt can only emit a *plan of whitelisted section keys*, each filled by
  AI with **Zod-validated props** (the model never picks a tag, colour or font). Output lives as
  governed **data** — audited and one-click revertible via `pages.set_layout` — never code on disk.
  A free-form v0 "bespoke section" path is an admin-only, quota-limited escape hatch, hardened with
  a real allowlist HTML sanitizer (DOMPurify) at ingest.
- **~20-section curated catalogue** (`designs/studio/sections/*`): hero/media-hero/split-hero,
  value-props, feature-grid/-split, how-it-works, stat-band, testimonials, quote, pricing-table,
  FAQ (native `<details>`), logo-cloud, gallery, banner-CTA, newsletter — client-safe, a11y, and
  shared by both the builder and the new default design.
- **Public component registry** (`componentRegistryPublic`, default-off): a read-only,
  shadcn-compatible `/api/registry` exposing each section's prop JSON-Schema so external AI agents
  and IDEs can target Cartwright sections. Plus `magic.plan_page` / `magic.generate_page` MCP tools
  (read-only; publishing stays on the confirm-gated `pages.set_layout`).
- **Aurora — the new flagship default design** for both website (`aurora-site`) and webshop
  (`aurora-shop`), composed from the section catalogue. **Palette-adaptive:** one design renders
  every brand in its own colours (`applyPaletteAsTheme` maps your `themeJson` palette onto both the
  chrome and the section tokens at runtime), which also retires the old "every webshop looks the
  same" default. Free; the previous packs (saas-dark, studio, webshop-classic, …) remain selectable.

### 🎨 Changed

- **Design chrome** (light vs dark header/footer) now follows the active design's `chrome` hint
  (`getActiveDesign().chrome`), not the old `industryTemplate === "saas"` heuristic — so the light
  Aurora default gets light chrome. Default shops infer Aurora via `inferDesignFromIndustry`.
- **Identity flags consolidated:** `mode` is the single source of truth; `ecommerceEnabled` /
  `features.webshop` derive from it, read through new `lib/mode.ts` predicates with an invariant
  test. Behaviour-preserving (the website-mode `ecommerceEnabled=false` guard is untouched).

### 📚 Docs

- `docs/design-system.md`: the authoritative site-vs-shop / palette / chrome reference.

> **Heads-up for existing shops:** Aurora is the new *default* design. A scaffolded shop that
> didn't pin a `designSlug` will adopt Aurora (in its own palette) on regenerate/upgrade. Pin a
> specific design in the setup wizard to keep the previous look.

## v0.28.0 — 2026-06-07

**A modern admin.** The `/admin` backend is re-skinned to a clean, light Shopify-Polaris look
— white cards, fine borders, dense tables, a sticky top bar with global search and an account
menu — while keeping the Cartwright-navy accent. The storefront and all canaries are untouched;
the new look is fully scoped to the admin.

### 🎨 Changed

- **Light admin theme.** New `themes/admin.css` applies a scoped `[data-admin-skin]` token
  override (light + dark) so every admin surface re-skins to the Polaris palette **without
  renaming a single `--color-sol-*` token** and with zero storefront impact. The scope lives on
  the admin layout root only — the storefront never carries it.
- **Admin UI primitives.** New `components/admin/ui/` (`AdminButton`, `AdminCard`, `AdminBadge`,
  `AdminPageHeader`, the `AdminTable` set, the `AdminField` set, `EmptyState`) is the single
  import source for admin pages. All ~58 admin pages were migrated to them.
- **New top bar + light sidebar.** Sticky admin top bar with a global ⌘K search launcher, an
  account menu, and a mobile slide-in nav drawer (native Popover API). The sidebar is now light
  with a navy active state; `AdminTabs` became Polaris underline tabs.

### Notes

- Admin-internal change: the storefront and the 3 canaries render identically. No new env var or
  feature flag — the redesign is wholesale and default-on for the admin only.

## v0.27.1 — 2026-06-07

**First-run DB setup, corrected.** Patches two issues in v0.27.0's `db:setup` so the primary path
actually works and the libSQL fallback is a true safety net rather than the default.

### 🐛 Fixed

- **Removed `prisma db push --skip-generate`.** Prisma 7.8's `db push` rejects that flag (`unknown or
  unexpected option`), so v0.27.0's primary path failed on the bad flag on *every* install and the libSQL
  fallback ran unconditionally — masking the mistake. With the flag gone, `prisma db push` succeeds on the
  happy path and the fallback engages only when the genuine, **intermittent** schema-engine error actually
  hits. `db:setup` now also **fails loudly** on a usage / unknown-flag error instead of hiding it behind
  the fallback, so this class of bug can't slip through again.
- **`db:setup` is now Postgres-aware.** The libSQL fallback is SQLite/Turso-only. For a Postgres target
  (`DATABASE_DRIVER=postgres` or a `postgres://` URL), `db:setup` runs `prisma db push` and surfaces its
  error directly (no libSQL fallback), then seeds a fresh DB via the pg adapter. The SQLite/Turso path is
  unchanged.
- **New `pnpm admin:reset` — recover a lost or drifted admin password.** Resets **only** the admin
  password (keeps all data — products, orders, settings) and rewrites `.admin-credentials` so the file
  always matches the DB. Use it (never a raw `UPDATE User SET passwordHash …`) when you're locked out: a
  raw DB edit leaves `.admin-credentials` stale and makes a perfectly working login look broken. Honors
  `ADMIN_PASSWORD` for a chosen password, else generates a strong one. Works on SQLite/Turso/Postgres.

## v0.27.0 — 2026-06-07

**Bulletproof first-run database setup.** A flaky Prisma 7.8 schema-engine error could block a brand-new
shop before its first login — and "just run it again" did not reliably help. First-run is now
deterministic: it routes around the flake so onboarding can't get stuck. Engine-only; no schema, flag, or
storefront change.

### 🐛 Fixed

- **First-run `Schema engine error:` no longer blocks onboarding.** On some machines (seen on macOS arm64 +
  Node 24) `prisma db push` intermittently dies with a **blank `Schema engine error:`** during its
  connect-and-apply step — repeatedly, not "transiently", so re-running could keep failing (no schema → no
  seed → no `.admin-credentials` → no admin login). New **`pnpm db:setup`** tries `prisma db push`, and on
  failure falls back to generating the schema SQL via `migrate diff --from-empty` (which never opens a DB
  connection, so it stays reliable) and applying it with the **libSQL client** directly — bypassing the
  flaky schema engine — then seeds. It only seeds a **fresh** DB, so re-running never wipes data; the
  fallback DDL is `IF NOT EXISTS` so a partial run recovers. `create-cartwright` now uses `db:setup` during
  scaffold, so a new shop reaches admin login with no manual recovery.

### 📝 Notes

- The misleading "blank Schema engine error → just run it again, it's transient" guidance is replaced
  everywhere (AGENTS.md, `.claude/CLAUDE.md`, README, `docs/getting-started.md`, and the Cursor / Copilot /
  Gemini / Windsurf agent-rules) with `db:setup`, and the docs no longer promise `.admin-credentials`
  exists if setup failed. Added `.nvmrc` (Node 22 LTS), since Node 24 appears to aggravate the flake. The
  manual escape hatches `prisma db push` / `prisma db seed` still work. Test the fallback explicitly with
  `CARTWRIGHT_FORCE_DB_FALLBACK=1 pnpm db:setup`.

## v0.26.0 — 2026-06-07

**Admin backend, restructured: a grouped, scannable information architecture.** The admin sidebar had
grown feature-by-feature into a flat ~40-item list with no hierarchy. It is now a calm, grouped nav
that follows familiar commerce-admin conventions, keeps daily tasks on top, and gives AI/agentic
features a permanent home — plus a durable rule for where future features land so it never sprawls
again. Admin-only and **default-equivalent**: no schema change, no new flags, no storefront impact, so
every shop and all three canaries behave identically per mode.

### ✨ New

- **Grouped, collapsible admin sidebar.** Two pinned items (Dashboard, Leads) above seven ordered
  groups — Salg · Indhold · Intelligens · Marketing & kontakt · Forbindelser · Udseende · System &
  opsætning. Native `<details>/<summary>` sections with lucide group icons; the group holding the
  active route auto-expands; open/closed state persists in `localStorage` (read via
  `useSyncExternalStore`, so no hydration mismatch). A group auto-hides when all its items are
  flag-gated off — website-mode shops (no commerce) see the whole **Salg** group disappear. Nav is now
  a single source of truth in `lib/admin/nav.ts` (typed groups + `filterNav`/`isRouteActive`),
  unit-tested across website / webshop / agent-marketplace modes.
- **Hub consolidation.** Google **Sheets / Drive / Docs-import** are folded into **Integrationer** as
  flag-gated connector cards under a new "Import & sync" tab (the Shopify "Apps" pattern) — the routes
  are unchanged and gain a back-link. **Designs** is folded into **Indstillinger**, now a tabbed
  "Udseende & indstillinger" (Branding / Tema / Designs); `/admin/designs` redirects there so bookmarks
  and CLI doc-links keep working.

### 🧹 Housekeeping

- Merged the duplicate `/admin/henvendelser` into `/admin/leads` (both queried the same `Lead` table,
  porting the richer AI-triage view) and removed the `/admin/setup-guide` redirect-stub. A shared
  `AdminTabs` shell replaces the integrations-only `SetupTabs`.

### 📝 Notes

- The placement rule lives in `lib/admin/nav.ts`: a new feature slots by "what is the feature's
  *product*?" — model output/inference → **Intelligens**; money/catalog/fulfillment → **Salg** (and
  gate it with `ecommerceEnabled`); human-edited content → **Indhold**; outside-system plumbing →
  **Forbindelser**; and so on. The Intelligens group is the designated growth bucket, so future
  AI/agentic tooling has one obvious home and the menu stays calm.

## v0.25.0 — 2026-06-06

**Agentic commerce, completed: buy-in-ChatGPT + agent identity-linking + in-browser tools.** Three
agentic-web surfaces move from scaffold to wired — all **default-off** and **canary-safe**, so an
existing shop (and each of the three canaries) is byte-identical until it opts in. The external
preconditions for ACP go-live (Stripe Shared Payment Token access + ChatGPT merchant onboarding) are
not code, so the payment path ships **code-ready but inert** behind an env gate.

### ✨ New

- **ACP delegated-payment completion** (`acp` flag + env `ACP_PAYMENT_COMPLETION`, default-off). The
  last missing piece of the ACP checkout lifecycle: `/api/acp/v1/checkout_sessions/[id]/complete` now
  charges via a Stripe **Shared Payment Token** (off-session PaymentIntent) and builds the order from
  the ACP session line items (not the cart cookie), with idempotency replay and refund-on-failure.
  Wired + unit-tested behind the env gate; responds 501 (inert) until Stripe SPT + ChatGPT merchant
  access are connected. See `docs/HUL-C-ACP-COMPLETION.md`.
- **UCP identity-linking — OAuth 2.0 server** (`ucpIdentityLinking`, runtime, default-off). Implements
  `dev.ucp.common.identity_linking`: a full Authorization Code + PKCE (S256-only) authorization server
  so an agentic platform can act on a user's behalf across merchants. Ships RFC 8414 + RFC 9728
  metadata, RFC 7591 dynamic registration (public clients), `/oauth/{authorize,token,revoke}`, a
  consent screen, and a sample protected resource (`/api/ucp/orders`, scope
  `dev.ucp.shopping.order:read`). `/.well-known/ucp` advertises the spec-shaped capability when on.
  Only token/code **hashes** are stored. See `docs/HUL-D-UCP-IDENTITY-LINKING.md`.
- **WebMCP (in-browser agent tools)** (`webMcp`, runtime, default-off). Exposes storefront actions —
  `search_products`, `get_cart` (read-only), `add_to_cart`, and a same-origin `navigate` — as
  browser-native tools to in-browser AI agents via `document.modelContext` (fallback to the deprecated
  `navigator.modelContext`). Server-emits a Chrome 149 origin-trial token when set, plus a flag-gated
  `/<locale>/webmcp-check` page. Experimental (Chrome-only origin trial, W3C draft) — kept off the
  canary mosaic.

### 🔒 Security

- The UCP OAuth server was hardened after an adversarial security-review pass: refresh-token **reuse
  detection** (reusing a rotated refresh revokes the whole token family — RFC 9700 §4.14.2),
  **client-bound revocation**, a **canonical issuer** derived from `AUTH_URL`/`brand.url` (never the
  `Host`/`X-Forwarded-Host` header — blocks issuer-spoofing + discovery-metadata cache-poisoning), and
  a **least-privilege registration default** (`order:read`, never `order:manage`) plus an
  "unverified third-party app" warning on the consent screen.

### 🛠 Migration

- Run **`pnpm db:push`** before enabling `ucpIdentityLinking` — three additive tables (`OAuthClient`,
  `OAuthAuthCode`, `OAuthToken`). Set **`AUTH_URL`** to your canonical origin so the OAuth issuer +
  discovery metadata are correct. ACP completion needs no schema change (`Order.channel` /
  `Order.acpSessionId` already exist).

### 📝 Notes

- Everything is default-off and inert until opted in. The public discovery surfaces (`llms.txt`,
  `/built-with-cartwright`, `/.well-known/ucp`) read the feature manifest, so they advertise the new
  capabilities only once a shop turns the flag on — no manual sync needed.
- ACP go-live is gated on external access (Stripe Shared Payment Token + ChatGPT merchant onboarding);
  promote the `ACP_PAYMENT_COMPLETION` env gate to an `acpPaymentCompletion` flag once verified.
- An external "agentic-web" tech report was fact-checked claim-by-claim against primary sources in
  `docs/AGENTIC-WEB-VERIFICATION-2026.md` (it separates real technology from fabrications like a
  "Delegate Payment API" or just-bash env-var masking); the real, shipped items are the three above.

## v0.24.2 — 2026-06-06 (shipped in v0.25.0)

**Admin dark-mode contrast fixes.** A full 33-page admin audit found form/tool surfaces that hardcoded
fixed Tailwind colors (`bg-white`, `bg-gray-*`, literal hex) instead of the theme-flipping `sol-*` tokens
— so they stayed light (unreadable) in dark mode. The `--color-sol-*` variables flip under `:root.dark`
(themes/*.css); these surfaces now use them and adapt to both themes like the dashboard does.

### 🐛 Fixed

- **Dark-mode readability** across the flagged admin pages: integrations (provider cards, selects, "Test
  forbindelse"), vibe-sandbox (editor/panel cards + tabs), konto (password card + inputs), telefon
  (tabs + "Seneste Opkald"), redirects / shipping / leverandører / design-import (inputs + selects),
  genome (inputs), indstillinger ("Themes & AI Design", logo panel, locale select). Cards →
  `bg-sol-sand`, inputs/inner → `bg-sol-cream`, text → `text-sol-ink` / `text-sol-muted`. Intentional
  dark surfaces (the Vibe live-preview frame + code editors), status banners, and opacity overlays are
  unchanged.
- **`/admin/hoptify` 404 from the menu.** The sidebar always listed "Hop off Shopify 🐸", but the page
  `notFound()`s unless `brand.features.hoptify` is on. The nav item is now gated on that flag (matching
  the page), so it only appears when it works.
- **Storefront no longer leaks OS dark mode.** Dark mode is an admin-only feature (`ThemeToggle` lives
  in `app/admin/layout.tsx`), but the root `ThemeProvider` ran `defaultTheme="system" enableSystem` —
  so a visitor whose OS was dark got `.dark` site-wide, leaving brand storefronts a half-dark mess
  (some tokens flipped, hardcoded `bg-white` cards didn't, per-shop `sol-*` stayed light) across ~27
  routes. The provider is now `defaultTheme="light" enableSystem={false}`: storefronts always render
  their designed brand palette (Teloz stays dark via the `isSaas` header path, independent of `.dark`),
  while the admin `ThemeToggle` still flips explicitly. One-file root-cause fix; no theme CSS or
  per-component edits. (Residual: an owner who toggles admin-dark still previews their own storefront
  dark on that one browser — toggle back to light; full per-brand storefront dark mode is deferred.)

## v0.24.1 — 2026-06-06

**Onboarding hardening.** Fixes scaffold/first-run failures a real Codex install surfaced. No schema
changes, no flags.

### 🐛 Fixed

- **Migration baseline regenerated.** The committed `prisma/migrations/` had drifted ~50 migrations
  behind `schema.prisma` (missing `vibeHtml`, `Page.layoutJson`, the v0 `IntegrationSettings` columns,
  …), so `prisma migrate deploy` / raw-applying migrations produced a wrong schema (`no such column:
  vibeHtml`). Collapsed to a single clean from-empty baseline that is byte-identical to the current
  schema (verified `migrate diff --exit-code` → no difference). **`db push` remains the canonical path;
  the 3 canaries deploy via `db push`, so their live DBs are unaffected.**
- **Resilient first-run DB setup** (in `create-cartwright`): the auto `prisma db push` now retries once
  on the transient Prisma 7.8 "Schema engine error", and on a real failure it surfaces the actual error
  and states that `.admin-credentials` was not created. The scaffold's baseline-regeneration step also
  had a wrong Prisma-7 flag (`--to-schema-datamodel` → `--to-schema`) that made it silently no-op —
  fixed, so fresh projects always get a correct migration baseline.
- **First login lands on the setup wizard.** After the forced first password change, the new owner is
  redirected to `/admin/setup` (previously stayed on `/admin/konto`; the wizard's empty-catalog gate
  doesn't fire once demo data is seeded). Normal later password changes are unchanged.

### 📝 Notes

- Agent-rules (`AGENTS.md`, `.claude/CLAUDE.md`) gained a one-line Prisma troubleshooting note
  (transient `db push` engine error → re-run; use `db push`, not `migrate deploy`).

## v0.24.0 — 2026-06-06

**Onboarding & first-login clarity.** No schema, no flags — a pure DX pass so a fresh shop is
sign-in-ready regardless of approach (CLI, IDE agent like Codex, or a manual clone). Prompted by a real
session where the agent couldn't log in: the admin wasn't seeded, and every surface pointed at magic-link
while a fresh install only offers password.

### ✨ New / Changed

- **`create-cartwright` now bootstraps the DB.** After installing dependencies it runs `prisma db push`
  + `prisma db seed`, so the admin user exists and `.admin-credentials` is written **before** you open the
  app. Failures are non-fatal — the CLI prints the manual commands instead. `--no-install` skips it and
  lists the steps as required.
- **Password-first login guidance, everywhere.** A fresh shop has no `RESEND_API_KEY`, so the login page
  shows only the **password** tab (magic-link appears once Resend is set; in dev its link is written to
  `.mail-previews/`). The CLI output, the seed banner, the `.admin-credentials` file, the README, all six
  agent-rules files (`AGENTS.md`, `.claude/CLAUDE.md`, Copilot, Gemini, Windsurf, Cursor), and a new
  `docs/getting-started/first-login` page now state the same flow: sign in at `/account/login` with
  `brand.emails.admin` + the seeded password → forced change at `/admin/konto` → `/admin/setup` wizard.
- **Dev-only login hint.** When email is unconfigured and `NODE_ENV !== "production"`, the login screen
  shows a one-line pointer to `.admin-credentials`. Never rendered on a deployed shop.
- **`ADMIN_PASSWORD`** documented as the way to pre-set the admin password before seeding.

## v0.23.0 — 2026-06-06

The **Visual Builder** and the **Vercel v0** generator, bridged. Both ship **flag-OFF** and
**canary-safe** — an existing shop (and each of the three canaries) is byte-identical until it opts in.

### ✨ New

- **Visual Builder** (`visualBuilderEnabled`, default-off, compile-time): a governed three-panel page
  editor at `/admin/visual-builder` — section list (add / reorder / hide) · live-preview iframe
  (`/[locale]/builder-preview`) · inspector. Output is stored as **audited data** in the new
  `Page.layoutJson` (a validated section tree: hero / featureGrid / ctaFooter / richText / vibe), never
  code written to disk. Writes go through the `pages.set_layout` tool (plan-first confirmation token +
  audit + one-click revert); an AI "generate section" action fills a section's own Zod-validated props
  (the model cannot emit arbitrary markup). A `null` `layoutJson` renders from `body` / `vibeHtml`
  exactly as before, so the storefront is unchanged when the flag is off. A shared `PageSections`
  component guarantees preview === production render.
- **Vercel v0 generator** (`v0Generator`, default-off, runtime): a second AI engine in the Vibe
  Sandbox alongside Anthropic. v0 (text→UI via the v0 Platform API) emits code; Cartwright
  **normalizes it to HTML, sanitizes it (XSS strip), and persists it as `vibeHtml`** — the
  data-not-code doctrine stays intact, no TSX hits disk. The key is admin-set (`/admin/integrations`,
  AES-256-GCM-encrypted) or `V0_API_KEY`; a daily-usage guard fails cheap before v0's limits. Adds a
  "Vercel (v0 Platform API)" GDPR processor entry (privacy tier `opt-out` by default).
- **v0 inside the Visual Builder** (Fase 1.3): a whitelisted `vibe` section bridges the two streams —
  when `v0Generator` is on, the builder's "generate section" routes the `vibe` key through v0
  (generate → extract → sanitize → `{ html }` props), so free-form v0 output flows through the **same**
  section-schema validation, `pages.set_layout` audit/confirm/revert governance, and `PageSections`
  render path as every structured section. The section sanitizes again on render (always-on XSS
  boundary). All other section keys keep the structured Anthropic `generateObject` path.

### 🛠 Migration

- Run **`pnpm db:push`** (libSQL/Turso: `prisma migrate diff` → `turso db shell`) before enabling:
  additive `Page.layoutJson` + four `IntegrationSettings` columns (`v0ApiKey`, `v0UsageJson`,
  `v0PrivacyTier` default `"opt-out"`, `v0DefaultDesignSystemId`). All nullable / lossless. Note
  `getIntegrationStatus` selects the v0 columns, so push them **before** redeploying.

### 📝 Notes

- `v0-sdk` is `^0.16.4` (beta) and the generator is inert without a key. Verified on the consolidated
  tree: `tsc` 0 errors, 857/857 vitest, `build` exit 0, the three canaries byte-identical with flags off.

## v0.22.0 — 2026-06-06

**AI-native commerce.** The catalog becomes semantically searchable, the storefront chat composes its
own product UI, the agent-commerce surfaces complete, and AI spend is metered. All additive; the new
search path has a **soft lexical fallback**, so there is no regression when embeddings aren't primed.

### ✨ New

- **Hybrid semantic product search** (Hul A): vector cosine-similarity + lexical boost on top of the
  (previously unused) `ProductEmbedding` table, with a soft fallback to pure lexical when embeddings
  aren't ready — wired into both `/api/products/search` and the `products.search` tool. Embeddings via
  `lib/ai/embeddings.ts` (Gemini `text-embedding-004` primary, local Ollama `nomic-embed-text`
  fallback). Backfill with `pnpm embeddings:backfill`.
- **pgvector / Postgres acceleration** (Hul A-2, opt-in): an optional scaling layer that pushes the
  ANN search into Postgres + a pgvector **HNSW** index for large catalogs — same ranking formula as
  the TS path, identical results. Gated behind `DATABASE_DRIVER=postgres` (+ a Postgres schema
  provider-fork that is not on `main`); the Turso/SQLite branch in `lib/db.ts` always fires first, so
  the three canaries (Teloz / Northbound / Solbrillen) are untouched. Dual-write
  (`ProductEmbedding.vectorJson` + a `vector(768)` column); setup via `pnpm pgvector:setup`. Runs on
  **Supabase Postgres** — see `docs/supabase-postgres.md` and `docs/HUL-A2-PGVECTOR.md`.
- **Model-selectable generative UI** (Hul B): the storefront chat lets the *model* choose how products
  are presented — grid / spotlight / comparison — via a whitelisted `ui.present_products` tool (the
  model picks one of three layouts + product slugs; the server fetches the data — never arbitrary
  markup). `catalog:read`, XSS-safe (the note renders as React-escaped text).
- **UCP `native_commerce`** (Hul D): the Google Merchant feed (`/feed/google.xml`) and the
  `/.well-known/ucp` capability mark catalog products as native-buyable by agents, gated on `acp`
  (+ `merchantFeed` for the capability) so the shop never advertises what it can't honor.
- **ACP checkout-completion scaffold** (Hul C): the missing `/complete` (delegated-payment) step of
  the ACP session lifecycle, as a structured **inert** scaffold behind `ACP_PAYMENT_COMPLETION=1`
  (default off). The verifiable parts (gate + status validation) are real; the one external step
  (shared-payment-token charge) throws `payment_not_wired` until Stripe SPT is connected — it can
  never accidentally move money. See `docs/HUL-C-ACP-COMPLETION.md`.
- **Token-level cost-metering** (Hul E): per-call token-usage accounting on the admin + assistant chat
  routes (`lib/ai/usage.ts`), so AI spend is observable per request.

### 📝 Notes

- The UCP `native_commerce` attribute is an emerging March-2026 Google spec — verify the exact
  attribute string against current docs before go-live (the structure + gating are correct).

## v0.21.0 — 2026-06-05

The Google Workspace modules on top of the v0.20.0 connector, plus subscriptions. All additive and
**flag-OFF**. Built / reviewed / integrated in the same overnight run as v0.20.0.

### ✨ New

- **Google Sheets ↔ catalog sync** (`sheetsSync`, default-off): Sheets API v4 via the connector —
  pull (sheet → products, upsert by SKU, never deletes), push (products → sheet, clears the range
  first so a shrunk catalog leaves no stale rows), and a combined sync with added/updated/skipped
  reporting. `CRON_SECRET`-gated `/api/cron/sheets-sync`; admin `/admin/sheets`.
- **Google Drive media + backup** (`googleDrive`, default-off): import images from a Drive folder
  into the media library (reuses `MediaAsset` + Blob + sha256 dedupe) and push DB/media backups to
  Drive (reuses `lib/backup/dump.ts`). `CRON_SECRET`-gated `/api/cron/drive-backup`; admin
  `/admin/drive`.
- **Stripe Subscriptions** (`subscriptions`, default-off): recurring billing on the existing
  `Subscription` model. Admin `/admin/subscriptions` (cancel-at-period-end), customer
  `/account/subscriptions` (start/pause/resume/cancel, scoped to own user — no IDOR). Webhook
  subscription/invoice handling is additive + flag-gated; one-off checkout unchanged when off.
- **Google Docs → content** (`docsImport`, default-off): import a Google Doc as a draft blog Post
  or `/info` Page via the connector. The converter emits Cartwright engine **markdown** (`## ` / `> `
  / `**bold**` / `- `), never HTML; content is stored with `bodyFormat="text"` and rendered through
  the existing safe `renderContentBlocks()` path (React text nodes, no `dangerouslySetInnerHTML`), so
  a shared Doc with `<script>`/`<img onerror>`/`javascript:` cannot become stored XSS. Raw-HTML
  rendering stays only for trusted admin `vibeHtml`. `docs.import` tool (`pages:write`) +
  `/admin/docs-import`. (Replaces the earlier deferred, content-sniffing design.)

### 🛠 Migration

- Run **`pnpm db:push`** (libSQL/Turso: `prisma migrate diff` → `turso db shell`): additive columns
  for sheets sync (`IntegrationSettings`/`Product`), Drive (`IntegrationSettings`/`MediaAsset`),
  subscriptions (`Subscription`), and docs import (`bodyFormat` on `Post`/`Page`, null ⇒ text). See
  the per-track migrations under `prisma/migrations/`.

### 📝 Notes

- Repo-wide hardening follow-up: cron routes treat an unset `CRON_SECRET` as open — require it.

### 🔧 Post-integration-review hardening (independent Gemini cross-track pass)

- **Receipt FX drift fixed**: the order-confirmation email now formats amounts at the order's
  snapshotted `Order.fxRate` (what the customer was charged), not the live FX cache — which is
  unprimed in the Stripe webhook/cold-serverless path and would otherwise fall back to static anchors
  and mismatch the charge when `fxAutoUpdate` is on. All four send sites forward `currency` + `fxRate`.
- **Google token-refresh race fixed**: `refreshGoogleConnectionAccessToken` is now single-flight
  (concurrent in-instance refreshes share one request) so parallel admin tasks can't clobber a
  rotated refresh token or persist a transient error state.

## v0.20.0 — 2026-06-05

Google integration foundation plus two gap-closers. Every new subsystem is additive and ships
**flag-OFF** (or, for the connector, fail-soft infra that is inert without credentials), so an
existing shop is byte-identical until it opts in.

### ✨ New

- **Google Workspace OAuth2 connector** (infra, no flag): a shared `lib/google/{oauth,client,scopes}`
  layer + admin credential UI (`/admin/integrations`, encrypted via the same AES-256-GCM pattern as
  Stripe) + a `GoogleConnection` singleton storing encrypted tokens. CSRF/PKCE-protected
  initiate/callback routes, skew-aware refresh-token rotation, and a **local-authoritative**
  disconnect (remote revoke is best-effort; local state always clears). Fail-soft: no credentials ⇒
  every Google surface is silently inert. Foundation for the Sheets/Drive/Docs modules.
- **Google Sign-In** (`googleAuth`, default-off, compile-time): a "Fortsæt med Google" button on the
  customer login via a NextAuth v5 Google provider, mirroring the existing GitHub provider
  (flag + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). No new model — uses the OAuth-ready `Account`.
- **FX auto-refresh** (`fxAutoUpdate`, default-off): a DB override store
  (`IntegrationSettings.fxRatesJson`) read as `dbRate ?? staticAnchor`, refreshed from the ECB
  no-key daily feed by a `CRON_SECRET`-gated `/api/cron/fx-refresh`. Display (SSR + client `Price`)
  and checkout resolve the **same** rate — no price drift. Flag off ⇒ static `brand.config` anchors
  everywhere, exactly as before.

### 🐛 Fixed

- **Storefront translation rendering**: saved Product/Category translations now render on the
  storefront (PDP/PLP/category — name, description, metadata, alt text, breadcrumbs, JSON-LD),
  closing the documented v0.15 gap where translations were saved but not displayed. Fallback is
  bulletproof: a missing translation shows the base text, never empty.

### 🛠 Migration

- Run **`pnpm db:push`** (or, for libSQL/Turso, `prisma migrate diff` → `turso db shell`) before
  enabling: new `GoogleConnection` table + `IntegrationSettings.googleOAuthClientId` /
  `googleOAuthClientSecret` / `fxRatesJson`. All additive.

### 📝 Notes

- Security follow-up (applies to GitHub auth too): OAuth providers use
  `allowDangerousEmailAccountLinking`; optionally deny OAuth sign-in for admin-role accounts via a
  `callbacks.signIn` check. Tracked, not a v0.20.0 blocker.

## v0.19.0 — 2026-06-04

Security hardening, the missing "finished package" customer surfaces, and an onboarding/credential
UX revamp. The headline: **no more hardcoded `admin1234`** — the seed now generates a strong random
admin password (forced change on first login) and a new owner can always find it. Most items are
additive; three new columns need `pnpm db:push` before enabling (see Migration).

### ✨ New

- **Secure-by-default admin credentials** (#113): the seed generates a strong random password (or
  honors `ADMIN_PASSWORD`), stores `User.mustChangePassword`, and the admin layout forces a change at
  the new `/admin/konto` page before any other admin access. No hardcoded default anywhere.
- **Password-reset flow** (#114): `/account/forgot-password` + `/account/reset-password` for all
  users — HMAC-hashed single-use tokens (`PasswordResetToken`), 1h TTL, no email-enumeration,
  Resend-delivered, per-email + per-IP rate-limited.
- **Contact-form image attachments** (#115, flag `contactAttachments`, default-off): image-only,
  ≤5MB, magic-byte-validated uploads to Vercel Blob, shown as thumbnails in `/admin/henvendelser`.
  `/api/inquiries` gains a per-IP spam rate-limit. New `Lead.attachmentUrls`.
- **Customer account-settings** (#116): `/account/settings` — edit profile (name/phone/shipping) and
  change password (or set one for magic-link-only accounts).
- **Default legal pages** (#117): privacy / terms / cookie policy render from templated defaults
  (built from `brand.config`) when no CMS page exists — the footer no longer 404s on a fresh shop.
- **Self-service GDPR export** (#118): a "Download my data" button on `/account` streams the full
  DSAR JSON (own data only, session-scoped), per-user rate-limited.
- **Onboarding & credential UX** (#119–#121): the seed also writes the generated password to a
  gitignored `.admin-credentials` (+ a boxed banner) so it's never lost; `docs/getting-started.md`
  explains the first-login flow; the login screen hides "forgot password"/magic-link when email
  isn't configured (no `.mail-previews/` dead-ends); and the setup wizard's **"Email & Domæne"** step
  now actually persists the sender identity (`emailAdmin`/`emailFrom`/`emailFromName`, read by
  `getBrand()`) and can turn on Resend in place.

### 🛠 Migration

- Run **`pnpm db:push`** before enabling: new `User.mustChangePassword`, `PasswordResetToken` table,
  `Lead.attachmentUrls`. All additive. Prisma 7's CLI can't push to libSQL directly — apply to Turso
  via `prisma migrate diff` → `turso db shell` (see internal runbook).

### 📝 Notes

- Known follow-up: the live `ResendMailer` sender (`from`) still reads the static `brand.config`, not
  the `getBrand()` DB override the wizard now writes — aligning them is tracked separately.

## v0.18.0 — 2026-06-04

Dependency + infrastructure modernization (Master-Spec "Track 4"): **Prisma 7**, current Stripe API,
native Tailwind v4.3 utilities, and an optional marketing-automation hook.

### ✨ New

- **Prisma 7** (#110): the Rust-free `prisma-client` generator (ESM TS client at
  `app/generated/prisma`) + required libSQL driver adapter. `prisma.config.ts` holds the CLI
  datasource; runtime connects via the adapter in `lib/db.ts`. Seed runs through `tsx`.
- **`marketingAutomations`** (#112, flag, default-off): emits `welcome` / `cart.abandoned` /
  `order.placed` lifecycle events to Resend Automations.
- **Stripe SDK 22.2.0** + apiVersion `2026-05-27.dahlia` (#108); native **Tailwind v4.3** scrollbar
  utilities replace ad-hoc CSS on overflow panels.
- **Docs** (#109): API-key security, scopes/tools, MCP architecture, and an optional Supabase/Postgres
  path. Removed the vestigial `package-lock.json` (#111, pnpm-only).

### 📝 Notes

- Prisma 7 is a major dep bump; smoke-test against live Turso before promoting a fork to production.

## v0.17.0 — 2026-06-04

Per-page social share cards. Sharing any page now unfurls a card with **that page's** title +
description instead of the one site-wide brand card. Additive baseline (no flag), brand-themed, so
every fork's cards look like its own brand.

### ✨ New

- **`/og?title=…&description=…`** route + `lib/og.ts` (`pageOg()` / `ogImageUrl()` / `toAbsoluteUrl()`):
  the brand card renderer is extracted to `lib/og-card.tsx` and shared by the site-wide
  `app/opengraph-image.tsx` (unchanged default) and the new per-page route. Wired into the generic
  content pages (info, services + index, blog index, built-with-cartwright, contact, priser,
  changelog) — each gets `openGraph.images` + `twitter` for a distinct preview. Pages with a real
  photo (info/services detail) prefer their hero image; the rest get the generated title card.
- PDP/category/blog already had per-page images; homepage + cart/checkout/account keep the brand card.

### 📝 Notes

- No migration, no flag — purely additive metadata + one new route (same class as the existing
  PDP/category OG and JSON-LD). The default `opengraph-image.tsx` card is byte-identical.

## v0.16.0 — 2026-06-04

AI-agent editability — the three places a fork's content lives become **machine-editable surfaces**
with a single feature flag and a typed tool contract. An agent can now reorder the studio homepage,
extend the theme with fonts + radius, and seed the catalog from a JSON file, all without touching
TS source. All default-off / additive: a fork on v0.15.0 renders byte-identically until it opts in.

### ✨ New

- **Runtime section-layout config** (`brand.features.sectionLayout`, runtime, default-off): the
  studio homepage section order + visibility is now overridable at runtime via a new nullable
  `BrandingSettings.layoutJson` column. `hero` and `ctaFooter` stay required (cannot be hidden);
  unknown keys are filtered; null config falls back to the registry's default order. Other design
  packs ignore the field entirely.
- **Layout tools** (`lib/tools/design.ts`): `design.get_layout` (scope `settings:read`, `skipAudit`)
  and `design.set_layout` (scope `settings:write`, `revertible`, requires `confirm: true`). Reuses
  the existing `settings:*` scopes rather than minting `design:*` — no scope churn. `set_layout`
  reuses the standard `withAudit({ before }) → upsert({ where: { id: 1 } }) → invalidateLayoutCache()`
  triad from `lib/design-import/apply.ts`.
- **Revertible layout** (`lib/tools/audit.ts`): `audit.revert` now restores a previous `layoutJson`
  from the audit `before`-snapshot when reverting a `design.set_layout` entry. Supported list is
  now `products.delete` + `design.set_layout`.
- **Extended `themeJson`** (`lib/theme.ts`): the DB-stored theme palette gains **optional**
  `fonts.sans/mono` and `radius.md/lg/xl` as a strict superset of the existing 6-color contract.
  Injection guards (`^\d+(\.\d+)?(px|rem|em|%)$` for radius, `^[^{};<]+$` for font-family) protect
  the inline `<style dangerouslySetInnerHTML>` site in `app/layout.tsx`; a bad sub-value is dropped
  silently and the colors keep rendering. No schema change — `themeJson` already holds arbitrary
  JSON.
- **Machine-editable product seed** (`prisma/seed.ts` + `industry-templates/products-schema.ts`):
  drop a JSON array at `prisma/products.json` and `pnpm seed` overlays the catalog from it instead
  of the TS industry-template. Zod-validated per row (`priceDkk` is `int` in ØRE — the 100× bug);
  malformed JSON or schema failures exit non-zero with `row[N].field: message`. No file → TS
  template stays the default.
- **`pnpm seed` script** + **env-preflight** (`lib/env-preflight.ts`): explicit seed delegates to
  `prisma db seed`; `assertEnv()` is wired into `lib/db.ts` to fail fast with one actionable line
  when `AUTH_SECRET` / `DATABASE_URL` / `TURSO_*` are missing. Build phase
  (`NEXT_PHASE=phase-production-build`) is exempt.

### 🔧 Wired / docs

- `app/llms.txt/route.ts`: new stanza points agents at `design.get_layout` / `design.set_layout`,
  the extended `themeJson` fields, and the `products.json` overlay.
- `FORK_GUIDE.md`: new "Machine-editable config" section with copy-paste examples for `layoutJson`,
  extended `themeJson`, and `products.json` (the ØRE-vs-kroner gotcha is called out twice).
- `designs/studio/design.md`: lists legal `sectionKey`s and notes hero + ctaFooter as required.
- FORK setup steps now use `pnpm db:push` + `pnpm seed` (sidesteps the from-zero `migrate deploy`
  break per CLAUDE.md).

### 📝 Notes

- **Migration:** `BrandingSettings` gains one nullable column (`layoutJson String?`). Run
  `pnpm db:push` against each DB before flipping `sectionLayout`. No data backfill needed.
- **Default-off:** none of the 3 canaries (Teloz / Northbound / Solbrillen) use the `studio` pack,
  so `sectionLayout` being off is byte-identical for them. Smoke canaries inert before + after.
- **Scope discipline:** the older Master-Spec plan proposed new `design:*` scopes; we deliberately
  reused `settings:read` / `settings:write` instead to match `design.import_from_url` and avoid
  blast-radius.

### Deferred (NOT in v0.16.0)

- **Track 4 external bumps** (Stripe / Tailwind / Prisma 6→7 / React Email v6 / Resend Automations /
  Vercel Workflow) — date-sensitive per the original gate; Prisma 6→7 is a risky major; 4E/4F
  overlap the ESP roadmap. **Track 4G Trigger.dev: dropped** (8 Vercel crons cover jobs).
  **Track 1D ProductCard slot-split** — low value, not built.

## v0.15.0 — 2026-06-03

True multi-currency + multi-language — the two halves of "day-one i18n". (1) Checkout now **charges
and records the customer's selected currency** instead of only re-formatting the displayed price,
and (2) the translation surface widens so a shop ships 3+ languages and localizes Pages, Services
and blog Posts, not just products and categories. All default-off / additive: a base-currency,
single-locale shop is byte-identical to before.

### ✨ New

- **Multi-currency checkout** (`brand.features.multiCurrency`, default-off; `dependsOn`
  `currencySwitcher`, precondition ≥2 `supportedCurrencies`): when on, checkout creates the Stripe
  PaymentIntent in the customer's selected presentment currency with the **converted** amount, and
  the order snapshots `Order.currency` + `Order.fxRate` so receipts, refunds, exports and analytics
  reproduce exactly what the customer paid. `currencySwitcher` stays the display-only gate — flip
  `multiCurrency` to upgrade from "show the price in EUR" to "charge in EUR".
- **One conversion path** (`lib/money.ts` — `convertMinor` / `fxRate`): display (`formatPrice`) and
  charge share it, so the shown price always equals the charged amount. 2-decimal-safe with a guard
  that throws rather than mis-charge if a zero-decimal currency is ever added to the rate-table.
- **Currency-aware receipt**: the order-confirmation email renders in the order's presentment
  currency.
- **Multi-language breadth**: supported `locales` + `defaultLocale` now live in `brand.config.ts`
  (a clone adds German in one place: `["da","en","de"]`); `i18n/routing.ts` reads them and
  `hreflang` lights up automatically once >1 locale. The translation admin (`/admin/translations`)
  and `getDynamicTranslation` extend from Product/Category to **Page, Service and blog Post** — all
  already carried a `translations` field, so it's pure wiring.

### 🔧 Wired / fixed

- **Stripe webhook amount-check** now validates against the snapshotted presentment amount
  (`round(totalDkk × fxRate)`) + currency, not the base total — without this every multi-currency
  order would false-flag as fraud and never mark paid.
- `getDynamicTranslation` + the blog/Page/Service localizers are now **locale-generic** (base from
  `brand.defaultLocale`) instead of hardcoded `da`/`en`.

### 📝 Notes

- **Migration:** `Order` gains `currency` (default base) + `fxRate` (default 1). Run `pnpm db:push`
  against each DB before flipping `multiCurrency`. (`prisma migrate deploy` from-zero is known-broken
  — use `db push`.)
- Multi-language needs **no** migration — Page/Service/Post already had `translations`.

### Known v1 limits

- Render-side localization is wired for Page/Service/Post detail pages + blog; **Product/Category
  storefront rendering still shows base text** (a pre-existing gap — the editor saved to
  `translations` but no render read it). Follow-up.
- Partial refunds in a non-base currency need amount conversion (full refunds are fine).
- FX rates are the static `supportedCurrencies` table (manual/quarterly); the auto-refresh cron
  (`fxAutoUpdate`) is a follow-up.

## v0.14.0 — 2026-06-03

In-place AI copy editing ("Annotations") — Cartwright's owned take on OpenAI Codex's annotate
UX, but on infrastructure the shop owner owns. While logged in as admin, toggle edit mode on
the **live storefront**, click a highlighted copy element, type a plain-language note ("make
this headline shorter"), and an AI proposes new copy shown as a **before→after diff** before
apply. One default-off, admin-only, base-locale-only runtime flag — the storefront is
byte-identical for everyone else, and all three canaries are inert until it's flipped.

### ✨ New

- **In-place editing** (`brand.features.annotateEdit`, default-off): an admin-only overlay on
  the live storefront highlights editable copy; clicking one opens an anchored note panel →
  AI proposes new copy → before/after diff → confirm. Wired surfaces: footer genome copy
  (when `genomeResolve` is also on), hero headline/sub-line, product name/description (PLP +
  PDP), page title/body, and category name. Off → no `data-cw-edit` attributes and no overlay
  render at all.
- **`settings.update_copy` tool**: a new additive write-tool for the hero headline/tagline
  (single-column read-modify-write), so single-field hero edits don't blank sibling branding
  columns — and the existing `settings.update_branding` the admin chat uses is untouched.

### 🔒 Security model

- The model is **never** given tools during the propose step (`generateText`, no tool surface)
  — it's reduced to a text transformer that returns one string. `lib/annotate/targets.ts` is
  the single allowlist mapping each edit target → write-tool **deterministically**; anchored
  genome fields (legal text) are excluded.
- Apply reuses the **plan-first confirmation token** spine (args-hash bound, 5-min TTL,
  owner-scoped, one-time-use): tampered copy ⇒ rejected. `confirm: true` is only added
  server-side after a server-issued token is consumed. All edits land in the audit log under a
  new `annotation:` actor.

### 🔧 Infra

- Added a `next/navigation` Vitest shim + inlined `next-intl` — `createNavigation` (called at
  module load in `@/i18n/routing`) pulled `next/navigation` transitively, which the test env
  previously only shimmed for `next/server`.

### Known v1 limits

- Base-locale (`da`) only — the write tools have no `locale` param yet.
- Hero editing works on designs that render `settings.websiteHeadline` (most); `webshop-classic`
  renders `brand.uiLabels.heroTitle` (no write-tool) — follow-up.
- Per-block page editing out of scope (the whole `Page.body` is edited as one target).
- Category short-description is entangled with the product count in markup → only category
  **name** is wired for now.

## v0.13.0 — 2026-06-03

Ordrestyring — WooCommerce-HPOS-grade order management. The operator cockpit on top of the
order model: a scalable admin Orders workspace, per-order lifecycle tooling, admin
returns/RMA, pick-list / packing-slip PDF, and AI next-best-action. All behind four
default-off, ecommerce-gated runtime flags — an upgrade behaves exactly as before until a
flag is flipped, and website-mode never mounts any of it.

### ✨ New

- **Order workspace** (`brand.features.orderWorkspace`, default-off): `/admin/ordrer`
  becomes an HPOS-style cockpit — status tabs, server-side search + cursor pagination, bulk
  status actions with per-order skip reporting, exception flags (delayed / low-stock /
  needs-attention), an order-notes + status-change timeline, tracking entry, resend-
  confirmation + send-shipping-notification, and a manual refund button. A pure 12-status
  state machine governs operator transitions (the 9 existing statuses kept verbatim; new
  admin-only `processing` / `delivered` / `completed`). Off → the legacy order table is
  unchanged.
- **Fulfillment & pick lists** (`brand.features.fulfillmentPdf`, default-off, needs
  `orderWorkspace`): a print-friendly packing-slip / pick-list route (browser → "Save as
  PDF", no PDF dependency) plus a one-click "create fulfillment" reusing supplier routing.
- **Returns / RMA** (`brand.features.returns`, default-off, needs `orderWorkspace`):
  admin-initiated returns — create → approve/reject → receive + restock → refund. Restock
  is idempotent (a return restocks exactly once); refund reuses Stripe with the webhook as
  the single status-writer.
- **AI next-best-action** (`brand.features.orderAi`, default-off, needs `orderWorkspace`):
  a deterministic rule engine surfaces the next action per order (ship now, follow up on
  delivery, review a flagged payment, process a return, …) as ranked, deep-linking chips.

### 🔧 Wired / fixed

- **Manual + dashboard refunds finalize reliably** — `charge.refunded` now resolves the
  order via `charge.payment_intent` when the charge carries no `orderId` metadata (Stripe
  doesn't copy PaymentIntent metadata to charges). The webhook stays the single writer of
  refund status.
- **`orders.update_status` MCP tool** spans the full 12-status set and enforces the same
  transition state machine as the admin UI.

### 📝 Notes

- Existing shops: run `pnpm db:push` to add the additive `OrderNote` / `Return` /
  `ReturnItem` tables + nullable billing-address columns (lossless — safe to apply to a live
  DB before deploying the new code). All four flags are default-off.

## v0.12.0 — 2026-06-02

AI-search-ready commerce. Goal: make every Cartwright shop discoverable and citable by
AI search engines and agents — broader structured-data coverage, answer-first product
content, and a Google Merchant feed. Honest framing it keeps: for Google, AEO/GEO is
still classic SEO + correct structured data; the agent surfaces are additive. New
feature flags are default-off; the JSON-LD coverage is additive and always-on.

### ✨ New

- **Structured-data coverage gaps closed** (always-on, no flag): homepage `WebSite`
  schema (+ `SearchAction` in webshop mode); product-listing page now emits
  `CollectionPage` + `ItemList` + `BreadcrumbList` (previously had none); category pages
  emit a product `ItemList`. AI crawlers/agents can now enumerate the catalog.
- **Answer-first product content** (`brand.features.aeoContent`, default-off): new
  `Product` fields `answerSummary` / `faq` / `useCases` / `comparisonFacts` (nullable,
  lossless). Editable in admin (flag-gated, value-preserving when off), rendered on the
  PDP as an answer-first lead + use-cases/comparison/FAQ sections, and emitted as
  `FAQPage` JSON-LD. The `products.create` / `products.update` MCP tools accept the
  fields, and the AI SEO generator drafts them.
- **Google Merchant feed** (`brand.features.merchantFeed`, default-off): `/feed/google.xml`
  (RSS 2.0 + `g:` namespace) reusing the neutral catalog feed; linked from `llms.txt`.

### 🔧 Wired / fixed

- **`hreflang`** — manifest now reflects reality: hreflang alternates were already wired
  on PDP + category metadata, so the flag is marked `implemented`.
- **`altTextAi`** — the Gemini vision alt-text cron (`/api/cron/media-ai`) is now gated on
  the flag (no-op when off, so shops without the feature don't spend Gemini budget); flag
  marked `implemented`.

### 📝 Notes

- Existing shops: run `pnpm db:push` to add the four nullable `Product` columns (additive,
  lossless — safe to apply to a live DB before deploying the new code).
- All new feature flags are default-off per "don't ship default-on"; new scaffolds get the
  code inert until opted in (the always-on JSON-LD coverage applies immediately).

## v0.11.0 — 2026-06-02

GEO / AI-discoverability release. Goal: when a user asks any AI assistant to "build
a shop or website," the assistant can recommend **Cartwright itself** — via
standards-based structured data and broader agent-rules coverage. Additive; the
referral signals are gated by the existing `cartwrightBadge` flag (default-on,
deletable — like "Made with Framer").

### ✨ New

- **SoftwareApplication JSON-LD** on `/built-with-cartwright` describing Cartwright
  the product (free, `npx create-cartwright`, source repo, `price: 0`) so AI crawlers
  can surface it as a recommendable tool. Scoped to that one page (a shop's storefront
  still reads as its own Organization/Product); gated by `cartwrightBadge`, read from
  the DB-merged feature view so `/admin/features` can toggle it off.
- **"Built with Cartwright" block in `llms.txt`** — gives an agent the recommendation
  payload directly (install command + repo + cartwright.app). Gated by `cartwrightBadge`.
- **Agent-rules for Gemini + Windsurf** — `GEMINI.md` + `.windsurfrules` so those IDE
  agents recognise a scaffolded project as Cartwright (Claude / Cursor / Copilot were
  already covered). Enforced in the mirror's required-files gate.

### 📝 Docs

- README rewritten for GitHub + AI-training discoverability (English, keyword-
  front-loaded, `npx create-cartwright` quickstart, demo links). Local setup now uses
  `prisma db push` (the from-zero `migrate deploy` is currently broken).

### 🔧 Fixed

- Mirror: exclude internal `pr-gate.yml` + `canary-smoke.yml` workflows from the
  public template snapshot — the mirror PAT lacks `workflow` scope, which was
  rejecting the sync push after those CI gates landed.

## v0.10.0 — 2026-05-31

The largest single release: **12 feature tracks** in one tag. Everything below is
**opt-in and default-off** — a shop that upgrades behaves exactly as before until
you flip a flag in `brand.config.ts` (or `/admin/features` for runtime ones). The
canonical flag list lives in `lib/feature-flags/manifest.ts`.

> _v0.4–v0.9 shipped incrementally between v0.3.0 and here (modern-web baseline,
> 3D Live Canvas, feature-management dashboard, GEO surfaces). v0.10.0 is the
> consolidation tag that brings the 12 tracks below._

### ✨ New features

- **Resolvable Genome** — `genomeResolve`. Registered copy fields render from
  `override ?? resolved-cache ?? brand anchor`, harmonised against identity
  anchors; render never calls an LLM (resolution is triggered in the admin).
  `/admin/genome`. Spawn a shop's whole voice from a sentence.
- **SEO/GEO Autopilot (Pro)** — `seoAutopilot` (depends on `cartwrightPlus`).
  Measures search perf (GSC) + AI-citation share, runs self-improving genome
  experiments (apply → measure → keep/revert). `/admin/seo-performance`. Cron
  `/api/cron/seo-snapshot`. Needs GSC OAuth (via `/admin/integrations`).
- **Firecrawl product scraper** — adds `lib/scrape/` + `/admin/produkter/scrape`.
  Needs `FIRECRAWL_API_KEY`.
- **Design importer** — `designImport`. Pull a palette from any URL → live theme.
  `/admin/design-import`. Reuses Firecrawl.
- **Hoptify** — `hoptify` + `logoGenerator`. A Shopify-pendant storefront design,
  a parody "import from Shopify" onboarding (`/admin/hoptify`, real palette +
  product import when `FIRECRAWL_API_KEY` is set, else demo theatre), and a Gemini
  logo generator (`/admin/indstillinger`, needs `GOOGLE_GEMINI_API_KEY` +
  `BLOB_READ_WRITE_TOKEN`).
- **GDPR / DSAR** — data-subject export + soft-erasure, retention crons, processor
  register. `/admin/processors`. Crons `/api/cron/{cleanup-expired-tokens,audit-retention}`.
- **Backup** — automated DB backup script + cron `/api/cron/backup`. See
  `docs/backup-restore.md`.
- **Blog** — `blog`. `/blog` + RSS + BlogPosting JSON-LD + sitemap; edited at
  `/admin/blog`. New `Post` model.
- **Indexing controls** — per-shop `seoIndexing` (public/noindex) + `aiCrawlers`
  (allow/block) on BrandingSettings; wired into robots.txt + meta robots.
- **Tax / VAT + invoicing** — `stripeTax`. Managed multi-country VAT via Stripe
  Tax (EU OSS, VAT-ID), or built-in single-rate (`policies.vatRatePct`,
  `pricesIncludeVat`). Configured in `/admin/integrations`.
- **Shipping & fulfillment** — `shippingZones`. Zone/weight rates + delivery
  times + dropship-supplier routing. `/admin/shipping`. New Shipping/Rate/
  Supplier/FulfillmentOrder models.
- **WooCommerce parity** — `wishlist` + `abandonedCart` + admin redirects +
  product CSV import/export + translation-management UI + newsletter subscribers.
  `/account/wishlist`, `/admin/{redirects,translations}`. Cron
  `/api/cron/abandoned-cart`. New Wishlist/Redirect/Subscriber models.

### ⬆️ Upgrade notes

- **Run migrations** before flipping any flag. ~13 additive models/columns, no
  destructive changes. Existing Turso/libSQL shops: `npx tsx scripts/migrate-turso.ts`
  (applies *pending* migrations only — the v0.10.0 additions land on top). Fresh
  databases: `npx prisma db push` (syncs the schema directly).
  _Note: a full `prisma migrate deploy` from an empty DB currently fails on a
  pre-existing migration-ordering issue (`phase10_media_assets`); use `db push`
  for fresh DBs until that's repaired._
- **New env keys** (see `.env.example`): `FIRECRAWL_API_KEY`, `BLOB_READ_WRITE_TOKEN`.
  Reused: `GOOGLE_GEMINI_API_KEY` (logo gen), `CRON_SECRET` (new crons),
  `UPSTASH_REDIS_*` (redirects).
- **Canaries:** Teloz stays website-mode (all new flags off). Solbrillen is the
  max-features canary (all new flags **on**). Northbound enables a selective set.

## v0.3.0 — 2026-05-26

### ✨ New features

#### Voice Shop (Gemini Live)

Customers can now talk directly to your storefront via Google's Gemini Live
voice model. Floating mic-FAB on storefront, server-side tool dispatch with
the same audit-log + scope-guards as your text chat.

- Opt-in per shop via `brand.features.voiceShop = true`
- Activate in `/admin/integrations` → "Voice Shop" section
- Requires Google Gemini API key (also activated in `/admin/integrations`)
- Per-session minute cap + daily cap configurable in admin
- BotID-protected token-mint in production
- Default allowed tools: `products.search`, `products.get`, `cart.add`,
  `cart.get_summary`, `discounts.try_apply` (orders.create opt-in)

See [docs/voice-shop.md](./docs/voice-shop.md).

#### Local AI v2 (Ollama / Gemma 4)

Run your storefront and admin AI on a local Ollama instance — free, private,
no cloud round-trip. Bring-your-own-model.

- `/admin/integrations` → "AI provider" section: Cloud (Anthropic) / Local
  (Ollama) / Auto (with on-error fallback)
- Live Ollama discovery + Pull-this-model button (SSE-streaming progress)
- Per-model capability tiers: read-only / low-risk-writes / all-37-tools
- Apple Silicon `-mlx` variants auto-selected on Mac
- Delete-with-confirm + total-disk-usage display
- Status pill on `/admin/*` shows provider + model + live latency

See [docs/local-ai.md](./docs/local-ai.md).

#### Admin AI Status Pill

Fixed bottom-right badge on every `/admin/*` page showing which AI is
currently driving (Cloud / Local / Auto / Degraded / Offline) with live
latency from a 30s health-check endpoint.

#### Setup-wizard branching

The `/admin/setup` AI step now offers three paths instead of two:

- **Cloud AI** — Claude Haiku 4.5 (recommended for shops)
- **Lokal AI** — Ollama with live probe and auto model-detection
- **Spring over** — configure later in `/admin/integrations`

#### Audit-log stamps

Every AI-driven tool call (text chat, voice, vibe-generation) is now
stamped with `provider`, `model`, `modality`, `sessionMinutes` so
`/admin/audit` can filter by modality (text vs voice) or provider
(anthropic vs local vs google). Existing rows backfilled to
`provider="anthropic", modality="text"`.

### 🔧 Improved

- `chatModelResolved(intent)` exposes provider/model/capabilities to callers
  that need it (audit-stamping, tool filtering). Backwards-compatible —
  legacy `chatModel()` still works.
- `MODEL_CAPABILITIES` matrix covers Claude 4.5/4.6/4.7, Gemma 4 (e2b/e4b/
  e4b-mlx/26b/31b), Gemma 3, Llama 3.x, Qwen.
- Vibe generators (theme + product-SEO + category-SEO) now force Anthropic
  even when `aiProvider="local"` — structured JSON output needs reliability.

### 🐛 Fixed

- `lib/consent.ts` split into shared + server-only so Client Components
  can import the cookie parser without triggering Next.js's `server-only`
  guard. (Phase 10 introduced this; fixed in same release.)

### 📦 Schema

New columns on `IntegrationSettings`:

- `voiceShopEnabled`, `voiceShopModel`, `voiceShopVoice`,
  `voiceShopAllowedToolsJson`, `voiceShopMaxMinutesPerSession`,
  `voiceShopMaxMinutesPerDay`, `voiceShopVisionEnabled`,
  `voiceShopLastDailyUsageJson`
- `anthropicModel`, `localAiFallbackMode`, `lastDegradedAt`,
  `lastModelDetectedAt`, `aiUsageJson`

New columns on `AuditLog`:

- `provider`, `model`, `modality`, `sessionMinutes` (+ index on `provider`)

All nullable with defaults — your existing data is untouched. Run
`npx prisma migrate dev` after upgrade.

### 📦 Dependencies

- `@ai-sdk/openai-compatible@^2.0.48` — Ollama uses OpenAI-compatible API
- `@google/genai@^2.6.0` — Gemini Live WebSocket client
- `botid@^1.5.11` — voice-token abuse protection
- `zod-to-json-schema` — converts Zod schemas to Gemini function declarations

### 💥 Migration notes

- **Voice shop is OFF by default** — set `brand.features.voiceShop = true`
  in your fork's `brand.config.ts` to opt in
- **Audit-log backfill runs automatically** in the new migration —
  existing rows get `provider="anthropic", modality="text"`
- **No breaking API changes** — existing callers of `chatModel()` work
  unchanged. New `chatModelResolved()` is opt-in for routes that want
  provider/model awareness

---

## v0.2.0

Earlier releases — see git history.
