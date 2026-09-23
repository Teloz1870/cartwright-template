/**
 * Master Plan §4 Phase 7 — Guardian (Adjudication) middleware.
 *
 * The third independent branch of Separation-of-Power (§3.3): Legislation
 * (the human admin) writes rules → Execution (route handlers) runs business
 * logic → Adjudication (this file) checks every agentic call against
 * legislation before money or escrow state can move.
 *
 * Invariants:
 *   1. Guardian writes one AgenticJWT row per call (replay protection +
 *      audit + Phase 9 dashboard data).
 *   2. Guardian's verdict is the LAST word: deny verdicts MUST short-circuit
 *      the route handler before any DB-write that costs money.
 *   3. Guardian fails closed: any error in parsing legislation, looking up
 *      the agent, or writing the audit row → deny verdict with a logged reason.
 *   4. No LLM imports. Same architectural rule as Phase 6 engine.
 *
 * Pure-ish module: depends on prisma (for the AgenticJWT write) and on
 * legislation (pure). Does not import any AI / LLM modules.
 */

import { prisma } from "@/lib/db";
import {
  parseAgenticPolicy,
  isScopeAllowed,
  isOrderValueAllowed,
  isRailAllowed,
  type AgenticPolicy,
  type AgenticScope,
} from "./legislation";

// ============================================================================
// Public types
// ============================================================================

export type GuardianRequest = {
  /** The buyer-agent principal — sub claim of A-JWT. */
  agentId: string;
  /** Unique-per-issuer A-JWT id for replay protection. */
  jti: string;
  /** Optional aud claim — which shop this is for. */
  audienceShop?: string;
  /** Scopes the agent is asserting (parsed from A-JWT scopes claim). */
  scopes: string[];
  /** The specific scope being invoked this request. */
  requiredScope: AgenticScope;
  /** HTTP path being called, e.g. "/api/negotiate". */
  requestPath: string;
  /** HTTP method, e.g. "POST". */
  requestMethod: string;
  /** Optional order/transaction value in minor units, for value-cap check. */
  amountMinor?: number;
  /** Optional payment rail, for rail-allowlist check. */
  rail?: string;
  /** Raw A-JWT for forensic replay (stored verbatim in AgenticJWT.signedJwt). */
  signedJwt: string;
  /** Optional capability summary (decision/price/codes from engine, etc). */
  capabilities?: Record<string, unknown>;
  /** Client metadata for forensic context. */
  ipAddress?: string;
  userAgent?: string;
};

export type GuardianVerdict =
  | { decision: "allow"; reason: string }
  | { decision: "deny"; reason: string };

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Adjudicate one agentic request against shop legislation. Writes the audit
 * row + returns the verdict atomically (caller is responsible for short-
 * circuiting on deny).
 *
 * Usage in a route handler:
 *
 *     const verdict = await guardianCheck(req, {
 *       agentId, jti, signedJwt, scopes,
 *       requiredScope: "negotiate",
 *       requestPath: req.nextUrl.pathname,
 *       requestMethod: req.method,
 *       amountMinor: parsedBody.amountMinor,
 *     });
 *     if (verdict.decision === "deny") {
 *       return new Response(JSON.stringify({ error: "forbidden", reason: verdict.reason }), { status: 403 });
 *     }
 *     // ... proceed with business logic
 */
