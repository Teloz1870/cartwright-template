---
name: section-vocabulary
description: |
  Cartwright's whitelisted page-section catalogue — the vocabulary the Magic Builder
  (and any AI agent) MUST use when planning or generating page layouts. Use this
  BEFORE generating a page: Cartwright constrains all AI-built pages to these section
  types + their prop schemas, and stores the result as governed DATA (never code).
  Knowing the vocabulary up front = valid, on-brand output instead of rejected guesses.

  Trigger when:
  - Planning a page layout (you may only choose section keys from this list)
  - Generating or editing a section's content (props must match its schema)
  - Targeting Cartwright sections from an external tool via /api/registry

  Do NOT trigger for: admin CRUD, cron jobs, API routes, DB schema work.
metadata:
  source-of-truth: lib/builder/section-registry.tsx
  registry-export: /api/registry (shadcn-compatible JSON-Schema per section)
  authoring: hand-authored — regenerate when section-registry changes
---

# Cartwright section vocabulary

## The doctrine: data, not code

Cartwright pages built by AI are **governed data**, never free-form code. A page is an
ordered list of `{ key, props }` nodes where:

- `key` MUST be one of the whitelisted section types below (the planner uses a real
  `z.enum` from `lib/magic/plan-schema.ts`, so an unknown key is structurally impossible).
- `props` MUST match that section's Zod schema — every section validates on generate,
  on publish (`pages.set_layout`), and on parse. Invalid props are dropped, never rendered.

You never emit a tag, a colour, or a font. You choose a section and fill its typed fields;
the section component + the active design palette handle all rendering. This is why output
is always on-brand and safe.

## The catalogue (27 sections)

Each section lives in `designs/studio/sections/*` (or inline in `lib/builder/section-registry.tsx`).
`?` = optional. Arrays note their item shape.

| key | purpose | key props |
|---|---|---|
| `hero` | Headline hero + CTA | eyebrow?, headline, headlineAccent?, tagline, ctaLabel, ctaHref, secondaryCtaLabel?, secondaryCtaHref?, microcopy? |
| `heroAurora` | Hero with a palette-reactive 3D scene behind it | eyebrow?, headline, headlineAccent?, tagline, ctaLabel, ctaHref, secondaryCtaLabel?, secondaryCtaHref?, microcopy?, scene? (3D scene, default aurora), intensity? (0–1, default 0.7) |
| `splitHero` | Text + image, two columns | eyebrow?, headline, body, ctaLabel?, ctaHref?, imageSrc?, imageAlt? (required if imageSrc), reverse? |
| `mediaHero` | Full-bleed background-image hero | eyebrow?, headline, tagline?, imageSrc, imageAlt, ctaLabel?, ctaHref? |
| `featureGrid` | Grid of feature cells | eyebrow?, title, description?, features[{title, body}] |
| `featureSplit` | Text + bullet checklist + image | eyebrow?, title, body, bullets[string], imageSrc?, imageAlt?, reverse? |
| `valueProps` | Value cards with icons | eyebrow?, title, description?, items[{title, body, icon?}] (icon = token enum) |
| `howItWorks` | Numbered steps | eyebrow?, title, description?, steps[{n, title, body, code?}] |
| `stackGrid` | Flat label/tag grid | eyebrow?, title, description?, stack[string] |
| `statBand` | Stat figures | eyebrow?, title?, stats[{value, label}] |
| `bento` | Asymmetric bento grid (first tile featured) | eyebrow?, title?, description?, tiles[{kicker?, title, body}] (3–7) |
| `marquee` | Scrolling ticker band | eyebrow?, items[string] (2–24), speed? (slow/normal/fast, default normal) |
| `configurator` ⭐ | Build-your-own product configurator with live price | eyebrow?, title, description?, productName, basePrice, currency? (default "$"), groups[{label, kind? (colour/option, default option), choices[{label, value, priceDelta? (default 0)}] (1–8)}] (1–5), ctaLabel? (default "Add to cart"), ctaHref? (default "#"), note? |
| `scrollStory` ⭐ | Scroll-driven cinematic story frames | eyebrow?, frames[{kicker?, headline, body}] (2–6) |
| `showroom3d` ⭐ | 3D product showroom with spec list | eyebrow?, productName, tagline?, scene? (3D scene, default orb), intensity? (0–1, default 0.75), specs? [{label, value}] (≤6), ctaLabel?, ctaHref? |
| `compare` ⭐ | Before/after image slider | eyebrow?, title?, description?, beforeLabel? (default Before), afterLabel? (default After), beforeSrc?, afterSrc? |
| `testimonials` | Quote cards | eyebrow?, title, description?, items[{quote, author, role?}] |
| `quote` | Large pull-quote | quote, author?, role? |
| `pricingTable` | Pricing plans | eyebrow?, title, description?, plans[{name, price, period?, features[string], ctaLabel, ctaHref, highlighted?}] |
| `faq` | Accordion (native `<details>`) | eyebrow?, title, description?, items[{question, answer}] |
| `logoCloud` | Logo / "as seen in" row | eyebrow?, title?, logos[{name, src?, href?}] |
| `galleryGrid` | Image grid | eyebrow?, title?, items[{src, alt, caption?}] |
| `bannerCta` | Accent mid-page CTA banner | title, description?, ctaLabel, ctaHref, secondaryCtaLabel?, secondaryCtaHref? |
| `newsletterBlock` | Email sign-up block (presentational) | eyebrow?, title, description?, placeholder?, ctaLabel |
| `ctaFooter` | Closing CTA | title, description?, ctaLabel, ctaHref, secondaryCtaLabel?, secondaryCtaHref? |
| `richText` | Title + paragraphs | title?, body (blank-line-separated paragraphs) |
| `vibe` | Free-form sanitized HTML escape hatch | html (admin-reviewed; allowlist-sanitized; second-class — prefer the typed sections) |

