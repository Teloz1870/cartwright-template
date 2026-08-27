/** Compile-time capabilities for the no-database `site` scaffold. */
export const profileCapabilities = {
  agentApi: false,
  accountAndAdmin: false,
  /** The static profile deliberately advertises only its baseline web layer. */
  publicFeatureKeys: [] as readonly string[],
} as const;
