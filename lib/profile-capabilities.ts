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
  /** null means the profile may describe every implemented feature. */
  publicFeatureKeys: null as readonly string[] | null,
} as const;
