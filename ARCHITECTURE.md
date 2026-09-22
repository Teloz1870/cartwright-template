# Cartwright — architecture

The engine map for anyone evaluating or contributing: what the layers are, where the
contracts live, and how to verify a change. For the hands-on agent path see
[`docs/agents-quickstart.md`](docs/agents-quickstart.md); for the design playbook see
[`DESIGN.md`](DESIGN.md).

## Overview — one app, three modes

Cartwright is a single Next.js 16 + React 19 + TypeScript application that ships a complete
site — storefront, admin, database, auth, payments, SEO/JSON-LD and an AI tool surface —
and runs as one of three **modes**, selected by `brand.mode` in
[`brand.config.ts`](brand.config.ts):

| Mode | What it is | What's mounted |
|---|---|---|
| `website` | Corporate/marketing site, no cart | Landing, contact, info pages, optional AI assistant |
| `webshop` | Full e-commerce storefront | PLP, PDP, cart, checkout, account, magic-link auth, Stripe |
| `agent-marketplace` | Agent-first / A2A shop | Agent Card endpoint, negotiation, escrow verification, agentic admin |

`brand.config.ts` is the **single source of truth** for identity: mode, locales, feature
flags, policies, contact details and copy anchors. Code never branches on raw identity
fields directly — it reads them through the predicates in [`lib/mode.ts`](lib/mode.ts)
(`isWebsite()`, `isWebshop()`, `isEcommerce()`, …), and an invariant test
(`tests/unit/mode-invariants.test.ts`) keeps the underlying fields from drifting. Hybrid
setups (e.g. webshop + agentic-checkout endpoints) are additive `brand.features.*` flags,
not new modes.

## The layer map

Read top-down: configuration → what mounts → how it renders → what writes to it → where it
persists.

```
brand.config.ts ──────────────── identity: mode, locales, brand.features.* flags, copy anchors
        │
        ▼
lib/feature-flags/manifest.ts ── one descriptor per flag, compile-enforced (a missing or
        │                        misspelled entry is a type error); getFeatureView()
        │                        (lib/feature-flags/status.ts) feeds /admin/features and llms.txt
        ▼
app/[locale]/… + app/api/… ───── routes & layout; what mounts follows mode + flags;
        │                        per-locale routing from i18n/routing.ts
        ▼
designs/<slug>/ (DesignPacks) ── how it renders: registry in designs/options.ts; the active
        │                        pack resolves at request time (getActiveDesign() in
        │                        lib/theme.ts) and renders via app/[locale]/page.tsx.
        │                        Palette-adaptive: packs draw from cw-*/sol-* CSS tokens and
        │                        lib/theme.ts maps the shop's 6-color palette onto them.
        │                        Optional siteChrome replaces header/footer on every page.
        ▼
lib/builder/ (sections) ──────── the governed section catalogue: a fixed vocabulary of
        │                        section types with Zod prop-schemas (section-schema.ts).
        │                        AI page-building (magic.plan_page / magic.generate_page)
        │                        emits validated section DATA, never code; sections ship
        │                        JSON-LD (section-jsonld.ts).
        ▼
lib/genome/ (copy) ───────────── the Resolvable Genome: copy as data. Every field renders
        │                        override ?? resolved-cache ?? anchor, where the anchor is
        │                        the brand.config value — gated by the genomeResolve flag,
        │                        and rendering never calls an LLM.
        ▼
lib/tools/ + /api/v1/tools ───── the AI tool surface: every admin operation is a named,
   + /api/mcp │                  scoped, audited tool. invokeTool() in lib/tools/registry.ts
        │                        is the single enforcement chokepoint; REST and MCP share it.
        ▼
plugins/ (optional modules) ──── cartwright-plugin-v1: flag + self-contained files + route
        │                        mounts in a Zod-validated manifest; catalogue in
        │                        plugins/registry.ts
        ▼
prisma/schema.prisma ─────────── persistence: Prisma 7 on libSQL/Turso by default;
                                 Postgres and plain SQLite are also supported
```

Two orthogonal axes complete the picture (full model:
[`docs/design-system.md`](docs/design-system.md)):

- **Industry templates** (`industry-templates/<slug>/`) seed *data* — products, categories,
  pages.
- **Designs** (`designs/<slug>/`) control *rendering*. Any industry pairs with any design,
  filtered only by mode.

## Key directories

| Path | What lives there |
|---|---|
| [`brand.config.ts`](brand.config.ts) | Identity, mode, locales, feature flags, policies, copy anchors — the single source of truth |
| [`designs/`](designs/options.ts) | Design packs, currently 28 including the rewrite-me `blank` pack (registry: `designs/options.ts`; contracts: `designs/types.ts`) |
| [`plugins/`](plugins/registry.ts) | Optional in-repo engine modules, currently 9 (catalogue: `plugins/registry.ts`) |
| [`verticals/`](verticals/index.ts) | Voice presets — pre-written copy + palette + suggested design/scene, currently 5 (registry: `verticals/index.ts`) |
| [`industry-templates/`](industry-templates/index.ts) | Seed data per shop type (products, categories, pages) |
| [`themes/`](themes/) | Static CSS palettes per design that needs one, plus `motion.css` (scroll-driven effects) and `admin.css` (admin skin) |
| [`lib/builder/`](lib/builder/section-schema.ts) | The governed section catalogue: schemas, registry, section JSON-LD |
| [`lib/genome/`](lib/genome/resolve.ts) | The Resolvable Genome — copy resolution, identity anchors, per-field stores |
| [`lib/tools/`](lib/tools/registry.ts) | Tool handlers + the registry/enforcement chokepoint |
| [`lib/feature-flags/`](lib/feature-flags/manifest.ts) | The flag manifest (single source of truth per flag) + status view |
| [`lib/compositions/`](lib/compositions/spec.ts) | Composed-look artifacts: spec, apply, export |
| [`lib/plugins/`](lib/plugins/spec.ts) | The plugin contract + install state |
| [`app/admin/`](app/admin/) | The admin UI (products, orders, content, designs, features, genome, …) |
| [`app/api/v1/tools/`](app/api/v1/tools/route.ts) + [`app/api/mcp/`](app/api/mcp/route.ts) | The REST and MCP mounts of the tool surface |
| [`prisma/schema.prisma`](prisma/schema.prisma) | The database schema |

