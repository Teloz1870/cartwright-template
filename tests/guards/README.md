# `tests/guards/` — the tests that run inside YOUR project

Everything else in `tests/` is the engine testing itself, and most of it does not travel:
`--profile site` deletes `tests/unit/` wholesale, `--profile light` deletes twelve named
entries out of it (nine files and three directories — seventeen files on disk), and the
public template strips `tests/e2e/` and `tests/engine/`.

This directory travels. It runs on `pnpm test` in every profile, in the engine and in your
project, and it asks the questions that can only be answered *after* a scaffold exists:

| Guard | Kind | Asks |
|---|---|---|
| `chrome-no-dead-links` | live | do the homepage's `<a>` links, favicon, `og:image` and JSON-LD logo answer 2xx? |
| `sitemap-covers-routes` | live | does `/sitemap.xml` exist, and does every URL in it resolve? |
| `no-dead-fetches` | static | does every `fetch("/api/…")` have an `app/api/**/route.ts`? |
| `no-dead-scripts` | static | does every `scripts/…` file a `package.json` script runs exist? |
| `identity-not-ours` | static | is Cartwright's own domain, org or company name still in `brand.config.ts`? |
| `marketing-routes-absent` | static | are Cartwright's own pages gone from your repository? |
| `profile-marker` | static | is `.cartwright/profile.json` present and readable? |
| `guards-are-portable` | meta | do the guards themselves still obey the rules below? |

The two live guards check the list in that table and nothing else — not `<img>`, not
stylesheets, not path-relative hrefs. A green run means those things answered; it does not
mean the page is whole.

## Running them

```bash
pnpm test                                   # static guards (and everything else)
pnpm exec vitest run tests/guards           # this zone only

pnpm build && pnpm start                    # then, in a second shell:
GUARD_BASE_URL=http://localhost:3000 pnpm exec vitest run tests/guards
```

Without `GUARD_BASE_URL` the live guards **skip** and say so on stderr. A skip is reported as
pending, never as a pass — so "the live guards ran" and "the live guards passed" stay
different facts. Nothing in CI sets that variable yet, here or in your project: running the
live half is a thing a person does, with the two commands above.

## Known red

Two guards can be red in a project nobody has broken. Both are ours, and both are named here
so a red run tells you whose gap it is.

### `chrome-no-dead-links` — `/services` and `/info`

A fresh `site` or `light` project renders two homepage links that 404:

| Link | Where it comes from | Why it is dead |
|---|---|---|
| `/services` | `brand.config.ts` → `website.secondaryCtaHref` | the page exists in the engine, but the `site` and `light` profiles both remove it |
| `/info` | `brand.config.ts` → `website.ctaFooterSecondaryHref` | there is no `/info` index page anywhere — only `/info/<slug>` — so this 404s in every profile, including ours |

Both are configuration values rather than hard-coded hrefs, which is why the engine's
source-level link check cannot see them. Point them at pages you actually have (`/contact`
and `/about` are in every profile), or empty the labels beside them to hide the buttons —
either edit is two lines in `brand.config.ts` and turns the guard green.

### `marketing-routes-absent` — Cartwright's own pages

This one **skips with a warning** rather than failing, and the warning lists the paths. Your
project may contain Cartwright's product page, price list, case studies, onboarding funnel
and release log. The engine ships a ledger of them (`scaffold/manifest.json` → `engineOnly`);
`create-cartwright` does not read it yet. **create-cartwright 2.10** is the release that
performs the deletion. Until then: delete the listed paths yourself, or re-scaffold once it
ships. When a version of the CLI claims to have pruned them — it records that in
`.cartwright/profile.json` — this guard stops warning and starts failing, so the promise
cannot be made quietly and then broken.

**Cartwright maintainers, read this before tagging:** while the CLI is old this guard is
PENDING, not red, in the release scaffold gate's `pnpm test` step for `light` and `site`. That
is the whole reason it is a ratchet — an earlier draft asserted the paths absent outright,
which would have made that gate 1/3 green on the day it merged.

## The rules a guard obeys

Pinned mechanically by `guards-are-portable.test.ts`, because every way of breaking them is
quiet:

1. **No `@/…` imports.** The alias points into the app, and a profile may have pruned the
   target. A guard that cannot load is not a red test — it is an error a
   `--passWithNoTests` run can wave through.
2. **No git, no child processes.** Scaffolds are created with `--no-git`, so `git ls-files`
   returns nothing and a walk built on it silently checks zero files.
3. **Node builtins and `vitest` only.** Everything else is prunable in some profile.
4. **"Am I the engine?" is `existsSync(".github/sync-excludes.txt")`** — the one file that
   exists in the engine and, by excluding itself from the mirror, in no scaffold cut from it.
   One copy of that probe, in `_shared.ts`.
5. **The profile comes from `.cartwright/profile.json`**, an absent marker means `full`, and a
   marker that is present but unreadable is a failure rather than a shrug.
6. **A live guard gates every test with `it.skipIf(!base)`** and warns once when the origin is
   unset. A test that returns early is reported as PASSED; a skipped one is PENDING.

Helpers for all of it live in `_shared.ts`. Adding a guard means adding a file here — the meta
guard picks it up automatically.
