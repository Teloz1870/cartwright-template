import { describe, it, expect } from "vitest";
import {
  parseAgenticPolicy,
  isScopeAllowed,
  isOrderValueAllowed,
  isRailAllowed,
  isEscrowRequired,
  DEFAULT_POLICY,
  type AgenticPolicy,
} from "@/lib/guardian/legislation";

/**
 * Master Plan §4 Phase 7 — tests for the legislation parser.
 *
 * Covers schema validation (happy + malformed) and the four policy-query
 * helpers (scope, order-value, rail, escrow-required).
 */

describe("parseAgenticPolicy — happy path", () => {
  it("parses a fully-specified policy", () => {
    const blob = JSON.stringify({
      allowedScopes: ["negotiate", "escrow.fund"],
      blockedAgentIds: ["evil-bot-1"],
      maxOrderValueMinor: 100000,
      allowedRails: ["stripe"],
      requireEscrow: true,
      requireEscrowAboveMinor: 50000,
    });
    const result = parseAgenticPolicy(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.allowedScopes).toEqual(["negotiate", "escrow.fund"]);
    expect(result.policy.maxOrderValueMinor).toBe(100000);
    expect(result.policy.requireEscrow).toBe(true);
  });

  it("fills in defaults for missing fields", () => {
    const blob = JSON.stringify({ allowedScopes: ["negotiate"] });
    const result = parseAgenticPolicy(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.blockedAgentIds).toEqual([]);
    expect(result.policy.maxOrderValueMinor).toBe(null);
    expect(result.policy.requireEscrow).toBe(false);
  });

  it("returns DEFAULT_POLICY for null/undefined/empty", () => {
    const a = parseAgenticPolicy(null);
    const b = parseAgenticPolicy(undefined);
    const c = parseAgenticPolicy("");
    expect(a.ok && a.policy).toEqual(DEFAULT_POLICY);
    expect(b.ok && b.policy).toEqual(DEFAULT_POLICY);
    expect(c.ok && c.policy).toEqual(DEFAULT_POLICY);
  });
});

describe("parseAgenticPolicy — error paths", () => {
  it("fails on non-JSON input", () => {
    const result = parseAgenticPolicy("{not-json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not valid JSON");
  });

  it("fails on unknown scope", () => {
    const blob = JSON.stringify({ allowedScopes: ["bogus-scope"] });
    const result = parseAgenticPolicy(blob);
    expect(result.ok).toBe(false);
  });

  it("fails on negative maxOrderValueMinor", () => {
    const blob = JSON.stringify({ maxOrderValueMinor: -100 });
    const result = parseAgenticPolicy(blob);
    expect(result.ok).toBe(false);
  });

  it("fails on non-array allowedScopes", () => {
    const blob = JSON.stringify({ allowedScopes: "negotiate" });
    const result = parseAgenticPolicy(blob);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// Policy queries
// ============================================================================

function makePolicy(overrides: Partial<AgenticPolicy> = {}): AgenticPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

describe("isScopeAllowed", () => {
  it("denies when scope is not in allowlist", () => {
    const result = isScopeAllowed({
      policy: makePolicy({ allowedScopes: [] }),
      scope: "negotiate",
      agentId: "agent-1",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("scope_not_in_allowlist");
  });

  it("allows when scope IS in allowlist", () => {
    const result = isScopeAllowed({
      policy: makePolicy({ allowedScopes: ["negotiate"] }),
      scope: "negotiate",
      agentId: "agent-1",
    });
    expect(result.allowed).toBe(true);
  });

  it("denies a blocked agent even when scope is allowed", () => {
    const result = isScopeAllowed({
      policy: makePolicy({
        allowedScopes: ["negotiate"],
        blockedAgentIds: ["agent-1"],
      }),
      scope: "negotiate",
      agentId: "agent-1",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("agent_blocked");
  });
});

describe("isOrderValueAllowed", () => {
  it("allows when no cap is set", () => {
    const result = isOrderValueAllowed({
      policy: makePolicy({ maxOrderValueMinor: null }),
      amountMinor: 999999,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows when amount is within cap", () => {
    const result = isOrderValueAllowed({
      policy: makePolicy({ maxOrderValueMinor: 100000 }),
      amountMinor: 50000,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows when amount exactly equals cap", () => {
    const result = isOrderValueAllowed({
      policy: makePolicy({ maxOrderValueMinor: 100000 }),
      amountMinor: 100000,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when amount exceeds cap", () => {
    const result = isOrderValueAllowed({
      policy: makePolicy({ maxOrderValueMinor: 100000 }),
      amountMinor: 100001,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds_cap");
  });
});

describe("isRailAllowed", () => {
  it("denies when no rails are configured", () => {
    const result = isRailAllowed({
      policy: makePolicy({ allowedRails: [] }),
      rail: "stripe",
    });
    expect(result.allowed).toBe(false);
  });

  it("allows whitelisted rails", () => {
    const result = isRailAllowed({
      policy: makePolicy({ allowedRails: ["stripe", "manual"] }),
      rail: "stripe",
    });
    expect(result.allowed).toBe(true);
  });

  it("denies non-whitelisted rails", () => {
    const result = isRailAllowed({
      policy: makePolicy({ allowedRails: ["stripe"] }),
      rail: "crypto",
    });
    expect(result.allowed).toBe(false);
  });
});

describe("isEscrowRequired", () => {
  it("returns false when requireEscrow is false", () => {
    expect(
      isEscrowRequired(makePolicy({ requireEscrow: false }), 1_000_000),
    ).toBe(false);
  });

  it("returns true when requireEscrow=true and threshold is null", () => {
    expect(
      isEscrowRequired(
        makePolicy({ requireEscrow: true, requireEscrowAboveMinor: null }),
        100,
      ),
    ).toBe(true);
  });

  it("returns true when amount >= threshold", () => {
    expect(
      isEscrowRequired(
        makePolicy({ requireEscrow: true, requireEscrowAboveMinor: 50000 }),
        50000,
      ),
    ).toBe(true);
    expect(
      isEscrowRequired(
        makePolicy({ requireEscrow: true, requireEscrowAboveMinor: 50000 }),
        50001,
      ),
    ).toBe(true);
  });

  it("returns false when amount < threshold", () => {
    expect(
      isEscrowRequired(
        makePolicy({ requireEscrow: true, requireEscrowAboveMinor: 50000 }),
        49999,
      ),
    ).toBe(false);
  });
});
