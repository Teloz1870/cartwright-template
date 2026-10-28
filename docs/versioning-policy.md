# Versioning & stability policy

This is the contract for what changes between Cartwright releases, what counts as
"breaking," and what you can rely on when you build on the engine. If you're
evaluating whether to scaffold a real business on Cartwright, this page is for
you.

## The delivery model: tagged snapshots, not a live dependency

Cartwright is **not** an npm package your shop imports at runtime. `npx
create-cartwright` copies the template **at a tagged release** into your repo,
and from that moment **your shop is your own code** — nothing in it updates
automatically. The tag/commit your shop was cut from is recorded in
[`.cartwright/release.json`](../.cartwright/release.json):

```json
{ "engine": "cartwright", "channel": "stable", "ref": "v0.45.0", "version": "0.45.0", "commit": "…", "releasedAt": "2026-08-22" }
```

This is deliberate. You own every file; there is no framework that can push a
change into your storefront behind your back. The flip side is that **pulling
engine improvements is a thing you do on purpose** (see [Updating a shop](#updating-a-shop)).

## Two version lines (don't confuse them)

| What | Scheme | Where |
|---|---|---|
| **The engine** | `v0.MINOR.PATCH` git tags (current stable: `v0.45.0`) | this repo / the template mirror |
| **`create-cartwright`** (the npm scaffolder) | its own `MAJOR.MINOR.PATCH` (current npm `latest`: `2.7.7`) | npm |

The npm `create-cartwright` version is **the CLI's** version, not the engine's.
Each CLI release pins a `DEFAULT_REF` (an engine tag) and scaffolds that snapshot.
For example, `create-cartwright@2.7.7` pins engine `v0.45.0`. To know which engine
version you actually got, read `.cartwright/release.json` — not the npm version
you typed.

Check the live sources rather than copying a number from a blog post:

```bash
npm view create-cartwright version dist-tags
npx create-cartwright@latest my-site   # stable engine tag pinned by that CLI release
```

| Template ref | Stability | Intended use |
|---|---|---|
| `stable` (default) | Latest engine tag pinned by the installed CLI | New and production shops |
| `main` | Unreleased public integration branch, possibly ahead of stable | Review and testing only |
| `vX.Y.Z` | Exact immutable engine snapshot | Reproducible installs and upgrades |

## Pre-1.0: what `v0.x` means here

The engine is pre-1.0. We follow semver's spirit, adapted for a `0.x` line:

- **PATCH** (`v0.36.2 → v0.36.3`) — fixes and additive, default-off features.
  Always safe to adopt.
- **MINOR** (`v0.35.x → v0.36.0`) — new subsystems and, **occasionally, breaking
  changes**. Pre-1.0, breaking changes are *allowed* in a MINOR bump — but they
  are **never silent**: every one is called out in [`CHANGELOG.md`](../CHANGELOG.md)
  with a migration note.

When the engine reaches **v1.0**, breaking changes move to MAJOR bumps only. Until
then, read the CHANGELOG before you pull a new MINOR.

## The core stability guarantee: additive, flag-gated by default

The single most important promise: **new subsystems ship behind a default-`false`
feature flag** ([`brand.features.*`](../brand.config.ts), enumerated in
[`lib/feature-flags/manifest.ts`](../lib/feature-flags/manifest.ts)). A shop that
pulls a new engine version and changes nothing else renders **byte-identical** to
before — the new code is dormant until you opt in. This is enforced in CI by the
3-canary smoke contract and is why most upgrades are drop-in.

So "Cartwright added multi-currency / breadcrumbs / a blog" is **never** a breaking
change for your shop — those arrive off, and you turn them on when you're ready.

## What counts as a breaking change

A change is **breaking** (and gets a MINOR bump + a CHANGELOG migration note) when
adopting the new version requires you to do something:

- **Database schema** that needs a `pnpm db:push` / migration to keep working.
- **`brand.config.ts` shape** — a renamed/removed/retyped field your config must change.
- **Public agent surface** — removing or changing an existing tool in
  `/api/v1/tools`, the MCP surface, or an API-key scope.
- **Extension contracts** — `cartwright-design-v1`, `cartwright-plugin-v1`,
  `cartwright-composition-v1`. New optional fields are additive; removing or
  retyping an existing one is breaking.
- **Removing a feature flag** (after its deprecation window — see below).

A change is **non-breaking** when it's purely additive: a new default-off flag, a
new optional contract field, a new route that nothing links to until enabled, a
new design/plugin/voice in the catalogue.

## Deprecation policy

We don't yank things out from under you. When a field or flag is superseded:

1. It's marked `@deprecated` in JSDoc with a pointer to the replacement, and
2. **both the old and the new path keep working** for a transition window (at
   least one MINOR line), and
3. removal happens only in a later MINOR, with a CHANGELOG note.

Live example in [`brand.config.ts`](../brand.config.ts): `ecommerceEnabled` is
`@deprecated` in favour of `features.webshop`; both are read today.

## Security & supported versions

- The **latest tagged release** gets security fixes. Older tags are best-effort —
  upgrade to the latest line.
- The canonical place to check whether your version has a known fix is the
  **[🔒 Security advisories index in `CHANGELOG.md`](../CHANGELOG.md#-security-advisories)**.
  A security fix adds a `### 🔒 Security` block to its release (issue + severity +
  the version to upgrade to) **and** a row to that index.
- Report a vulnerability via the process in [`SECURITY.md`](../SECURITY.md)
  (private GitHub advisory — never a public issue).

## Updating a shop

Because a scaffolded shop is your own code, updating is a deliberate, reviewable
step — not an auto-push:

1. **Check the advisories index** in `CHANGELOG.md` against your
   `.cartwright/release.json` version.
2. **Pull the engine changes** you want — cherry-pick the relevant commits, or
   merge a feature branch from your engine remote (the per-fork workflow in
   [`DEPLOY.md`](../DEPLOY.md) → "Sync med cartwright upstream").
3. **Run `pnpm db:push`** if the change touched the Prisma schema, and re-run
   your tests.

> A guided `cartwright update` command (diff against the template ref, walk you
> through the merge, flag schema changes) is on the roadmap — it is **not shipped
> yet**. Until it lands, the manual path above is the supported update route.

## TL;DR

- Your shop is a **one-shot copy** at a tag; it never auto-updates.
- New features arrive **default-off** → upgrading is byte-identical until you opt in.
- Pre-1.0, **MINOR may break** — but only with a CHANGELOG migration note.
- Deprecations keep working for **≥1 MINOR** before removal.
- Latest tag gets **security fixes**; the CHANGELOG advisory index is canonical.