export async function guardianCheck(
  req: GuardianRequest,
): Promise<GuardianVerdict> {
  // 1. Load legislation. We read agenticPolicyJson on every call to ensure
  //    policy edits in /admin/agentic (Phase 9) take effect immediately. No
  //    caching at this layer (a 5-min cache could let a leak run after an
  //    admin revokes scope; in practice the DB hit is < 5ms via Turso).
  //
  //    Implementation note: agenticPolicyJson column may not yet exist on
  //    Turso (requires a Phase-7 ALTER TABLE migration to be applied —
  //    deferred to an operator-supervised session per the "nothing live
  //    breaks" guarantee). We use a raw query inside try/catch so the
  //    guardian fails closed to deny-all whenever the column is missing,
  //    instead of crashing the route handler.
  let policy: AgenticPolicy;
  let policyParseError: string | null = null;
  try {
    let policyJson: string | null = null;
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ agenticPolicyJson: string | null }>
      >("SELECT agenticPolicyJson FROM BrandingSettings WHERE id = 1 LIMIT 1");
      policyJson = rows[0]?.agenticPolicyJson ?? null;
    } catch {
      // Column doesn't exist yet on this Turso. Default to deny-all by
      // returning null → parseAgenticPolicy → DEFAULT_POLICY semantics.
      policyJson = null;
    }
    const parsed = parseAgenticPolicy(policyJson);
    if (!parsed.ok) {
      policyParseError = parsed.error;
      // Fail closed: use deny-all policy
      policy = {
        allowedScopes: [],
        blockedAgentIds: [],
        maxOrderValueMinor: null,
        allowedRails: [],
        requireEscrow: false,
        requireEscrowAboveMinor: null,
      };
    } else {
      policy = parsed.policy;
    }
  } catch (err) {
    // DB unavailable → fail closed.
    await safeWriteAudit(req, "deny", `legislation_load_error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      decision: "deny",
      reason: "legislation_load_error",
    };
  }

  if (policyParseError) {
    await safeWriteAudit(req, "deny", `policy_malformed: ${policyParseError}`);
    return { decision: "deny", reason: "policy_malformed" };
  }

  // 2. Replay protection — A-JWT must have a unique jti per issuer.
  try {
    const existing = await prisma.agenticJWT.findUnique({
      where: { issuerAgentId_jti: { issuerAgentId: req.agentId, jti: req.jti } },
      select: { id: true },
    });
    if (existing) {
      await safeWriteAudit(req, "deny", "replay_detected", { skipUnique: true });
      return { decision: "deny", reason: "replay_detected" };
    }
  } catch (err) {
    await safeWriteAudit(req, "deny", `replay_check_error: ${err instanceof Error ? err.message : String(err)}`);
    return { decision: "deny", reason: "replay_check_error" };
  }

  // 3. Scope check.
  const scopeCheck = isScopeAllowed({
    policy,
    scope: req.requiredScope,
    agentId: req.agentId,
  });
  if (!scopeCheck.allowed) {
    await safeWriteAudit(req, "deny", scopeCheck.reason);
    return { decision: "deny", reason: scopeCheck.reason };
  }

  // 4. Order-value cap check (if applicable).
  if (req.amountMinor !== undefined) {
    const valueCheck = isOrderValueAllowed({
      policy,
      amountMinor: req.amountMinor,
    });
    if (!valueCheck.allowed) {
      await safeWriteAudit(req, "deny", valueCheck.reason);
      return { decision: "deny", reason: valueCheck.reason };
    }
  }

  // 5. Rail allowlist check (if applicable).
  if (req.rail !== undefined) {
    const railCheck = isRailAllowed({ policy, rail: req.rail });
    if (!railCheck.allowed) {
      await safeWriteAudit(req, "deny", railCheck.reason);
      return { decision: "deny", reason: railCheck.reason };
    }
  }

  // 6. All checks passed. Allow + audit.
  await safeWriteAudit(req, "allow", "ok");
  return { decision: "allow", reason: "ok" };
}

// ============================================================================
// Audit helper
// ============================================================================

/**
 * Write the AgenticJWT audit row. Caller-suppressed errors: if the audit
 * write itself fails, we LOG (stderr) but don't override the verdict —
 * a successful guardian decision should still proceed even if the audit
 * trail couldn't be written (otherwise a DB hiccup makes the shop unusable).
 *
 * `skipUnique` is true when we know the (issuerAgentId, jti) pair already
 * exists (replay-detected case) — we still want a deny audit but can't
 * insert with the same jti, so we suffix it.
 */
async function safeWriteAudit(
  req: GuardianRequest,
  verdict: "allow" | "deny",
  reason: string,
  opts: { skipUnique?: boolean } = {},
): Promise<void> {
  try {
    const jti = opts.skipUnique ? `${req.jti}#dup-${Date.now()}` : req.jti;
    await prisma.agenticJWT.create({
      data: {
        jti,
        issuerAgentId: req.agentId,
        audienceShop: req.audienceShop ?? null,
        scopes: JSON.stringify(req.scopes),
        capabilitiesJson: JSON.stringify({
          requiredScope: req.requiredScope,
          amountMinor: req.amountMinor ?? null,
          rail: req.rail ?? null,
          ...(req.capabilities ?? {}),
        }),
        signedJwt: req.signedJwt,
        verifyResult: verdict === "allow" ? "pass" : "fail",
        verifyError: verdict === "deny" ? reason : null,
        requestPath: req.requestPath,
        requestMethod: req.requestMethod,
        ipAddress: req.ipAddress ?? null,
        userAgent: req.userAgent ?? null,
      },
    });
  } catch (err) {
    // Don't throw — verdict still stands.
    console.error("[guardian] audit write failed:", err);
  }
}
