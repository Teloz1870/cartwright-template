import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the Guardian Adjudication core
 * (`lib/guardian/middleware.ts:guardianCheck`) — the LAST word before any
 * agentic call can move money or escrow state (Master Plan §4 Phase 7).
 *
 * #357's negotiate-route test MOCKED `guardianCheck` as a spy, so the REAL
 * adjudication logic — the fail-closed invariants, the deny short-circuit
 * ORDER, and the forensic audit row — was unpinned. A regression in the
 * ordering (e.g. checking scope before replay, or value after rail) or in a
 * fail-closed branch silently weakens the security boundary while every
 * downstream test stays green.
 *
 * Strategy: mock ONLY the `@/lib/db` seam (prisma) — the `./legislation`
 * helpers (`parseAgenticPolicy`, `isScopeAllowed`, `isOrderValueAllowed`,
 * `isRailAllowed`) run REAL, so every assertion pins the actual wiring, not a
 * copy of the policy logic. Test-only → byte-identical → smoke n/a.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    agenticJWT: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { guardianCheck, type GuardianRequest } from "@/lib/guardian/middleware";

/** A policy blob that grants `negotiate`, a 100000-minor cap, and the stripe rail. */
function policyRow(
  over: Record<string, unknown> = {},
): Array<{ agenticPolicyJson: string | null }> {
  return [
    {
      agenticPolicyJson: JSON.stringify({
        allowedScopes: ["negotiate"],
        allowedRails: ["stripe"],
        maxOrderValueMinor: 100000,
        ...over,
      }),
    },
  ];
}

/** A minimally-valid negotiate GuardianRequest. */
function makeReq(over: Partial<GuardianRequest> = {}): GuardianRequest {
  return {
    agentId: "agent-1",
    jti: "jti-1",
    scopes: ["negotiate"],
    requiredScope: "negotiate",
    requestPath: "/api/negotiate",
    requestMethod: "POST",
    signedJwt: "eyJhbGciOiJFUzI1NiJ9.payload.sig",
    ...over,
  };
}

/** The `data` object of the single audit-row write. */
function auditData(): Record<string, unknown> {
  expect(mocks.prisma.agenticJWT.create).toHaveBeenCalledTimes(1);
  return mocks.prisma.agenticJWT.create.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: policy present + no prior jti (the "clean allow" preconditions).
  mocks.prisma.$queryRawUnsafe.mockResolvedValue(policyRow());
  mocks.prisma.agenticJWT.findUnique.mockResolvedValue(null);
  mocks.prisma.agenticJWT.create.mockResolvedValue({ id: "audit-1" });
});

describe("guardianCheck — allow path", () => {
  it("allows a scoped call and writes a passing audit row", async () => {
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "allow", reason: "ok" });
    const data = auditData();
    expect(data.verifyResult).toBe("pass");
    expect(data.verifyError).toBeNull();
    expect(data.jti).toBe("jti-1");
    expect(data.issuerAgentId).toBe("agent-1");
    expect(data.requestPath).toBe("/api/negotiate");
    expect(data.requestMethod).toBe("POST");
  });

  it("serializes scopes + capabilities and defaults optional context to null", async () => {
    const verdict = await guardianCheck(
      makeReq({
        scopes: ["negotiate", "escrow.fund"],
        amountMinor: 5000,
        rail: "stripe",
        capabilities: { price: 4200, decision: "counter" },
        ipAddress: "203.0.113.7",
        userAgent: "buyer-agent/1.0",
      }),
    );
    expect(verdict.decision).toBe("allow");
    const data = auditData();
    expect(data.scopes).toBe(JSON.stringify(["negotiate", "escrow.fund"]));
    expect(JSON.parse(data.capabilitiesJson as string)).toEqual({
      requiredScope: "negotiate",
      amountMinor: 5000,
      rail: "stripe",
      price: 4200,
      decision: "counter",
    });
    expect(data.ipAddress).toBe("203.0.113.7");
    expect(data.userAgent).toBe("buyer-agent/1.0");
    expect(data.audienceShop).toBeNull();
  });

  it("records amountMinor/rail as null in the audit when not supplied", async () => {
    await guardianCheck(makeReq());
    expect(JSON.parse(auditData().capabilitiesJson as string)).toEqual({
      requiredScope: "negotiate",
      amountMinor: null,
      rail: null,
    });
  });
});

describe("guardianCheck — fail-closed policy load", () => {
  it("denies (policy_malformed) on non-JSON policy blob and never reaches replay", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue([
      { agenticPolicyJson: "{not valid json" },
    ]);
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "deny", reason: "policy_malformed" });
    // Short-circuit: replay lookup must NOT run once policy is malformed.
    expect(mocks.prisma.agenticJWT.findUnique).not.toHaveBeenCalled();
    expect(auditData().verifyError).toContain("policy_malformed");
  });

  it("denies (policy_malformed) on a schema-invalid policy", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue([
      { agenticPolicyJson: JSON.stringify({ allowedScopes: ["not-a-scope"] }) },
    ]);
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "deny", reason: "policy_malformed" });
  });

  it("fails closed to deny-all when the policy column is missing (query throws)", async () => {
    // The inner try/catch swallows the query error → policyJson null →
    // DEFAULT_POLICY (deny-all) → scope check denies.
    mocks.prisma.$queryRawUnsafe.mockRejectedValue(
      new Error("no such column: agenticPolicyJson"),
    );
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({
      decision: "deny",
      reason: "scope_not_in_allowlist",
    });
  });

  it("treats an empty policy blob as deny-all (default policy)", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue([{ agenticPolicyJson: "" }]);
    const verdict = await guardianCheck(makeReq());
    expect(verdict.reason).toBe("scope_not_in_allowlist");
  });
});

