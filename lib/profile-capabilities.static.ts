/** Compile-time capabilities for the no-database `site` scaffold. */
export const profileCapabilities = {
  agentApi: false,
  accountAndAdmin: false,
  /** No admin, no AI triage route — the form goes straight to the owner's inbox. */
  supportTriage: false,
  /** No `pages-db`: `app/[locale]/services` is not in this scaffold. */
  dbPages: false,
  /** The static profile deliberately advertises only its baseline web layer. */
  publicFeatureKeys: [] as readonly string[],
} as const;
