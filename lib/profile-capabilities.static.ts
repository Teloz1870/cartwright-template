/** Compile-time capabilities for the no-database `site` scaffold. */
export const profileCapabilities = {
  agentApi: false,
  accountAndAdmin: false,
  /** No admin, no AI triage route — the form goes straight to the owner's inbox. */
  supportTriage: false,
  /** No `pages-db`: `app/[locale]/services` is not in this scaffold. */
  dbPages: false,
  /**
   * No `trust-pages` module by default: `app/[locale]/{about,privacy}` are not
   * in this scaffold unless it was cut with `--with trust-pages`. Known gap
   * (B4): the opt-in case still reads `false` here, so the pages ship but the
   * stock footer does not link them — safe direction, never a 404.
   */
  trustPages: false,
  /**
   * Cartwright's own marketing routes are not in a customer's scaffold — the
   * intent of `scaffold/engine-only.ts`, and false here so a `site` scaffold's
   * chrome stops linking them the moment this twin lands. Two halves of the
   * same promise are still open, both B4: the CLI does not delete the routes
   * yet (no released create-cartwright reads `engineOnly`), and this twin
   * reaches ONLY the `site` profile — see the B4 OBLIGATION block on the
   * engine-tree sibling.
   */
  engineMarketing: false,
  /** The static profile deliberately advertises only its baseline web layer. */
  publicFeatureKeys: [] as readonly string[],
} as const;