describe("guardianCheck — replay protection", () => {
  it("denies (replay_detected) when the (agentId, jti) already exists", async () => {
    mocks.prisma.agenticJWT.findUnique.mockResolvedValue({ id: "prior" });
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "deny", reason: "replay_detected" });
  });

  it("suffixes the jti with #dup- on the replay audit row (skipUnique)", async () => {
    mocks.prisma.agenticJWT.findUnique.mockResolvedValue({ id: "prior" });
    await guardianCheck(makeReq());
    const data = auditData();
    expect(data.jti).toMatch(/^jti-1#dup-\d+$/);
    expect(data.verifyResult).toBe("fail");
    expect(data.verifyError).toBe("replay_detected");
  });

  it("looks up the composite unique key (issuerAgentId, jti)", async () => {
    await guardianCheck(makeReq());
    expect(mocks.prisma.agenticJWT.findUnique).toHaveBeenCalledWith({
      where: { issuerAgentId_jti: { issuerAgentId: "agent-1", jti: "jti-1" } },
      select: { id: true },
    });
  });

  it("denies (replay_check_error) and fails closed when the replay lookup throws", async () => {
    mocks.prisma.agenticJWT.findUnique.mockRejectedValue(new Error("db down"));
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "deny", reason: "replay_check_error" });
    expect(auditData().verifyError).toContain("replay_check_error");
  });
});

describe("guardianCheck — scope / value / rail adjudication (real legislation)", () => {
  it("denies (scope_not_in_allowlist) for a scope the policy omits", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ allowedScopes: ["products.read"] }),
    );
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({
      decision: "deny",
      reason: "scope_not_in_allowlist",
    });
  });

  it("denies (agent_blocked) — blocklist wins over an allowed scope", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ blockedAgentIds: ["agent-1"] }),
    );
    const verdict = await guardianCheck(makeReq());
    expect(verdict.reason).toBe("agent_blocked");
  });

  it("denies when amountMinor exceeds the per-transaction cap", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ maxOrderValueMinor: 5000 }),
    );
    const verdict = await guardianCheck(makeReq({ amountMinor: 6000 }));
    expect(verdict).toEqual({
      decision: "deny",
      reason: "amount_6000_exceeds_cap_5000",
    });
  });

  it("allows at the cap boundary (<= is inclusive)", async () => {
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ maxOrderValueMinor: 5000 }),
    );
    const verdict = await guardianCheck(makeReq({ amountMinor: 5000 }));
    expect(verdict.decision).toBe("allow");
  });

  it("skips the value cap entirely when amountMinor is undefined", async () => {
    // Cap present, but absent amount ⇒ the value branch is skipped ⇒ allow.
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ maxOrderValueMinor: 1 }),
    );
    const verdict = await guardianCheck(makeReq());
    expect(verdict.decision).toBe("allow");
  });

  it("denies (rail_not_in_allowlist) for a disallowed rail", async () => {
    const verdict = await guardianCheck(makeReq({ rail: "paypal" }));
    expect(verdict).toEqual({
      decision: "deny",
      reason: "rail_not_in_allowlist",
    });
  });

  it("skips the rail check entirely when rail is undefined", async () => {
    // No rails configured would deny IF a rail were supplied; absent ⇒ skip ⇒ allow.
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ allowedRails: [] }),
    );
    const verdict = await guardianCheck(makeReq());
    expect(verdict.decision).toBe("allow");
  });
});

describe("guardianCheck — deny short-circuit ORDER", () => {
  it("value cap is adjudicated before the rail allowlist", async () => {
    // Both would fail: amount over cap AND rail disallowed. Value must win.
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ maxOrderValueMinor: 5000, allowedRails: [] }),
    );
    const verdict = await guardianCheck(
      makeReq({ amountMinor: 9999, rail: "paypal" }),
    );
    expect(verdict.reason).toBe("amount_9999_exceeds_cap_5000");
  });

  it("scope is adjudicated before the value cap", async () => {
    // Scope disallowed AND amount over cap. Scope must win.
    mocks.prisma.$queryRawUnsafe.mockResolvedValue(
      policyRow({ allowedScopes: [], maxOrderValueMinor: 5000 }),
    );
    const verdict = await guardianCheck(makeReq({ amountMinor: 9999 }));
    expect(verdict.reason).toBe("scope_not_in_allowlist");
  });
});

describe("guardianCheck — audit is fail-soft (never overrides the verdict)", () => {
  it("still allows when the audit write throws", async () => {
    mocks.prisma.agenticJWT.create.mockRejectedValue(new Error("audit down"));
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "allow", reason: "ok" });
  });

  it("still denies (replay) when the audit write throws", async () => {
    mocks.prisma.agenticJWT.findUnique.mockResolvedValue({ id: "prior" });
    mocks.prisma.agenticJWT.create.mockRejectedValue(new Error("audit down"));
    const verdict = await guardianCheck(makeReq());
    expect(verdict).toEqual({ decision: "deny", reason: "replay_detected" });
  });
});
