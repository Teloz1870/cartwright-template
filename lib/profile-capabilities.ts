/**
 * Interfaces that physically ship in the current scaffold profile.
 *
 * The engine tree is the managed/full variant. `create-cartwright --profile
 * site` replaces this file with `profile-capabilities.static.ts`, so public
 * pages never advertise routes that the materializer removed.
 */
export const profileCapabilities = {
  agentApi: true,
  accountAndAdmin: true,
  /**
   * The contact form's AI triage endpoint (`/api/support/triage`, admin-owned)
   * exists in this profile. The form asks before it POSTs there: in a profile
   * without it the POST hit the catch-all, answered 405, and the visitor saw
   * "Could not connect to the server" — the human path was never reached.
   */
  supportTriage: true,
  /**
   * The database-backed marketing pages exist (`app/[locale]/services`, owned
   * by the `pages-db` module). The site header links `/services`; in a profile
   * without that module the link 404s on a route the materializer removed —
   * measured on a real 2.9.3 scaffold. (Provider caveat: this file's seam is
   * provided by `mcp`, so a hypothetical profile with `pages-db` but no `mcp`
   * would read `false` here and merely HIDE a working link — safe direction;
   * backlog W8 tracks moving the seam to its route's owner.)
   */
  dbPages: true,
  /**
   * The About and Privacy aliases exist (`app/[locale]/{about,privacy}`, owned
   * by the `trust-pages` module). The footers link both unconditionally; a
   * profile without the module would link two 404s — the same class as
   * `/services` above, measured on a real 2.9.4 `--profile site` scaffold where
   * both answered 200 only because nothing owned them (owner CW-23).
   * `/info/terms` and `/info/cookies` are deliberately NOT gated on this: they
   * are the seam target `app/[locale]/info/[slug]/page.tsx`, which every
   * profile serves (core's static variant renders the built-in legal content).
   */
  trustPages: true,
  /**
   * Cartwright's OWN marketing routes exist (`/cartwright`, `/priser`,
   * `/cases`, `/start`, `/changelog`, `/built-with-cartwright`, `/manifest`).
   * True here and in the public mirror; `scaffold/engine-only.ts` lists them so
   * that every shipped file linking one has to ask first. Derived, not listed:
   * `tests/unit/pruned-route-hrefs.test.ts` greps every `ENGINE_ONLY` route out
   * of the ledger and demands the gate in whatever file links it.
   *
   * B4 OBLIGATION, READ BEFORE WIRING THE DELETION: THIS KEY MUST GO FALSE IN
   * EVERY PROFILE, NOT ONLY IN `site`. `ENGINE_ONLY` is profile-independent —
   * it says "never in a customer's scaffold" (owner CW-23), not "never in a
   * `site` scaffold". This file is not: the seam is provided by the `mcp`
   * module (`modules/registry.ts`), and `managed-site`/`light`, `commerce` and
   * `agentic`/`full` all include `mcp`, so only `site` swaps in
   * `profile-capabilities.static.ts` while every other profile reads the `true`
   * above. Measured on this tree against create-cartwright 2.9.5's
   * materializer: `applyMaterializer(dir, "light")` leaves `engineMarketing:
   * true` AND all seven route directories in place — self-consistent today,
   * precisely because the deletion does not exist yet. The day B4 deletes them
   * without flipping this key, a LIGHT scaffold (the CLI default) links seven
   * dead routes from `components/Footer.tsx`, `components/Footer.static.tsx`,
   * `components/nav/marketing-pages.ts`, `components/AnnouncementBar.tsx`,
   * `components/first-run/WelcomeCanvas.tsx`, `app/sitemap.ts`,
   * `app/llms.txt/route.ts` and `app/api/mcp/route.ts` — CW-23 verbatim,
   * relocated from `site` to the default profile.
   *
   * Why the seam does not already carry a third variant: the released
   * materializer never reads `replaces[].with`. A seam with an included
   * provider keeps the on-disk file untouched, and only an UNPROVIDED seam is
   * copied from its `.static` sibling (cartwright-app
   * `apps/cli/src/materializer.ts`, `computeMaterializationPlan`). A
   * per-profile capability file is therefore a change to that contract, and
   * shipping a `.customer.ts` variant now would ship bytes no CLI can read.
   * `ENGINE_ONLY_PENDING_PROFILES` in `scaffold/engine-only.ts` pins the exact
   * profile set this paragraph is about — recomputed in
   * `tests/unit/scaffold-ownership.test.ts` from the module graph in
   * `modules/registry.ts` (the manifest's own source, drift-gated against the
   * committed JSON) — so the gap cannot quietly change shape while B4 is
   * pending. It is published to the CLI as `engineOnlyGate.pendingProfiles` in
   * `scaffold/manifest.json`, beside the `engineOnly` list it guards, so the
   * caveat crosses the repository boundary together with the instruction.
   */
  engineMarketing: true,
  /** null means the profile may describe every implemented feature. */
  publicFeatureKeys: null as readonly string[] | null,
} as const;