**⭐ = Cartwright Pro Part** (`configurator`, `scrollStory`, `showroom3d`, `compare`) — premium, breakthrough elements associated with the `cartwrightPlus` tier (honor-system, not hard-enforced). The planner may still select them like any other key; they carry a "Pro" badge in the builder + marketplace.

## Rules of thumb when planning a page

- Lead with a hero (`hero`/`heroAurora`/`splitHero`/`mediaHero`), close with `ctaFooter` or `bannerCta`.
- Use the typed sections, not `vibe`, unless a layout genuinely can't be expressed.
- Copy goes in the brand's voice; you do NOT set colours/spacing/fonts.
- `*Href` fields are relative paths (`/kontakt`, `/produkter`) unless told otherwise.
- Image sections require alt text.

## Optional motion effect (PART 4)

Any section node may carry an optional **`effect`** — a whitelisted scroll-driven
animation chosen from `lib/builder/effects.ts`:

`fade-up` · `fade` · `zoom-in` · `slide-left` · `slide-right` · `parallax` · `none`

- It is **governed** exactly like `key`: a `z.enum`, so you cannot emit an off-brand or
  janky animation. Omitting it (or `"none"`) means no animation → the node renders static.
- Each maps to a `.motion-*` class (`themes/motion.css`) that runs on the **compositor**
  (transform/opacity only), is **reduced-motion-safe**, and is **feature-detected**
  (`@supports animation-timeline: view()` — no polyfill; unsupported browsers stay static).
- Effects only animate when the shop has motion turned on (`brand.features.motionEffects`
  → `data-motion="subtle"|"bold"` on `<html>`); when off, every node renders identically.

**Use effects sparingly and tastefully** — most sections should be `fade-up` or `none`.
Reserve `parallax` for large media/hero sections (`mediaHero`, `splitHero`, `galleryGrid`).
Don't animate everything; it reads as cheap.

## Discover the exact schemas at runtime

`GET /api/registry` (when `componentRegistryPublic` is on) returns a shadcn-compatible
registry with the full prop **JSON-Schema** for every section above — the authoritative,
machine-readable contract. Fetch it before generating if you need exact field types.

## Maintenance

This file is **hand-authored** and mirrors `lib/builder/section-registry.tsx` (the single
source of truth). When a section is added/removed/changed there, update this table (and the
`/api/registry` export stays correct automatically because it derives from the registry).
