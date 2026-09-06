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
  /** null means the profile may describe every implemented feature. */
  publicFeatureKeys: null as readonly string[] | null,
} as const;
