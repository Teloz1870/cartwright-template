/**
 * Master Plan §4 Phase 7 — legislation branch of Separation-of-Power (§3.3).
 *
 * "Legislation" = the policy rules that govern what agentic calls are allowed
 * on this shop. The human admin sets these via BrandingSettings.agenticPolicyJson
 * (Phase 7 schema addition). The Guardian middleware (this directory's
 * `middleware.ts`) consults the parsed legislation before allowing any
 * call into /api/a2a/*, /api/mcp, /api/acp/*, or /api/negotiate.
 *
 * Two layers of safety:
 *
 *   1. Schema validation (Zod). The DB blob is parsed and checked against a
 *      strict schema. Any malformed policy → guardian fails closed (deny-all)
 *      with reason "policy_malformed" rather than silently allowing.
 *
 *   2. Sensible defaults. If BrandingSettings has no policy blob set, the
 *      DEFAULT_POLICY (deny-all) is used. Shops opt in to A2A explicitly
 *      via /admin/agentic (Phase 9) rather than by accident.
 *
 * Pure module — only imports zod (a pure data validation library).
 */

import { z } from "zod";

// ============================================================================
// Schema
// ============================================================================

/** Capabilities that an agentic policy can grant or deny. */
export const AGENTIC_SCOPES = [
  "negotiate", // POST /api/negotiate (call the Anchor-Resume engine)
  "escrow.fund", // create + fund an EscrowTransaction
  "escrow.release", // submit a PoTE to release escrow
  "escrow.refund", // request refund of escrow
  "agent-card.read", // GET /api/agent-card
  "products.read", // GET /api/acp/feed
  "checkout.create", // POST /api/acp/v1/checkout_sessions
  "mcp.invoke", // any /api/mcp tool invocation
] as const;

export type AgenticScope = (typeof AGENTIC_SCOPES)[number];

const agenticScopeSchema = z.enum(AGENTIC_SCOPES);

/**
 * The shape stored in BrandingSettings.agenticPolicyJson.
 *
 * - allowedScopes: which actions are permitted at all on this shop
 * - blockedAgentIds: specific buyer-agent principals (sub claim in A-JWT)
 *   that are blacklisted regardless of other rules
 * - maxOrderValueMinor: hard cap on a single negotiation/escrow amount,
 *   in minor currency unit (øre/cents). Null = no cap.
 * - allowedRails: payment rails that escrow can use. Empty = no escrow.
 * - requireEscrow: if true, any negotiated agreement above this threshold
 *   MUST flow through escrow (no direct payment).
 * - requireEscrowAboveMinor: threshold for requireEscrow in minor units.
 *   Null + requireEscrow=true means ALL agreements go through escrow.
 */
export const agenticPolicySchema = z.object({
  allowedScopes: z.array(agenticScopeSchema).default([]),
  blockedAgentIds: z.array(z.string()).default([]),
  maxOrderValueMinor: z.number().int().positive().nullable().default(null),
  allowedRails: z.array(z.string()).default([]),
  requireEscrow: z.boolean().default(false),
  requireEscrowAboveMinor: z.number().int().nonnegative().nullable().default(null),
});

export type AgenticPolicy = z.infer<typeof agenticPolicySchema>;

/**
 * Default policy: deny-all. A shop with no agenticPolicyJson set (the
 * out-of-the-box state) cannot serve any agentic call. The owner must
 * opt in via /admin/agentic.
 */
export const DEFAULT_POLICY: AgenticPolicy = {
  allowedScopes: [],
  blockedAgentIds: [],
  maxOrderValueMinor: null,
  allowedRails: [],
  requireEscrow: false,
  requireEscrowAboveMinor: null,
};

// ============================================================================
// Parsing
// ============================================================================

/**
 * Result of parsing the policy JSON blob.
 *
 *   { ok: true,  policy }      → policy is valid + usable.
 *   { ok: false, error }       → policy is malformed; guardian must fail
 *                                closed using DEFAULT_POLICY semantics.
 */
export type ParseResult =
  | { ok: true; policy: AgenticPolicy }
  | { ok: false; error: string };

export function parseAgenticPolicy(rawJson: string | null | undefined): ParseResult {
  // Null/empty → caller defaults to DEFAULT_POLICY (deny-all).
  if (rawJson === null || rawJson === undefined || rawJson === "") {
    return { ok: true, policy: DEFAULT_POLICY };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      error: `agenticPolicyJson is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const result = agenticPolicySchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `agenticPolicyJson failed schema validation: ${result.error.message}`,
    };
  }

  return { ok: true, policy: result.data };
}

// ============================================================================
// Policy queries
// ============================================================================

export type ScopeCheckInput = {
  policy: AgenticPolicy;
  scope: AgenticScope;
  agentId: string;
};

/**
 * Is this agent allowed to invoke this scope?
 *   - If agent is in blockedAgentIds → no.
 *   - If scope not in allowedScopes → no.
 *   - Else → yes.
 */
export function isScopeAllowed(input: ScopeCheckInput): {
  allowed: boolean;
  reason: string;
} {
  if (input.policy.blockedAgentIds.includes(input.agentId)) {
    return { allowed: false, reason: "agent_blocked" };
  }
  if (!input.policy.allowedScopes.includes(input.scope)) {
    return { allowed: false, reason: "scope_not_in_allowlist" };
  }
  return { allowed: true, reason: "ok" };
}

export type OrderValueCheckInput = {
  policy: AgenticPolicy;
  amountMinor: number;
};

/**
 * Is this order value within the shop's per-transaction cap?
 *   - If maxOrderValueMinor is null → no cap, always allowed.
 *   - Else amount must be ≤ cap.
 */
export function isOrderValueAllowed(input: OrderValueCheckInput): {
  allowed: boolean;
  reason: string;
} {
  if (input.policy.maxOrderValueMinor === null) {
    return { allowed: true, reason: "no_cap" };
  }
  if (input.amountMinor > input.policy.maxOrderValueMinor) {
    return {
      allowed: false,
      reason: `amount_${input.amountMinor}_exceeds_cap_${input.policy.maxOrderValueMinor}`,
    };
  }
  return { allowed: true, reason: "within_cap" };
}

export type RailCheckInput = {
  policy: AgenticPolicy;
  rail: string;
};

/** Is this payment rail allowed by policy? */
export function isRailAllowed(input: RailCheckInput): {
  allowed: boolean;
  reason: string;
} {
  if (input.policy.allowedRails.length === 0) {
    return { allowed: false, reason: "no_rails_configured" };
  }
  if (!input.policy.allowedRails.includes(input.rail)) {
    return { allowed: false, reason: "rail_not_in_allowlist" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * For a given order amount: does policy mandate escrow?
 *   - requireEscrow=false → never required.
 *   - requireEscrow=true, threshold=null → always required.
 *   - requireEscrow=true, threshold=N → required iff amount ≥ N.
 */
export function isEscrowRequired(
  policy: AgenticPolicy,
  amountMinor: number,
): boolean {
  if (!policy.requireEscrow) return false;
  if (policy.requireEscrowAboveMinor === null) return true;
  return amountMinor >= policy.requireEscrowAboveMinor;
}
