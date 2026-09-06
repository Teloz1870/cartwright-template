# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

A scaffolded shop is a one-shot snapshot — nothing updates it automatically. The
**Security advisories** index below is therefore the canonical place to learn whether the
engine version your shop runs (see `.cartwright/release.json`) has a known security fix you
should pull. When a release fixes a security issue, its version block gets a `### 🔒
Security` section (issue + severity + the version you must upgrade to) **and** a row is
added to the index below.

## Unreleased

## v0.56.2 — 2026-09-06

**The plain-website door, inside the scaffold an AI actually reads.** A
`--profile site` scaffold shipped a README whose lede promised "database and
backend", whose first command block put the site profile third, and whose
deploy section asked for three Turso environment variables — and, worse, the
two files a coding agent loads before any of that (`.claude/CLAUDE.md` and
`AGENTS.md`) opened with `pnpm db:setup` and an admin login. An agent that
scaffolded the database-free profile was told, by the profile itself, that it
needed a database.

- **The door, at the top** (#570): the README lede is qualified ("a real site
  with design — and, when you want them, database and backend"), the site
  command comes first in the first command block, and a new
  "Just a website? (`--profile site`)" section says what ships and what does
  not. A pointer names the profile marker: *"Reading this README inside a
  scaffold? `.cartwright/profile.json` says which profile you have"* — and
  which sections do not apply to it.
- **The briefings agents load first**: one callout at the first-run step of
  `AGENTS.md`, `.claude/CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/cartwright.mdc` and `.windsurfrules` (the six files
  `AGENTS.md` requires to stay consistent), plus `DEPLOY.md`: no database,
  admin or login here — `pnpm dev` is the whole first run, `pnpm build` the
  whole production gate, and deploying needs no environment variables.
- **`docs/simple-site.md`** gains "What you edit" (the `brand.config.ts`
  fields, `designSlug`, the blank canvas, adding a route), "Measured"
  (the measured cold run, copied from the release scaffold gate's
  `timings-site.json` and never typed — the guide carries the figures and the
  run id, so a re-measurement updates one file)
  and "Honest limits".
- **`llms.txt`**: the "Built with Cartwright" block names the database-free
  profile, and the product sentence is qualified in both variants.
- `tests/unit/readme-site-door.test.ts` (engine-only) pins all of it: the
  command order, the section, the pointer, the env-var scope, the guide's
  sections and provenance shape, the badge in both variants, and the callout
  in every briefing.

### Upgrading

Nothing to do — documentation only, and no runtime file changed. A scaffold
cut from v0.56.0 or v0.56.1 can copy the new `README.md`, `docs/simple-site.md`
and agent-briefing callouts across, or simply ignore the database sections its
profile does not have.

## v0.56.1 — 2026-09-06

**A light or full scaffold's own test suite is green again.** The v0.56.0
release scaffold gate caught it before any customer did: `tests/unit/
site-font-safe.test.ts` (new in #564) enumerated files with `git ls-files`,
and a scaffold is not a git repository — three tests failed in every light and
full scaffold cut from v0.56.0 (site was unaffected: it prunes `tests/unit`).
The published CLI was still pinned to v0.55.0 while this was found, so no
scaffold in the wild ran the red suite.

- **site-font-safe pins the engine, not a scaffold** (#568): files are walked
  from disk (no git), and the suite runs only in the engine checkout — it pins
  the engine's manifest against the engine's design packs, which a light
  scaffold has already pruned — using the same probe as `repo-hygiene.test.ts`.
  Proven three ways: engine → 4 pass; a `git archive` copy with no `.git` →
  4 pass; the same copy without the mirror exclude list (scaffold-like) → 4
  skipped; and a real `create-cartwright@2.9.2 --profile light --ref v0.56.0`
  scaffold's suite red before / green after.

### Upgrading

Nothing to do. A light/full scaffold cut from v0.56.0 can copy the new
`tests/unit/site-font-safe.test.ts` over its own, or delete that file.

## v0.56.0 — 2026-09-06

**A `--profile site` scaffold is now what its own README says it is — a plain
website with no database.** It boots and builds with Google's CDN unreachable,
ships no crons into routes it does not have, installs no Postgres driver,
serves its share cards and favicon, and its contact form reaches its owner.
Five defects, each one an AI scaffolding a "just a page" site could not have
fixed itself; four of them were found by review falsifiers on a real
`create-cartwright@2.9.2 --profile site` scaffold.

- **No crons for a scaffold without cron routes, no Postgres driver without a
  database** (#563): `vercel.json` became a seam owned by the `db` module. A
  site scaffold receives `vercel.static.json` (`$schema` + `framework` only)
  instead of the ten cron entries whose routes the materializer deletes —
  every site deploy used to 404 on all of them, daily, forever. The orphan
  `pg` + `@types/pg` left the engine root; `@prisma/adapter-pg` carries both
  for the profiles that have a database. `repo-hygiene.test.ts` pins the twin
  as `vercel.json` minus `crons`.

- **Font-safe boot** (#564): the nine design packs whose display faces are
  fetched from Google Fonts at build time (aerospace, brutalist, drive,
  editorial-ink, fable, flux, meridian, nocturne, stillwater) and the root
  layout's Geist pair moved into a new `google-fonts` module, present from
  managed-site upward. A site scaffold gets `app/layout.static.tsx` — the
  system font stack behind the same `--font-geist-*` variables — and the eight
  self-contained packs (aurora-site, saas-dark, studio, corporate-baseline,
  stack, jungle, agentic-showcase, blank). Measured with Google blackholed:
  the engine's own `next build` dies on `Space Mono` through the
  `designs/index.ts` barrel; the materialized site builds (23 routes),
  `next start` serves `/en` 200, and the FIRST `next dev` compile answers 200
  — the `GET /en 500` that Turbopack cached until `rm -rf .next` is gone.
  `site-font-safe.test.ts` walks the site's included file set and forbids
  `next/font/google`; the engine, light and full output are byte-identical
  (`app/layout.tsx` untouched).

- **The contact form reaches the owner** (#565): `SmartContactForm` asked the
  admin-owned `/api/support/triage` before `/api/inquiries` — unconditionally.
  In a site scaffold that route does not exist, the POST hit the catch-all
  (405, empty body), `response.json()` threw, and every visitor saw "Could not
  connect to the server" while `/api/inquiries` itself worked. The import
  walker cannot see a `fetch` URL, which is how a profile documented as "no
  AI triage" shipped a form that could not submit. `profileCapabilities.
  supportTriage` (true; false in the static twin) now gates it and the site
  form goes straight to the human path. Database-backed profiles render
  byte-identical.

- **Share cards and favicon are not dead links** (#566): `proxy.static.ts`,
  the middleware a site scaffold runs, exempted only `/api` from the locale
  rewrite, so `/og?title=…` — the URL every page's `og:image` carries — and
  `/icon` were 307'd into `/en/og` → 404 in `next dev` and `next start`
  alike. The twin now routes them by the same `isAssetExempt` the db variant
  uses; a wiring test drives the static proxy directly and is mutation-proved.

### Upgrading

No schema change and no migration. A site scaffold cut from an earlier tag has
no in-place update path: re-scaffold, or apply the fixes by hand — delete the
`crons` block from `vercel.json`, drop `pg`/`@types/pg` from `package.json`,
update `SmartContactForm` to read `profileCapabilities.supportTriage` (or pass
`triageEnabled={false}`), add `|| isAssetExempt(pathname)` to the `/api` early
return in `proxy.ts`, and (for the font trap) replace the `next/font/google`
block in `app/layout.tsx` with a system stack. Light and
full scaffolds are unaffected.

## v0.55.0 — 2026-09-05

**A product specification may finally be a number, a boolean or a list — and every
surface agrees on what that means.** The engine's own coffee seed
(`roast: 2`, `notes: ["bergamot","jasmine","lemon"]`) could not be written
through the admin the engine ships, and was silently absent from the product
page on the way out. Three write paths disagreed about what a spec may hold, and
the one an AI agent uses was the narrowest of them.

- **The value rule, in one place** (#557): `string | number | boolean` or a list
  of those; nested objects and `__proto__`/`constructor`/`prototype` refused.
  `lib/product-attributes.ts:normalizeAttributeMap` is the single definition, and
  both the admin form (`lib/validation.ts`) and the agent surface
  (`lib/tools/products.ts`) call it. `products.update` inherits it through
  `createShape.partial()`.

  The agent surface previously declared `attributes: z.record(z.string(),
  z.string())` with no reserved-key guard — so `products.create` was the only
  write path that could not store the shop's own seed, and the only one that
  would take a reserved key. Two measured details shaped the fix: `z.record`
  rebuilds its object by assignment, so `"__proto__"` set the prototype instead
  of creating an own key and vanished before any guard saw it (the prototype is
  never polluted, but the caller was told the write succeeded); and `z.custom`,
  which does see the raw object, is unrepresentable in JSON Schema — through the
  soft-failing converter it publishes an EMPTY attributes contract to
  `/api/v1/tools?schema=true`, MCP `tools/list` and the admin-chat tool table.
  The schema is `z.preprocess` over a `z.record` with an explicit value union, so
  an agent is told exactly what it may send.

- **The product page renders them** (#560): the PDP spec table formats numbers
  and joins lists instead of filtering `typeof v === "string"`, and the PDP's
  WebMCP descriptor carries the same flattened specs the ACP/Google catalog feed
  publishes — the on-page agent no longer knows less about the product than
  Gemini shopping does. WebMCP tool names, schema keys and moat bindings are
  untouched.

- **`DesignPack.webshop.ownsAttributes`** (#560, additive): the attributes a
  design's own `pdpLayout` draws, which the shared spec table then skips — the
  `ownsBreadcrumb` idea applied to `Product.attributes`. It is a **function of
  the product**, not a key list, because a blanket list is only sound for a
  layout that draws unconditionally: `crema` shows a roast band only for values
  its parser accepts, so a declared-but-undrawn key would hide a fact that
  printed before. It also hands pack size to the variant picker once a product
  has variants. Unset → every attribute renders, byte-identical to before.

- **`pnpm verify:design` can see below the fold** (#555): `--full-page` captures
  the whole scroll length and `--selector <css>` captures one component. The
  `--selector` mode announces that it skipped the page-level checks — an
  unannounced skip is indistinguishable from a pass. `--full-page` emulates
  `prefers-reduced-motion: reduce`, because this engine's scroll-driven reveals
  live inside `(prefers-reduced-motion: no-preference)` and a full-page capture
  does not scroll.

### Upgrading

No schema change and no migration. A shop that stores attribute values the
repeater cannot represent (nested objects, lists whose items carry commas)
continues to edit them through the raw-JSON field, as before.

## v0.54.0 — 2026-09-03

**The judge's first minute. A cold `npx create-cartwright myshop --template coffee`
now scaffolds the same store the live demo runs — nine products, real variants —
and the README finally says so first.**

The WebMCP surface shipped in v0.50–v0.51, but the scaffold undersold it: the
coffee template seeded 3 products and zero `ProductVariant` rows, so the
variant-aware half of `add_current_product_to_cart` (the `variant` enum, the
natural-language labels, the per-variant stock lines) had nothing to show on a
fresh shop. And the README never named the one command that produces an
agent-testable store — the no-args default is a website profile with `webMcp`
off.

- **Seed variants** (#549): `SeedProduct` grows an optional `variants` field —
  one attribute key per PDP dropdown, agent-facing labels derived from
  attribute *values* ("Whole beans, 250 g") — and `prisma/seed.ts` creates the
  rows. The coffee template now seeds the live Northbound catalogue: 4 beans,
  1 espresso and a new **gear** category (4 products carrying plain string
  attributes, deliberately outside the coffee vocabulary), with Colombia
  Supremo wearing the demo's three grind/size variants and everything else
  variant-less on purpose — an agent must handle both shapes.
- **README: "Try the agent tools in 60 seconds"** (#549): the exact command, a
  prompt the seed data can satisfy, and the boundary that is the point —
  there is no order-placing tool; the checkout form is deliberately
  unannotated.
- **Agent reads answer with URLs the shop serves** (#544): `site.list_pages` /
  `site.get_page` now clamp the locale and canonicalise legacy CMS slugs
  through the same helper `llms.txt` and the sitemap use, so every published
  URL routes and `get_page` resolves the alias set the storefront resolves.
- **Flag-gated routes are 404 on every verb** (#548): `OPTIONS` no longer
  admits a gated surface exists when its flag is off.
- **The shared storefront follows the reader's locale** (#545): seven
  shared-chrome links that dropped the `/{locale}` prefix now carry it, with
  labels to match.
- **The header and its mobile drawer are one navigation again** (#546): the
  drawer renders the same page/category set as the desktop header instead of
  its own hardcoded list.
- **Smoke telemetry tells "unreachable" from "wrong"** (#547):
  `scripts/smoke-canaries.sh` separates a dead read from a failed content
  assertion on every live-read path.
- **Scaffold-context typecheck fix** (#550, caught by the release gate): on a
  single-locale scaffold `brand.locales.find(...)` narrows to plain
  `undefined`, so a test's `as string` cast could not compile — the fourth
  literal-type scaffold failure; the declaration now carries a load-bearing
  `string | undefined` annotation.

## v0.53.1 — 2026-08-29

**Scaffold-correctness patch. `brand.defaultLocale === "da"` compiles on the
engine and cannot compile in your shop.**

`release-scaffold-gate` vs `v0.53.0`: site ✅ · full ❌ · light ❌ — `TS2367`,
a comparison between types with no overlap.

`defaultLocale` is a literal type, not `string`. The engine's is `"da"`, and
`npx create-cartwright` patches yours to `"en"`, where `=== "da"` is provably
false and TypeScript refuses it. Three sites added in v0.53.0 — the two HTML
pages served outside `app/[locale]`, and the test asserting their shape — now
widen the comparison explicitly, each with a note saying the cast is
load-bearing rather than noise.

Nothing about the behaviour changes: the pages still serve Danish only when
your `defaultLocale` says so.


## v0.53.0 — 2026-08-29

**The language sweep, and five feature toggles that did nothing.** An audit of
every string literal in the shipped tree, plus a trace of every runtime-tier
flag. Most of what was found was legitimate; what was not is below.

### Danish strings an English shop's customers and owners actually saw

The engine grew out of a Danish shop, and prose written for it reached shops
that do not read Danish. Each of these had a traced render path:

- **The contact form.** `/api/inquiries` answered in Danish prose, and the
  form's own `t("errorGeneric")` could never run — a truthy server string never
  falls through `||`. Mistyping an email showed `Ugyldig email-adresse`. The
  endpoint now answers with a machine code the form translates.
- **The AI assistant** (`aiStylist`, default-on) rendered three Danish strings
  to every visitor who added to cart through it.
- **Two complete HTML pages** — the newsletter unsubscribe page and the
  supplier's mark-as-shipped page — were served with `lang="da"` hardcoded.
  They follow `brand.defaultLocale` now, with Danish as the special case.
- **Password reset**, a public route, passed the server's Danish through a page
  that already translated its other messages.
- **Values written into your database**: a redaction marker (`[slettet]`), a
  lead's `budget` default (`Ukendt`), and a review byline (`Anonym`). No later
  locale switch can reach those once written.
- **The admin**: the setup runbook, upload errors, the GDPR processor registry,
  and the boot error printed when `DATABASE_URL` is wrong.
- **Section defaults**: adding a Hero in the Visual Builder wrote
  `"Din overskrift her"` into your page. 67 strings across the studio sections
  and the section registry are English now.

### Five runtime-tier flags were read from the compile-time config

`/admin/features` writes a database override; these surfaces ignored it:

- **The weekly SEO cron** answered `200 {"ok":true}` and collected nothing on
  every shop that had activated Plus — `/admin/plus` activates by writing an
  override and never edits `brand.config.ts`, so the compile-time value stayed
  `false` permanently. If you run Plus, your GEO history restarts from here.
- **`/blog/feed.xml`** 404'd on a blog whose pages rendered and whose posts were
  listed in `sitemap.xml`.
- **The wishlist**: the product page showed the heart, `/account/wishlist` 404'd.
- **`/api/registry`** 404'd, so install counts never recorded.
- **Cart recovery** answered 200 and sent nothing.

### Changed behaviour worth knowing about

- **`messages/{da,en}.json` gained a `Chrome` namespace.** If you maintain your
  own message files, add it — a missing key renders the key itself as an
  aria-label. Keys: `navExplore`, `navInformation`, `navFooter`, `navPrimary`,
  `emailPlaceholder`, `ctaFallback`, `newsletterHeading`, `newsletterBlurb`,
  `emailLabel`, `newsletterSubmit`. The `Login` namespace gained ten
  `magic*` keys and `Account` gained two `resetActions_*` keys.
- **`/api/inquiries`, `/api/contact/upload`, `/api/live/token` and the review
  endpoint answer with a `code` field.** `error` is still there and is now
  always English, for scripts and logs. If you render `error` directly, map
  `code` instead.
- **A refused anonymous MCP batch is now a JSON-RPC error** (`-32600`) rather
  than a problem document. The refusal itself is unchanged.
- **The GDPR redaction marker is `[redacted]`.** Rows erased before this
  release keep `[slettet]`.
- **A lead's `budget` defaults to `""`** rather than `Ukendt`, so the admin
  badge is omitted when the form did not ask.
- **`contactAttachments` is resolved lazily** in `/api/inquiries` — only when a
  request actually carries attachments.

### Guards

Seven new or widened test guards, each proven by breaking what it protects:
storefront endpoints must answer in codes; admin-facing modules must be
English; section defaults and design packs are scanned for Danish; shared
components must resolve every key they name in every locale file; and a
runtime-tier flag must never be *gated* on the static config — a static read
stays legal as a default parameter or `??` fallback, which is how several
flags are correctly wired.


## v0.52.2 — 2026-08-29

**Second scaffold-correctness patch. Three assertions failed a customer for
choosing the `light` profile — for doing exactly what the profile promises.**

`release-scaffold-gate` vs `v0.52.1`: site ✅ · full ✅ · light ❌.

A pruned profile removes design packs and dev-only scripts. Three tests asserted
the ENGINE's full file set and therefore went red in a scaffold that had pruned
correctly:

- `site-pruned-scripts` required every listed script to exist —
  `light` prunes `scripts/publish-agent-card.ts`, which is the list's own job.
- `design-copy-language` read `designs/hoptify/homepage.tsx` — pruned.
- `marketplace-manifest` compared the rebuilt catalogue to the committed one —
  a pruned scaffold legitimately has fewer designs and chromes.

All three are engine-only assertions, and they say so now, gated on
`.cartwright/profile.json` — a file that exists in every scaffold and never in
this repo. They keep their teeth where drift can actually be introduced: the
engine, where CI runs.

The manifest one was **not** new to v0.52.x; it was latent in the shipped
artefact and only surfaced when the gate was pointed at a fresh tag.

Verified: `light` scaffold from the tag — tsc 0, 3379 passed + 23 skipped.
Engine — tsc 0, 3776 tests, lint 0.

## v0.52.1 — 2026-08-29

**Scaffold-correctness patch — found by the release gate against v0.52.0, the
same way v0.51.1 was found.**

- `tests/unit/agentic-endpoint-4xx.test.ts` destructured `routing.locales` by
  index. On the single-locale `["en"]` shop a scaffold produces, that tuple's
  TYPE is `readonly ["en"]`, so index 1 is `TS2493` — a compile error, and the
  light and full profiles would not typecheck
  (`release-scaffold-gate` vs `v0.52.0`: light ❌ · full ❌ · site ✅).
  Indexed access + `find` instead.
- Why the fork simulation missed it: it ran `vitest` against the scaffold shapes
  and never `tsc`. A type-level fork-hostility is invisible to a passing test
  suite. Both are now run against all three shapes before a release.


## v0.52.0 — 2026-08-29

**The money-and-language release. A shop can now say its own words, and charge
its own currency, in the language of the page it is on — and the tests can be
run by a shop that is not Danish.**

The trigger was one screenshot: `DKK 149.00` on `demo.cartwright.app/en`. What
that turned out to be resting on took four review rounds and forty-odd measured
defects to reach the bottom of.

### Language — the page a reader actually sees

- **`<Price>` had a `locale` prop and not one of its four call sites passed it**,
  so every storefront price rendered in the CURRENCY's language: 23 occurrences
  of `kr.` measured on the live English PLP. It reads the page's locale itself
  now, so a fifth caller cannot reintroduce the bug by forgetting a prop.
- The `<meta name="description">` on a secondary locale was the source
  language — the one piece of copy on the page written FOR crawlers and agents.
  The root layout sits above `[locale]` and cannot know; the locale layout and
  the homepage's own builder now localise it.
- `llms.txt` and the public `site.*` tools took a locale, used it for their URLs,
  and then published the base column's words. Extracted `translatedField`, which
  also fixed two latent faults: a `translations` column that arrived from raw SQL
  as TEXT never applied at all, and an own-property read now stops a key like
  `constructor` standing in for real copy.
- A shop's OWN words became translatable (`brand.copyTranslations`) — engine i18n
  cannot reach a tagline that lives in `brand.config`. An explicit per-locale
  translation outranks the locale-blind Resolvable Genome, by specificity.
- **A language-parity gate** (`scripts/smoke-canaries.sh`): a Danish string on an
  `/en` route now fails the canary run, with a 28-case self-test so the heuristic
  itself is measured rather than trusted.

### Money — what the customer is charged

- **The pay button showed one amount and Stripe charged another** whenever
  `multiCurrency` was on. Two independent derivations of one number; there is one
  now, computed once and handed to both.
- **A partial refund in a non-base currency refunded the wrong magnitude** —
  Stripe reads the amount in the PaymentIntent's currency, so 149 sent against a
  €19.97 charge requested €149. Converted with the order's own snapshotted rate.
- The agent surface quoted the base currency by documented design — correct while
  the flag was off, and self-contradictory the moment it was on: the page showed
  the presentment amount, Stripe charged it, and only the agent said otherwise.
- Multi-currency is **config-sovereign**: the charge currency cannot be flipped by
  a DB row.
- Shipping copy is interpolated from the configured rate, so the prose and the
  charge cannot drift. (The coffee demo promised 39 kr while its JSON-LD published
  `6.00` — a leftover from a spell as a USD store.)

### Search — three doors, one rule

The storefront, the agent API and the semantic ranker each searched differently.
Measured against the live catalogue before the fix: `press` returned three
products on the storefront and **zero** through the agent API; `кофе` returned
the ENTIRE catalogue as matches. They share one matcher now — substring, the same
rule Prisma's `contains` applies — with the asymmetries that remain (folding,
case, JSON attributes) written down rather than claimed away.

### Fork-safety — the engine is not a Danish shop

`tests/unit/` ships to every scaffold, and a dozen of its assertions named `da`,
`DKK` or `"en"-as-secondary` as if the engine's own configuration were universal.
**Measured: a default single-locale `["en"]` scaffold failed 5 assertions; a
USD scaffold failed 25.** Both are zero now. Guards that must name an
engine-internal path live in `tests/engine/`, which is mirror-excluded.

### Also

- `calculate_brew_ratio` resolves its recipe to a real, buyable product —
  read-only, and it prefers something the shop sells by weight so an embedded
  catalogue cannot answer "buy 1 × Paper Filters" to a coffee question.
- A negative smoke assertion that cannot read the page is now **inconclusive, not
  clean**: `does_not_contain` piped `curl` into grep, so a dead origin printed a
  green tick while asserting nothing.
- `?q=` with 250+ words threw `P2029` before reaching the database — an
  input-length cliff on a public GET, now deduped and capped.

**Migration:** none required. `multiCurrency` and `currencySwitcher` remain
default-off; `Order.currency`/`fxRate` have existed since v0.15.0.

## v0.51.1 — 2026-08-27

**Scaffold-correctness patch — found by running the release gate against the
tagged release itself.**

- `tests/unit/feature-flags.test.ts` hardcoded `brand.features.webMcp === false`.
  Since create-cartwright 2.8.0, webshop templates scaffold with the flag ON, so
  the assertion failed in exactly the scaffolds that are configured correctly
  (`release-scaffold-gate` vs `v0.51.0`: light ✅ · site ✅ · full ❌). The test now
  asserts the invariant that holds in every deployment — WebMCP only where
  `ecommerceEnabled` is true, the flag's declared precondition — mirroring the
  `firstRunWelcome` precedent in the same file. Gate re-run: **light/site/full 3/3**.
- Release coherence restored: `package.json` (which still read 0.50.0 at the
  v0.51.0 tag) and the marketplace manifest now track the CHANGELOG heading.

## v0.51.0 — 2026-08-27

**The agent-experience sweep: spec-current WebMCP, honest discovery, an
intent-first showcase — and webshop scaffolds go WebMCP-native.**

- **WebMCP tool correctness** (audited against the late-August draft, Chrome's
  best-practices doc and the reference commerce implementation):
  `search_products` returns reduced, bounded rows — checkout endpoints and
  internal fields never enter the browser surface (test-pinned);
  `add_current_product_to_cart` takes a natural-language `variant` (enum of
  option names) instead of an internal id, and omits the property entirely for
  variant-less products; `update_cart_item_quantity` is single-function (1–99;
  removal belongs to `remove_cart_item`) and both cart tools enumerate the
  live line ids in their schemas; ambiguous mid-request failures say so and
  route the agent through `get_cart` before any retry; descriptions lose their
  negative phrasing without losing the moat semantics.
- **Declarative forms, both audiences**: `toolparamdescription` types onto
  `<textarea>`/`<select>` and the contact form's five controls carry English
  parameter descriptions; newsletter agent outcomes are stable English while
  the human keeps the localized message; `:tool-form-active` /
  `:tool-submit-active` styling makes agent activity on a form visible
  (engine-neutral outline + a copper glow in crema). The crema letter form —
  previously a urlencoded POST at a JSON-only endpoint — is a real client
  form with inline outcomes.
- **`/webmcp-check` is an intent-first explorer**: "I want to…" chips map
  outcomes to tools with copyable example inputs; the page loads the Chrome
  team's WebMCP polyfill (Apache-2.0, vendored) as a page-scoped fallback so
  it demonstrates in any browser, and the live panel discloses polyfill vs
  native. Copy names the architecture: per-route registration is progressive
  disclosure.
- **Discovery conformance** (fresh-scanner + streamable-HTTP client trace):
  `/.well-known/ai-catalog.json` emits the ARD manifest shape (specVersion +
  host + urn:air entries with per-entry trust manifests) while keeping the
  legacy `resources` view; the A2A agent card carries top-level
  name/description/version (and deliberately NO `url` — a conforming client
  would treat it as a JSON-RPC endpoint); `/api/mcp` answers explicit-SSE GETs
  with the spec's 405 and unknown `tools/call` with a JSON-RPC `-32602`
  protocol error; `pricing.md` gains a real per-product price table that tells
  the buyable truth for variant products; `llms.txt` links the live
  `/webmcp-check` inventory when the flag is on.
- **Eval-run fixes** (GoogleChromeLabs webmcp-evals, 12/12 smoke steps green
  against the live demo — and three genuine findings): the cart page's
  locale-less links 307'd through the i18n middleware and next/link prefetch
  retried the redirect in a loop (~5 req/s from one idle empty-cart visitor) —
  all four links now carry the route locale; agent-facing URLs are canonical;
  `filter_products` speaks English parameters (`category`/`minPrice`/
  `maxPrice`/`sort: newest|price-asc|price-desc`) mapped to the route's query
  params, Danish input accepted leniently.
- **Lifecycle proofs**: the e2e fake `modelContext` now REJECTS duplicate
  names and pre-aborted signals (current-spec semantics), and a new
  soft-navigation spec clicks an App Router link inside one document so the
  AbortSignal teardown is genuinely proven.
- **WebMCP-native scaffolds** (create-cartwright 2.8.0): webshop templates
  (`--template coffee | sunglasses | generic`) scaffold with
  `brand.features.webMcp: true` — the store registers its tools the moment an
  agent-capable browser opens it; website-mode scaffolds keep the surface
  dormant behind the flag.

## v0.50.1 — 2026-08-27

**Scaffold-profile correctness patch** — the four unit tests that assumed the
full two-locale engine tree now derive their expectations from the scaffold's
actual shape (`hreflang` alternates from `brand.locales`, the Crema keying pin
applies only to registered packs, white-label checks skip pruned files), so
`create-cartwright` scaffolds run the whole suite green out of the box. Also
threads the route locale explicitly through dynamic translations — ambient
`getLocale()` loses it in production rendering (#492).

## v0.50.0 — 2026-08-27

**WebMCP-native storefronts: the whole in-browser agent surface behind one flag — plus Crema site-wide, and a catalogue page the design finally owns.**

- **WebMCP foundation hardened** (experimental, `webMcp` flag, default-off): tool
  registration is now awaited per the draft spec and degrades per-tool; detection
  is shared through the new zero-import `lib/model-context.ts` (used by the
  registrar and the `/webmcp-check` diagnostics page, which now updates its tool
  list live via `toolchange`). Tool results carry verification data: `get_cart`
  and `add_to_cart` return the full agent-facing cart summary — line handles
  (`cartItemId`/`productId`/`slug`), stock ceilings, and money as
  `{amountMinor, currency, formatted}` instead of a currency-hardcoded
  `subtotalDkk`. Cart mutation actions return discriminated results
  (`{ok:false, code:"not_found"}` instead of a silent no-op on foreign ids);
  infrastructure errors still throw, so UI behavior with the flag off is
  unchanged.
- **WebMCP tools are now contextual** (experimental, `webMcp` flag, default-off): the
  PDP registers `add_current_product_to_cart` for the product on the page (variants
  enumerated with ids, prices and stock in the description — and REQUIRED when the
  product has variants, so an agent cannot create the base-price line the human UI
  cannot create), and the cart page registers
  `update_cart_item_quantity` (0 removes), `remove_cart_item` and `go_to_checkout` —
  which only OPENS checkout for the human; no order-placing tool exists in the browser.
  The global registrar slims to search/get_cart/navigate. Per-page mounts gate
  server-side (null when off — byte-identical), carry their own AbortController so
  PDP→PDP navigation swaps tools cleanly, and re-register on RSC refresh so line ids
  stay fresh. The moat test now spans all three tool surfaces and requires globally
  unique names.
- **WebMCP declarative forms** (experimental, `webMcp` flag, default-off): the site
  search, contact and newsletter forms carry `toolname`/`tooldescription` when the flag
  is on — WebMCP-enabled browsers surface them as agent tools, every other browser
  ignores the attributes, and flag-off HTML is byte-identical. Agent-invoked submits
  are answered through `event.respondWith` with the actual outcome (navigation target,
  triage answer/escalation, subscription result). Autosubmit only on search (read-only);
  contact and newsletter ask the human to confirm; the checkout form is deliberately
  unannotated (financial). Typed in `types/webmcp-dom.d.ts`.
- **Cart lines now display the price checkout charges.** Every cart-line display read
  `product.priceDkk` even for variant lines, while checkout bills
  `variant?.priceDkk ?? product.priceDkk` — so a variant priced above its product showed
  one total and charged another. Fixed on the cart page (both render branches), the
  checkout review (both branches), the assistant's pre-purchase PlanCard total, the MCP
  `cart.get_summary`/`discounts.try_apply` tools, and the abandoned-cart email (whose
  query now loads the variant it prices by). The cart page's quantity ceiling is
  variant-aware too. A parity test scans the display surfaces so a bare
  `product.priceDkk` cart-line read cannot come back.
- **Dependency currency, within-major** — notably **Next.js 16.3.0 → 16.3.3, which includes
  the August 2026 security release** (unauthenticated RCE via AVIF image optimization in
  sharp/libheif, plus a Windows-only mixed-router issue). This engine's default config does
  not enable AVIF optimization, so no shipped shop was exploitable through it — the bump
  closes the class. Also Prisma 7.10.0 (CLI + client + adapters), AI SDK 7.0.79 +
  providers, Stripe 22.5.0, Sentry 10.71.0, next-intl 4.13.7 and friends. One source
  change: the AI chat model handle is typed as the common `LanguageModel` contract instead
  of a provider-derived type.
- **The catalogue page teaches the agent its own filters** (experimental, `webMcp`
  flag, default-off): the PLP registers `list_visible_products` — zero-network,
  returning exactly the server-narrowed list the human sees plus the active filter
  state — and `filter_products`, whose schema is SERVER-DERIVED (live category slugs
  as an enum, the sort whitelist, price bounds) and validated before navigating.
  After the RSC re-render the read tool re-registers with the new visible set. The
  moat gains the PLP surface; `filter_products` joins the navigation-only class.
- **Design packs can ship their own WebMCP tools**: new optional
  `DesignPack.webMcpToolBindings`, aggregated by the moat test across every
  registered pack via the design registry — global name uniqueness and the
  cart/catalogue families now hold across packs, and a pack pruned by a CLI profile
  drops out of the aggregation automatically. First pack tool: crema's
  `calculate_brew_ratio` — the homepage brew calculator's math (extracted to
  `brew-math.ts`) typed for agents, same module as the human's widget, under the
  new review-gated `PURE_COMPUTE` class.
- **/webmcp-check is now the agent-tools showcase**: the full tool inventory grouped
  by registering surface, built from the SAME binding constants the moat test
  verifies (a render test pins the loop closed), the safety-moat explanation in
  plain language, and setup steps for ChatGPT's built-in browser / the Chrome flag /
  the WebMCP Inspector — plus the live registration panel. `built-with-cartwright`'s
  WebMCP blurb now describes the real architecture, and proof links render only when
  the feature is ON for the shop (a proof that 404s is the opposite of proof).
- **WebMCP e2e harness**: a Playwright spec installs a faithful fake
  `document.modelContext` before any page script and walks home → catalogue → PDP →
  cart → checkout — contextual tool sets appear and disappear per route, one real
  add-to-cart round-trip mutates the dev DB, and checkout is asserted tool-free.
  Public architecture doc: `docs/webmcp.md`.
- **Crema covers the whole site**: `applyPaletteAsTheme` + a site-wide `CremaShell`
  (`.crema-site` scope with sol pins, dark color-scheme and compensation for
  hardcoded light utilities) close the dark/light seam — cart, checkout, account,
  info pages and the PLP now follow the roast. The PLP gets an editorial crema frame
  ("The shelf") via a refined `webshop.plpLayout` contract that hands the whole page
  frame to the design. Every stylesheet is now parse-checked in CI (a prose comment
  once terminated itself and took down every page at PostCSS time).
- **Shared chrome stops speaking for the brand**: the footer newsletter strip renders
  the brand's own copy on every chrome (the dark-chrome branch hardcoded Danish SaaS
  marketing), catalogue filters are value-driven (no empty eyewear dropdowns on
  non-eyewear shops) and fully localized, the mobile drawer is no longer the desktop
  nav's monolingual twin, and the AI assistant's inline product cards follow the
  visitor's locale with locale-prefixed links.
- **Engine self-promotion off the merchant's presentation path**: new
  `brand.website.showAuditFeed` (default on) coherently gates the engine-changelog
  surfaces (footer link, announcement-bar link, the `/changelog` route, the sitemap
  entry); `/cartwright` (the engine marketing page) is website-mode-only; the
  capability manifest speaks English on `llms.txt`, `/built-with-cartwright` and
  `/admin/features`; the content-negotiated 404 page styles itself.
- **Coffee template feeds the pack it ships with**: seed products now carry
  `Product.attributes` (origin/process/roast/notes/weight), threaded through both
  seed paths — crema's roast dots, origin badges and per-kg pricing light up from
  first seed.

- **New design pack `crema`** — a cinematic, dark-chrome premium DesignPack, i18n from birth,
  with its own webshop overrides: an attribute-driven product card (roast dots, origin badge,
  process subtitle, tasting-note chips, an honest ≈ kr/kg only when the weight parses), its own
  PDP frame with a scoped token bridge, and a brew calculator. Its homepage bar reads product
  imagery through the media shim, plays a product's `videoUrl` as a card loop (hidden under
  `prefers-reduced-motion`), and can show a live agent-readiness score fetched server-side at
  render — never a stored number. It is module-claimed for the webshop profile and keyed by an
  invariant so no pack can be mis-keyed again.
- **Attribute-driven merchandising, generalised.** `DesignProduct.attributes` reaches the design
  layer, and `lib/product-attributes.ts` merges `translations.<locale>.attributes` over the base
  so a spec table speaks the reader's language. Never guesses: an attribute that does not parse
  is not rendered.
- **A storefront that stays in its locale.** A config default can no longer pick the language for
  a locale-routed storefront; the story-first pack's links carry locales and follow the canonical
  routes; and the shared footer — chrome on every page of every scaffold that does not replace it
  — now prefixes every locale-routed link it emits and reads its remaining labels, including the
  ones only screen readers hear, from the message catalogue. A source-scanning invariant, with its
  exemption predicate derived from `lib/locale-exempt.ts`, keeps it that way.
- **Dark chrome paints its own text.** The first dark-chrome webshop exposed that the shared
  header's webshop leg had no dark variant: category links and cart/account icons rendered
  `sol-ink` on a black bar. Locked-dark packs do not bridge the palette, so dark chrome now paints
  explicitly — `MobileMenu` takes an optional `darkChrome`, default false. Light shops render
  **visually unchanged**, not byte-identically: the webshop nav's labels are now wrapped in a
  `<span>` that carries the dark classes only when the chrome is dark, so a light shop emits a
  wrapper span it did not before. Anything selecting those labels by DOM position should be checked.
- **The `site`-profile footer stopped rendering an empty copyright line.** `brand.footer.disclaimer`
  now defaults to `""` and the db footer falls back to a localized `<storeName> · All rights
  reserved`; its `site`-profile twin did not, and rendered the blank raw. Both twins are now held
  together by an invariant.
- **The default webshop homepage reads its section copy from the catalogue.** `aurora-shop` (the
  webshop-mode default) and `webshop-classic` moved "Most popular" / "View all" to the `Storefront`
  namespace — so a non-English shop's default homepage changes text where it previously showed
  English. `TrustBadges` gained a localized fallback too, but only for shops that empty
  `brand.uiLabels.trustBadgesPrimary`; the shipped default is non-empty, so a default shop is
  unaffected by that half.
- **Sunglasses-era card leftovers retired** from the shared storefront card — every shop wore them.
  No markup or class names were removed: the hardcoded `Summer Edition` featured badge and English
  `Sold out` now come from the `ProductCard` message namespace, and the Dannebrog origin pill
  renders only when `brand.uiLabels.productCardOriginBadge` is non-empty. **Upgrade note:** a shop
  that leaves that label empty stops rendering the pill (it used to render a flag with no text);
  set your own text to keep it, and note the English badge text itself changed from
  `Summer Edition` to `Featured`. `AnnouncementBar`'s hardcoded English link is localized too.

> **Upgrade note — message catalogues.** This release adds **108 keys** to `messages/en.json` and
> `messages/da.json`. Most are pack-scoped (`Crema.*`, `NorthernCoffee.*`), but a set is read by
> **shared, non-pack** components and required for a clean render: the whole new `Catalog.*`
> namespace (PLP filters, sort options, product count), `Footer.newsletterKicker`,
> `Footer.allRightsReserved` · `Footer.homeAria` · `Footer.shop` · `ProductCard.featured` ·
> `ProductCard.soldOut` · `Storefront.mostPopular` · `Storefront.viewAll` · `TrustBadges.primary` ·
> `AnnouncementBar.aiLink`. A fork that maintains its own catalogues instead of taking ours will
> render raw keys for those until it adds them. No schema change ships in this release — no
> `pnpm db:push` is needed.


## v0.49.0 — 2026-08-24

**Honest-ergonomics round 2: an accept-lenient MCP handshake and more places to find the agent view.**

- The MCP POST handshake widens JSON-implying Accept shapes (json-alone, wildcard, absent) to
  the canonical pair instead of answering the SDK's 406 — leniency, not indifference: a client
  asking for text/html still gets the 406.
- `/auth.md` opens with a leading heading (canonical + freshness in a footer line);
  `?mode=agent` on the homepage serves the agent view; `/{locale}/llms.txt` is the
  section-level index (real 404 on unknown locales); llms.txt links are all resolvable
  locale-canonical URLs.
- The ai-catalog carries a trustManifest (real trust routes) at top level and per entry, and
  OpenAPI's bearerAuth declares named per-scope grants with descriptions in a spec-legal
  extension.

## v0.48.0 — 2026-08-24

**Tiered MCP origin policy, the well-known agent card, and the card-publish flow.**

- The MCP origin guard gains a deployment-aware tier: local/intranet keeps the strict
  allowlist (the DNS-rebinding posture), while a genuinely public https deployment accepts
  well-formed foreign https origins — the cookie-less anonymous surface has no CSRF to
  protect, no CORS headers are sent, and TLS makes the rebinding case unreachable. Opaque
  origins still require their explicit `opaque:` entry everywhere.
- `/.well-known/agent-card.json` serves the A2A agent card at the ecosystem's canonical
  discovery path (same gate and honest 503-until-published as `/api/agent-card`).
- `scripts/publish-agent-card.ts` is the publish flow the card libraries never had:
  brand + live-catalogue payload, ephemeral ed25519 signing (no stored private key),
  transactional rotation. Site profile prunes it (db-coupled), mirrored in the CLI.

## v0.47.0 — 2026-08-24

**The honest-ergonomics round: markdown everywhere it helps, problem+json edge to edge.**

- Unknown `/api/*` paths (and `/api` itself) answer RFC 9457 problem+json with a `service-desc`
  Link instead of the HTML 404 page.
- `/auth.md` documents the real auth model (Bearer keys, named scopes, the anonymous five-tool
  surface, rate limits) — and says explicitly that no OAuth flow is offered. `/pricing.md`
  (webshop-only) publishes currency, VAT treatment and the live price range.
- `/index.md` is a URL-suffix fallback for the markdown homepage; Accept-negotiated homepage
  markdown opens with YAML frontmatter while bare `/llms.txt` stays byte-identical. Homepage
  responses carry markdown-alternate/sitemap/describedby Link headers.
- `/.well-known/ai-catalog.json` indexes the agent surface (profile-aware); the RFC 9727
  api-catalog gains `item` entries; OpenAPI states a `default` problem response; MCP tool
  failures carry structured `{code, status, message}`.
- `products.search` gains `offset` pagination; `categories.list` gains a real input schema
  (`includeEmpty`). New agent-surface routes are module-claimed so the `site` profile stays
  import-closed.

## v0.46.0 — 2026-08-24

**The agent-ready public surface: anonymous typed reads, OpenAPI 3.1, trust routes and honest discovery.**

### 🤖 Agent-readiness

- Anonymous, rate-limited access is restricted to five public read-only tools: product search/get,
  category list, and published-page list/get. Private reads and every write still require a scoped
  Bearer key; drafts, customers, orders and administration stay outside the anonymous boundary.
- MCP now publishes concrete input/output schemas and public resources, while generated OpenAPI
  3.1 exposes one typed operation per tool. The legacy `{ "args": { ... } }` MCP input shape remains
  accepted for one compatibility release.
- Agent-facing errors use Problem Details, public and pre-auth requests have separate rate limits,
  client IPs are trusted only through configured ingress, and anonymous MCP batches are rejected.
- Runtime, locale-aware canonical/hreflang and social metadata now agree across HTML, `llms.txt`,
  sitemap, trust pages and structured data. Markdown negotiation and recoverable 404 guidance are
  covered by contract tests.

### 📚 Adoption and release hygiene

- README quick start now distinguishes `site`, `light` and `full`, links directly to docs, demos,
  Issues, support and contribution guidance, and includes a production-build check.
- GitHub issue forms, support routing and the published stable/main distinction are documented.
- Root and marketplace versions now track the newest stable release as a coherence check;
  missing `v0.43.0`–`v0.45.0` public release summaries are restored below.

## v0.45.0 — 2026-08-22

**Agent-surface and public-route hardening, an English admin, and the vermilion identity.**

- Closed framework-level `OPTIONS` bypasses across MCP, ACP, UCP, A2A and merchant-feed surfaces;
  the shipped guidance and profile-safe tests now preserve those route guards.
- Fixed locale-less route shadowing, login `callbackUrl` handling, canary asset/domain validation,
  and light-profile test assumptions.
- Added bounded attribution for UCP OAuth client registration and one explicit opaque MCP origin
  for operators that need it.
- Translated the admin panel to English and moved the engine identity from purple to vermilion.

## v0.44.1 — 2026-08-08

**MCP preflight guard patch.** `OPTIONS` now passes through the same public-feature and Origin
policy as the other MCP verbs instead of being answered by Next.js before the guard.

## v0.44.0 — 2026-08-07

**MCP Origin validation, Next.js 16.3, and stronger canary/profile contracts.**

- Added the Streamable HTTP Origin validation required to prevent DNS-rebinding attacks.
- Upgraded Next.js to 16.3.0 and NextAuth to the security-patched beta.32.
- Hardened canary timeouts and customer-domain detection, normalised discount lookup at the
  schema boundary, and made mixer/chrome errors identify the rejecting side.
- Removed shipped pointers to private-only files and made locked-design fixtures derive from the
  active profile rather than one named design.

## v0.43.0 — 2026-08-01

**Identity ownership and destructive-seed safety.**

- Made `brand.config.ts` the default identity authority and applied the same invariant to the
  Solbrillen canary.
- Refused to seed over a database that already contains customer work, while adding a safe path to
  create an operator on an existing production database.
- Fixed required lead fields receiving empty strings, discount length checks before trimming, and
  mixer chrome compatibility so the active design pack owns the decision.

## 🔒 Security advisories

| ID | Affected versions | Fixed in | Severity | Action |
|----|-------------------|----------|----------|--------|
| CW-2026-001 | ≤ v0.39.1 | v0.40.0 | Moderate | Upgrade — or backport the `mcpPublic` route gate + the API-key `expiresAt` check (#367) |
| CW-2026-002 | ≤ v0.40.0 | v0.41.0 | High (upstream) | **Dependency advisory — Next.js.** Every shop scaffolded at v0.40.0 or earlier ships a `next` version below `16.2.11` (`16.2.10` at v0.39.1–v0.40.0, `16.2.9` at v0.38.0–v0.39.0, `16.2.6` at v0.37.1 and earlier) — **every 16.2.x below 16.2.11 is affected**, so check the number in your own `package.json`, not just your engine tag. Next.js' July 2026 security release patches 9 CVEs (4 high); two reach every Cartwright shop regardless of profile because every profile ships Server Actions: a Server-Action DoS (CVE-2026-64641) and unauthenticated disclosure of internal Server Function endpoint IDs (CVE-2026-64643). **You do not have to wait for a Cartwright release** — fix it in your own shop today: `pnpm add next@16.2.11 && pnpm add -D eslint-config-next@16.2.11` (exact pins, matching the scaffold's dependency style) (#395) |

## v0.42.0 — 2026-07-25

**Hardening release II: the visitor's path, and the difference between a deploy that works and one that reports success.**
Ten changes from the second and third rounds of findings by the same downstream product — this time
from ordinary operation after go-live, and from setting production up. Round one's pattern was *one
value, many encodings*. These two add: **failures designed not to be noticed** (the data is rescued
so nobody feels the error; a correct configuration reads as empty) and **a default setup that looks
right without being it** (a deploy reports `● Ready` while serving nothing; a CI file sits in the
repo without ever running).

### ✨ Added
- **`pnpm verify:deploy <url>`** (`scripts/verify-deploy.sh`) — the check a green deploy cannot
  perform for you. A Vercel project whose Framework Preset is "Other" — what an empty CLI-created
  project gets — sets, per Vercel's docs, "the output directory as `public` if it exists". Cartwright
  *has* a `public/`, so the platform skips `next build` and serves your logos: every route 404s, the
  build log is empty, nothing errors, and the dashboard says Ready. The script asks for three routes
  the **app generates** (`/robots.txt`, `/sitemap.xml`, `/llms.txt`) — none exists as a file in
  `public/`, so a 200 proves the framework ran. Which routes is the whole design: `public/mcp.json`
  answers 200 in exactly the broken state, so a check aimed at any static file passes straight
  through the failure it exists to catch (#412).
- **`brand.identitySovereignty: "auto" | "config" | "db"`** — who owns `storeName` and
  `ecommerceEnabled`, stated instead of assumed. `"auto"` (default) reproduces today's behaviour
  expression-for-expression, so it is byte-identical by construction; `"config"` makes
  `brand.config.ts` sovereign in every mode, which is what a code-configured fork needs; `"db"` is
  the deliberate multi-tenant escape hatch. Top-level rather than a `features.*` flag on purpose:
  `FeatureKey` parity would break forks on their own config, and a protection a contaminated
  database can switch off is not a protection (#408).
- **`features.leadAiTriage`** (default **off**) — gates the AI triage on the contact form. Off is
  the honest default because `ANTHROPIC_API_KEY` is documented as optional; a surface that needs an
  optional key in order not to log an error per submission should not be on by default (#403).

### 🛠 Fixed
- **The visitor waited on — and funded — an LLM.** `/api/inquiries` awaited an Anthropic call
  *before* `prisma.lead.create`, so every enquiry paid the round-trip in latency and, without a key,
  logged an error per submission while still saving. Triage now runs in `after()` from `next/server`
  after the row is written (the pattern `lib/registry-stats.ts` already used), gated on
  `anthropicConfigured` — not `isAiConfigured()`, which is true when *either* provider is set while
  the `"vibe"` model requires Anthropic specifically. Separately, `/api/support/triage` — a second,
  unauthenticated LLM call the same form makes — had no per-IP rate limit (#403).
- **A contact form required agency fields.** `projectType` was `z.string().min(1)` with a hardcoded
  Danish message, so a plain enquiry from a hand-written form or a direct POST was rejected as the
  visitor's mistake. The shipped form hid this by always sending a value (#404).
- **`defaultLocale` fell back to a literal `"da"`** in the data-source seam, so an English fork
  served `/en/…` while `llms.txt` announced Danish. It now derives from `brand.config` — proven on a
  *different* input than the current value, because a test comparing to today's value also passes
  against a hardcoded one (#405).
- **The admin under-reported production.** `getResendStatus()` read only the database row while
  `lib/mailer/resend.ts` happily used `RESEND_API_KEY` from the environment — so a correctly
  configured fork saw "not set" on the one screen it was told to trust. Now matches the
  `envFallback` shape its two sibling status readers already had (#406).
- **Identity could be read around its own lock.** The Phase H guard was correct and well tested, and
  a fork's site renamed itself anyway: `Header`, `Footer`, `llms.txt`, the sitepack exporter and the
  composition exporter read the raw `BrandingSettings` row rather than the guarded merge. The policy
  now normalises **at the seam**, and `tests/unit/identity-bypass-invariant.test.ts` fails the build
  if any file queries the row and reads a sovereign field off it — because the readers that matter
  are the ones nobody has written yet (#408, #409).
- **The admin stored values it would never render.** Under `"config"`, the settings form, the setup
  wizard and `settings.update_branding` now drop the sovereign fields from the write and say which
  ones, instead of accepting input, reporting "Settings saved!" and changing nothing. The fields
  render as locked, and when the stored and effective values differ the form says so in as many
  words (#411).
- **`DEPLOY.md` contained a false instruction.** §9 read "Vercel auto-deploys from main" directly
  under a §1 recommending `vercel link` — but linking a *folder* to a project is not connecting the
  *project* to a repository, and pushes deploy nothing until `vercel git connect`, which itself
  requires a remote. §1 now leads with the repo; §9 states what `vercel --prod` actually does:
  uploads the working tree, **including uncommitted changes**, with no commit attribution and no
  rollback to a known state. Also documents the `vercel env pull` traps — it overwrites rather than
  merges, and sensitive values come back **empty**, so empty ≠ missing (#407, #412).

### 🧹 Housekeeping
- **`scripts/smoke-canaries.sh` no longer ships to scaffolds.** It hardcodes three Teloz canary URLs
  and asserts their brand names, themes and database state; a fork running it learned nothing about
  its own site. `scripts/verify-deploy.sh` is the customer-facing equivalent — any URL, no prior
  knowledge — and the two shipped files that told the reader to run the canary script now point
  there instead (#412).
- **Root `package.json` version** rejoins `CHANGELOG.md` and the marketplace manifest at 0.42.0; the
  v0.41.0 release bumped the other two and left it at 0.40.0.

## v0.41.0 — 2026-07-25

**Hardening release: import-time side effects, identity ownership, and the Next.js July security patch.**
Eleven changes driven by findings from a downstream product's first production deployment
(a code-configured fork — `brand.config.ts` in git, admin used only for operations). That usage
is exactly what Cartwright markets itself for, and it exposed a systematic assumption: the engine
treated the admin database as the source of truth, so wherever code and database disagreed, the
database won **silently**.

### 🔒 Security
- **Next.js 16.2.10 → 16.2.11** — the July 2026 security release, 9 CVEs (4 high). Two reach every
  Cartwright shop regardless of profile because every profile ships Server Actions: a Server-Action
  DoS (CVE-2026-64641) and unauthenticated disclosure of internal Server Function endpoint IDs
  (CVE-2026-64643). Tracked as **CW-2026-002**; `eslint-config-next` moves in lockstep. Per-CVE
  applicability was verified against this repo rather than assumed — the other six need
  `config.i18n.locales`, `rewrites()`/`redirects()`, a custom server, the edge runtime, or a
  `fetch(new Request(init), otherInit)` shape, none of which the engine uses (#395).
- **`.gitignore` now covers `.admin-credentials*`** — the bare name matched only that exact file, so
  a sibling like `.admin-credentials.prod` (what a production-admin bootstrap writes) was
  commit-eligible. A `!.admin-credentials.example` negation keeps the convention's stub committable (#399).

### ⚠️ Breaking
- **`sanitizeUserHtml()` is now async** (`lib/v0/transform/sanitize-strict.ts`), and with it
  `parseSitePackContent`, `sanitizeContentRow`, `sanitizePageRow` and `sanitizeLayoutJson`
  (`lib/sitepack/import-parse.ts`). If your fork calls any of them directly, add `await`; every
  in-engine call site was already async. The reason is not cosmetic: jsdom is now **loaded** on
  first use rather than imported at module scope, and a dynamic import cannot be synchronous. See
  below (#397).

### 🛠 Fixed
- **A feature toggle could rename a live site.** Nineteen `BrandingSettings` `create:` branches
  across fourteen files hardcoded `storeName: "Cartwright"` (and `"My store"` / `"Min shop"` in the
  wizard's own writers). That branch runs only when the row does not exist — the normal state of a
  fork configured in code — so the first arbitrary admin action stamped the engine's name onto the
  product: header, footer, and `llms.txt`, the file AI crawlers read. All nineteen now read
  `brand.storeName` through `brandingCreateDefaults()` (#398).
- **Importing the HTML sanitizer loaded jsdom.** `sanitize-strict.ts` imported and constructed jsdom
  at module scope, and it is reachable from `lib/tools/registry.ts` — a barrel that statically
  imports ~20 tool modules and is imported by 14 files, including `/admin/audit`, which wants only
  `getTool()`. jsdom's CJS entry requires `html-encoding-sniffer`, which depends on the ESM-only
  `@exodus/bytes`; under some bundler/runtime combinations that boundary throws `ERR_REQUIRE_ESM` at
  module load and takes the whole page down, a subsystem away from anything to do with HTML (#397).
- **Every page view loaded 29 design packs to bust a cache.** `lib/theme.ts` imports `@/designs`
  (29 static pack imports, ~1.4 MB, unshakeable because `ALL_DESIGNS` references each one), and 31
  files import `lib/theme` — including `app/[locale]/layout.tsx`, the storefront root layout. Eight
  writers imported it purely for the three-line `invalidateThemeCache`, and a plugin purely for the
  two-line `isValidHex`. Both now live in leaf modules (`lib/theme-cache.ts`, `lib/color.ts`) that
  `lib/theme.ts` re-exports, so the documented plugin contract is unchanged. This also explains two
  tests long written off as "flaky under load": audit-revert 2.58 s → 284 ms, design-import
  2.00 s → 240 ms (#401).
- **`vercel.json` pins `"framework": "nextjs"`.** A project created through the Vercel CLI defaults
  to preset "Other", which serves `public/` statically — every route 404s and the build takes 0 ms,
  with nothing that looks wrong (#399).

### ✨ Added
- **A lint rule against import-time side effects** — `no-module-scope-heavy-construction` forbids
  constructing jsdom/Prisma/Redis/OpenAI/Anthropic/Resend/Stripe/S3 clients at module scope, where a
  barrel turns one module's cost into every importer's problem. The rule is written into `AGENTS.md`,
  so scaffolds inherit it (#400).
- **Module/profile dependency inventories** — import-grounded per-module dependency sets and derived
  prune sets, with five invariants (#391).

### 🧪 Tests
- New invariants that fail the build rather than relying on discipline: no writer may hardcode a
  store name (source scan, quote-agnostic, with a reasoned allowlist and a spread-precedence check),
  jsdom must not be loaded at import, leaf modules must stay leaves, credential globs are asserted
  through `git check-ignore` itself, and every `vercel.json` cron must resolve to a real route (#398,
  #397, #401, #399).
- The `/api/mcp` tool bridge is locked: 1:1 tool registration with no scope pre-filtering, `isError`
  on failed calls, scope delegation, audit context, and the stateless-JSON transport (#396).
- Write-tool coverage for `lib/tools/discounts.ts` and `lib/tools/marketing.ts` (#392, #393).

### 📚 Docs
- The `section-vocabulary` skill mirrors all 27 registry section keys (was 20) (#394).

## v0.40.0 — 2026-07-19

**The site profile — a real site with no database — plus Plus activation and the public-surface lockdown.**
The engine now describes itself as modules (`cartwright-module-v1`), proves the site file-set
import-closed, and scaffolds a static `--profile site` variant; Cartwright Plus activates via
Ed25519-signed keys; and the public MCP/tool surface finally honors its own flag.

### 🔒 Security
- **`mcpPublic` is now enforced on the public tool surface** — `/api/mcp` and `/api/v1/tools`
  previously answered even with the flag off; they now return 404, indistinguishable from a site
  without the surface. **`ApiKey.expiresAt` is now enforced** — expired keys were previously still
  accepted; they now get 401 (#367, follow-up #377). Tracked as **CW-2026-001** in the advisory
  index. The flag defaults on (and is on in every shipped config), so only shops that explicitly
  disabled `mcpPublic` and/or relied on API-key expiry are affected. Upgrade, or backport
  `lib/tools/public-gate.ts` + the `lib/api-auth.ts` expiry check.

### ✨ Added
- **The module/profile architecture (site-profile B-phase)** — the `cartwright-module-v1` spec +
  module/profile registry with graph tests (#374), per-module file inventories + the agent-core
  node + a `knownDeviations` ledger (#381), and the B3 engine slice: static design-layer variants,
  18 import seams and `scaffold/manifest.json`, proving the site file-set import-closed so
  `create-cartwright --profile site` cuts a no-DB static site (#382, #383, #384, #385).
- **Cartwright Plus activation v1** — Ed25519 license-key verification + `/admin/plus`, env-only
  and schema-free (#380).
- **Adaptive-admin slice** — the four always-rendered AI admin pages are now flag-gated (#375).
- **The mixer preview surfaces non-mixable Skin×Voice combos** instead of silently degrading (#388).

### 🛠 Fixed
- `/api/acp/feed` gates on `ecommerceEnabled` — website-mode parity with the other feeds (#370).
- Regenerated the drifted migration baseline so `prisma migrate deploy` works, guarded by a new
  `db:verify` CI gate (#379).
- Version coherence restored — CHANGELOG entries for v0.38.0–v0.39.1 + `package.json`/manifest
  version alignment (#378).
- The site-audit walker falls back to an fs-walk when the tree has no git repo (#386).

### 🛡 Hardened
- Tool suites locked: the feature-flag read/write tools (#387), the taxonomy upsert/delete/list
  tools (#366), the ACP session→Order money path (#365) and the settings singleton write tools
  (#389).

### 📚 Docs & launch
- Tool map regenerated (86 tools / 35 domains) + drift gate + the simple-site runbook (#371);
  launch-content fact-refresh (#376); the "Choose Cartwright when" decision matrix + shadcn
  try-one-component (#372); the README terminal cast (#373); community badges, issue/PR templates
  + Code of Conduct (#368); the 2026-07 radar delta (#369).

## v0.39.1 — 2026-07-12

**Hardening patch — the protect-live test wave + dependency currency.**

### 🛡 Hardened
- **Moat + money-path regression tests**: the ACP delegated-payment completion route (#358),
  the Guardian adjudication core (fail-closed, replay, short-circuit order — #359), the escrow
  fund-release route (#362) and the audited order-status tool + operator state-machine (#363)
  are now all pinned by non-vacuous unit suites (source-mutation-verified).

### 🛠 Maintenance
- Within-range dependency currency batch + `postcss` security override (#361).
- Non-blocking native typecheck script (`typecheck:native`, tsgo trial) (#360).
- Byte-identical a11y recipes added to the cartwright-guidance skill (#364).

## v0.39.0 — 2026-07-07

**AI-crawler policy, declarative design layout, and honest agentic error handling.**

### ✨ Added
- **AI-crawler taxonomy in the SEO controls** — Search/Agent/Training crawler categories with a
  new "block training only" policy option (#355).
- **`DesignPack.layout`** — design packs declaratively control the shared `<main>` wrapper
  (`mainClassName` / `ownsMain`) instead of fighting it (#351).

### 🛠 Fixed
- Agentic endpoints (ACP/A2A/tools) return proper 4xx for client errors — never a masking 500 (#352).
- Ember chrome reads the `isEcommerce` predicate; `Button` has a visible focus ring (#353).

### 🛡 Hardened
- Discovery route handlers pinned by tests: `/api/agent-card` (#348), `/.well-known/mcp.json`
  (#349), both product-feed routes (#350) and `POST /api/negotiate` (#357).

## v0.38.0 — 2026-07-03

**Agentic discovery goes spec-true, the checkout speaks your language, and the stack gets a
currency pass.**

### ✨ Added
- **ACP product feed pinned to the official OpenAI schema** — discovery-ready field mapping
  (`item_id`, price strings, availability enums, seller/policy URLs) (#340).
- **Google Merchant `g:product_detail` conversational attributes** in the Merchant feed (#342).
- **Speculation Rules prefetch** behind a new default-off `speculationRules` flag (#341).
- 2026-07 feature radar (agentic commerce, Next 16.x, web platform) as the roadmap driver (#339).

### 🌍 i18n
- The entire cart + checkout flow routed through next-intl: payment panel, trust badges,
  field-validation errors and order-placement errors (via error codes) (#337, #338, #344, #345).

### 🛠 Fixed
- Tool/section JSON-Schemas now emit real schemas via Zod v4 `z.toJSONSchema` (#324).
- Fresh-scaffold DX hardening from the v0.37.1 cold-run audit (#323).

### 🛡 Hardened
- Dependency currency + `undici` security override (#332); AI SDK v7 migration (#336).
- +49 regression cases across shipping/pricing/FX/genome-resolve (#333); catalog-feed builder
  + UCP capability-profile invariants pinned (#346, #347).
- Product-aware accessible names for cart/add-to-cart/wishlist controls (#322, #334, #335).

## v0.37.1 — 2026-06-16

**Cleanup patch — three finished, gated-green PRs that missed the v0.37.0 cut.**

### 🔒 Security
- **Optional shared-secret guard on the Phone.inc webhook** (`plugins/phone-widget`) — the
  click-to-call webhook can now require a shared secret, so a shop running the phone widget can
  reject unauthenticated webhook calls. Opt-in (set the secret) and the plugin is default-off,
  so this is hardening rather than a forced critical fix — no advisory-index row.

### ✨ Added
- **Flag-gated Preview link on the Design picker cards** (`/admin/designs`) — each design card
  can surface a Preview link to see the look before applying it (default-off).

### 🛠 Fixed
- **PLP empty-results heading** now echoes the searched term, so a no-results search reads as
  a search for «that term» instead of a generic empty state.

## v0.37.0 — 2026-06-15

**SitePack portability, content-import, the purple rebrand — and a new-customer hardening wave.**
A whole site is now exportable and restorable as a `.cartpack`, an AI can rebuild a real site
from a scraped URL, the engine wears its own Cartwright-purple identity, and the cold-scaffold
first hour was audited end-to-end (4 personas + Codex/Gemini) with the breaks fixed at the source.

### ✨ Added
- **SitePack** (`sitepack.export` / `sitepack.import` + the `/admin/sitepacks` Snapshot & Restore
  wizard) — snapshot a whole site to a hardened, integrity-checked `.cartpack` (sha256 + merkle,
  red-teamed in-memory tar codec, content-safety + compat gate on import) and restore it onto a
  newer engine. The code-vs-data boundary that makes a site portable.
- **Content-import** — scrape a URL → rebuild it as Cartwright pages/services as **drafts**
  (`draft|published` status on Page + Service), with a page classifier, dry-run import planner,
  SSRF-guarded remote-image import, and the `runImport` orchestrator. Flag-gated (`siteImport`).
- **Blog + services + image tool surface** — `posts.create/update/publish/list`,
  `services.create`, and `images.import_from_url` over the typed REST tools.
- **Cartwright purple rebrand** — the glassmorphic purple first-run canvas, a matching
  `built-with-cartwright`, and the engine identity surfaces repointed to the `--cw-brand` token
  (customer palettes untouched).
- **Annotate** — the in-place "edit on the live storefront" experience (glass panel, anchored
  popover) with edit-hooks in the flagship designs + direct field (price) editing.
- **Ember** premium design pack + **dentist / restaurant / fitness** voice presets.
- **Storefront SEO** — visible breadcrumbs (category / PLP / services / blog, flag-gated) plus
  Blog / Service / BreadcrumbList JSON-LD.

### 🛠 Fixed — the new-customer hardening wave
- **Website-mode rendered as a webshop** — a website-corporate scaffold seeded
  `BrandingSettings.ecommerceEnabled = true` (the schema default), so the corporate site shipped a
  cart, product search, shipping badges and a demo banner. The seed now persists
  `brand.ecommerceEnabled`, `getBrand()` forces website-mode false at render (#285), and the
  AI-bootstrap write path no longer hardcodes shop-on (#317).
- **First-login redirect loop** between `/admin/setup` and `/admin/konto` (#276).
- **Footer linked about/faq to slugs the template never seeded** → 404s (#277).
- **Danish leaks** in the seed banner, first-run post-splash, and account UI on English
  scaffolds (#278 / #284 / #281); `og:locale` now derived from the route locale (#274).
- **Single-locale shops shipped a broken language switcher** — a `locales:["en"]` site rendered a
  🇩🇰 DA toggle that routed `/da` → 404; the switcher now hides at one locale and maps options
  from `brand.locales` (#317).
- **Duplicate industry options** in the setup wizard, from the legacy `saas`/`eyewear` alias
  slugs (#317).
- **AI tool surface** — error bodies now carry `ok:false` across every shape, `features.set` error
  copy is English, and `llms.txt` reports the actual locale rather than the country code (#317).
- **a11y** — the first-run copy button no longer puts `aria-live` on the interactive control (#317).

## v0.36.3 — 2026-06-12

**The AI-agent hardening release.** Three external AIs (Claude, Codex, Gemini) each built a
site on the engine and surfaced real gaps; a full parity/security audit surfaced more. All
fixed at the source — the scaffold is now self-prompting, AI-build-friendly, and the
critical security drift is closed.

### 🔒 Security
- **Auth-gated three admin AI endpoints** (`/api/admin/translate`, `/api/admin/generate-logo`,
  the phone plugin handler) that were internet-reachable with no session check — an open,
  billed LLM proxy on every deployed shop. New shared `requireAdminApi()` (401 for APIs) +
  a regression test that walks every `app/api/admin/**` route and asserts a guard, so the
  class can't recur (25 routes covered).
- **Security headers** in `next.config.ts`: nosniff, X-Frame-Options, Referrer-Policy, HSTS,
  Permissions-Policy; CSP shipped Report-Only.
- **Login brute-force throttle** (`lib/auth/login-throttle.ts`): per-IP + per-email
  token-bucket before any bcrypt work, timing-oracle-safe.

### ✨ Added
- **DESIGN.md** — the self-prompting design playbook every agent file points to: the three
  build paths, the built-ins inventory (ThreeHero + 9 scenes, svg-items, the verified GSAP
  recipe), 8 taste rules, the screenshot self-verification rule, and the engine-overlay
  design hooks. GEMINI.md upgraded from pointers to full content.
- **Blank Canvas motion examples** (`designs/blank/examples/*.example`) + stable
  `data-cw-*` design hooks on every floating engine overlay (AI assistant, phone, voice,
  consent, welcome, sticky-ATC).

### 🛠 Fixed
- `pnpm typecheck` script the docs promised; `threeD.scene` typed as `SceneId` (no more
  stale 4-scene union); ThreeHero `className` merges with the full-bleed default instead of
  replacing it; any next/font name resolves in tests; an ESLint rule catches event handlers
  in Server Components before runtime.

## v0.36.2 — 2026-06-11

**Patch: en-only scaffolds typecheck.**

### 🛠 Fixed
- `proxy.ts` hardcoded a `"da" | "en"` locale cast, so the English-only scaffolds that
  `create-cartwright` now produces failed `tsc` out of the box (found live by a
  customer's AI, which had to patch the template before building). The cast is now
  derived from the configured `routing.locales`.

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