Counts above drift by design — the linked registry files are authoritative.

## The three contracts

Three sibling Zod-validated schemas, each a `schema` literal version string, define what is
portable in and out of a Cartwright shop:

**`cartwright-design-v1`** ([`lib/designs/spec.ts`](lib/designs/spec.ts)) — the portable
*design* spec: a `design.md` file with YAML frontmatter (palette, fonts, section
composition) plus free-form designer notes, importable via `/admin/designs`. Its in-code
counterpart is the **DesignPack** ([`designs/types.ts`](designs/types.ts)): a homepage
Server Component, design tokens, and optional `siteChrome`, content-page and webshop
overrides, registered in [`designs/options.ts`](designs/options.ts).

**`cartwright-plugin-v1`** ([`lib/plugins/spec.ts`](lib/plugins/spec.ts)) — the
installable-module contract: an optional engine module declared as a feature flag +
self-contained files + route mounts + optional admin nav + optional Prisma fragment, in a
manifest at `plugins/<slug>/manifest.ts`. v1 plugins are **in-repo** — "install" means
include-or-prune (scaffold-profile mechanics), not fetching code at runtime. The catalogue
is [`plugins/registry.ts`](plugins/registry.ts), and `tests/unit/plugins.test.ts` enforces
the invariants (valid schema, unique slugs, real flag, files exist, mounts wired).

**`cartwright-composition-v1`** ([`lib/compositions/spec.ts`](lib/compositions/spec.ts)) —
the composed-look artifact: ONE JSON file capturing a Skin (design slug), palette, Voice
(identity anchors + genome copy), chrome parts, 3D scene and an optional homepage section
tree. Pure governed data — every field maps onto an existing validated runtime blob, so
applying one never writes code. Applied atomically by `applyComposition`
([`lib/compositions/apply.ts`](lib/compositions/apply.ts)), exposed as the
`composition.apply` / `composition.export` tools.

## Conventions

- **Flags default-off.** Every non-trivial subsystem sits behind `brand.features.*`. A new
  flag ships `false` and must have a descriptor in
  [`lib/feature-flags/manifest.ts`](lib/feature-flags/manifest.ts) — the manifest is typed
  `Record<FeatureKey, …>`, so a missing or extra entry fails compilation. Flags are tiered
  `runtime` (live-toggleable), `compile-time` (needs redeploy) or `identity` (locked).
- **Structured data everywhere.** Every citable page (product, article, FAQ, breadcrumb)
  ships JSON-LD via [`components/JsonLd.tsx`](components/JsonLd.tsx), server-side only.
- **English-first storefront.** Storefront-facing copy — brand defaults, design packs, seed
  content — ships in English; per-shop languages come from `locales` + `defaultLocale` in
  `brand.config.ts`, routed per locale prefix via [`i18n/routing.ts`](i18n/routing.ts).
- **Additive schema changes.** Evolve `prisma/schema.prisma` by adding columns/tables, not
  repurposing old ones — new product attributes go in `Product.attributes` (JSON), never in
  legacy fields. For local/dev databases use `pnpm db:push` (schema-first), not
  `prisma migrate deploy`.
- **Token stability.** Don't rename existing `--color-sol-*` / `--color-cw-*` CSS tokens —
  shops reference them. Change *values* per theme/palette instead.
- **Modern web platform first.** Prefer native APIs (Popover, `<dialog>`, View Transitions,
  container queries, `:has()`) over JS libraries.
- **Writes are governed.** Anything that mutates a shop goes through the tool registry:
  scoped, `confirm: true`-gated for destructive operations, audited, and often revertible
  via `audit.revert`.
- **No credentials in tracked files.** `.env.local` and friends are gitignored; new config
  that needs keys ships as a committed `.example` stub.

## Verifying a change

```bash
pnpm lint                 # ESLint
pnpm exec tsc --noEmit    # types (alias: pnpm typecheck)
pnpm test                 # Vitest unit suite
pnpm build                # production build — catches route/type/build wiring errors
```

Then look at the running thing: `pnpm dev` and open `http://localhost:3000/<defaultLocale>`
(plus `/<defaultLocale>/produkter` in webshop mode). For design work, follow the
screenshot self-verification checklist in [`DESIGN.md`](DESIGN.md); for the agent-driven
curl checks, see [`docs/agents-quickstart.md`](docs/agents-quickstart.md) → "Verify your
work".
