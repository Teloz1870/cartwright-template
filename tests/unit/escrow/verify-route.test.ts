import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — POST /api/escrow/verify (Master Plan §4 Phase 8).
 *
 * This is the escrow FUND-RELEASE route: a buyer agent submits a
 * Proof-of-Task-Execution (PoTE) and, if the verifier passes, the escrowed
 * funds are released (state → "released"). It is the last HTTP hop before
 * agentic money leaves escrow, yet nothing imported the handler — the sibling
 * tests cover the escrow STATE MACHINE (`tests/unit/escrow/state-machine.test.ts`)
 * and the guardian core (`tests/unit/guardian/middleware.test.ts`), but the
 * WIRING between the HTTP layer, the guardian, the DB and the state machine
 * was unpinned. A regression in the route (a dropped a2a gate, a mis-mapped
 * guardian arg, a skipped auth check, a persisted PoTEProof on a denied call,
 * or — worst — a release transition on an un-releasable escrow) would ship
 * green with every state-machine + guardian test still passing.
 *
 * The test locks the route's pipeline and its short-circuit ORDER:
 *   1. 404  — `brand.features.a2a` off ⇒ indistinguishable from a missing
 *             endpoint; NOTHING downstream runs (moat: no A2A surface leaks
 *             unless a fork opts in ⇒ every default canary returns 404).
 *   2. 400/422 — body fails JSON parse / zod validation ⇒ auth + DB + guardian
 *             never run.
 *   3. 401  — bad/absent bearer token ⇒ DB + guardian never run.
 *   4. 404  — escrow row not found ⇒ guardian never runs, nothing persisted.
 *   5. 403  — guardianCheck denies ⇒ NO PoTEProof persisted, NO release.
 *             The guardian is fed `amountMinor`/`rail` from the LOADED ESCROW
 *             ROW, not the request body — a caller cannot understate the amount
 *             to dodge the per-tx value cap (a security invariant).
 *   6. 500  — escrow.status is not a canonical EscrowState (corrupted row).
 *   7. 409  — escrow is not in a releasable state (only funded/disputed can be
 *             verified) ⇒ nothing persisted.
 *   8. 200  — verifier runs, a PoTEProof row is persisted regardless of
 *             pass/fail/pending, and the escrow is released IFF the verifier
 *             passed. In Phase 8 the release branch is UNREACHABLE through the
 *             public route (expectedHash is hard-coded null ⇒ hash proofs always
 *             fail; delivery/signature/webhook always "pending") — so no
 *             proofType yields "released" and `escrowTransaction.update` is never
 *             called. This test pins that documented Phase-8 behavior.
 *
 * The route reads the flag through the REAL `a2aDisabledResponse()` and drives
 * the REAL `parseJsonBody()`/`jsonError()`/`guardianDeniedResponse()` (only
 * `@/brand.config` is mocked for the gate) AND the REAL escrow state machine
 * (`assertTransition`/`isEscrowState` are pure) — so the assertions pin the
 * actual wiring. `authenticateApiKey`, `guardianCheck` and `@/lib/db` (prisma)
 * are mocked so the assertions pin what the ROUTE threads into / persists via
 * them, independent of their real implementations (the #348–#358 route-handler
 * pattern applied to a money-release POST).
 */

const mocks = vi.hoisted(() => ({
  features: { a2a: true } as { a2a?: boolean },
  authenticateApiKey: vi.fn(),
  guardianCheck: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({ brand: { features: mocks.features } }));
vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mocks.authenticateApiKey,
}));
vi.mock("@/lib/guardian/middleware", () => ({
  guardianCheck: mocks.guardianCheck,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    escrowTransaction: { findUnique: mocks.findUnique, update: mocks.update },
    poTEProof: { create: mocks.create },
  },
}));

import { POST } from "@/app/api/escrow/verify/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────

/** A funded escrow row the way prisma.escrowTransaction.findUnique returns it. */
function makeEscrow(over: Record<string, unknown> = {}) {
  return {
    id: "esc-1",
    status: "funded",
    amountMinor: 50000,
    paymentRail: "stripe",
    releasedAt: null,
    ...over,
  };
}

/** A well-formed request body that passes the route's zod schema. */
function makeBody(over: Record<string, unknown> = {}) {
  return {
    agentId: "agent-42",
    jti: "jti-abc",
    signedJwt: "eyJ.sig.blob",
    scopes: ["escrow.release", "read"],
    escrowTxId: "esc-1",
    proofType: "signature",
    proofPayload: { artifactSignature: "sig-blob" },
    ...over,
  };
}

/** Build a POST Request the way Next hands it to the handler. */
function makeRequest(
  body: unknown,
  {
    headers = {},
    raw,
  }: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new Request("http://localhost:3000/api/escrow/verify", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features.a2a = true;
  // Default-happy primes; individual tests override as needed.
  mocks.authenticateApiKey.mockResolvedValue({ actor: { id: "key-1" } });
  mocks.guardianCheck.mockResolvedValue({ decision: "allow", reason: "ok" });
  mocks.findUnique.mockResolvedValue(makeEscrow());
  mocks.create.mockResolvedValue({ id: "proof-1" });
  mocks.update.mockResolvedValue(makeEscrow({ status: "released" }));
});

// ─── 1. A2A gate (404) ───────────────────────────────────────────────────

describe("POST /api/escrow/verify — a2a gate", () => {
  it("returns 404 and touches nothing downstream when a2a is off", async () => {
    mocks.features.a2a = false;
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    // Short-circuit: the gate is the FIRST line — no parse, auth, DB, guardian.
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the a2a flag is absent (legacy brand layout)", async () => {
    delete mocks.features.a2a;
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(404);
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
  });
});

// ─── 2. Body validation (400 / 422) ──────────────────────────────────────

describe("POST /api/escrow/verify — body validation", () => {
  it("returns 400 on non-JSON body without running auth/DB/guardian", async () => {
    const res = await POST(makeRequest(undefined, { raw: "not json{" }));
    expect(res.status).toBe(400);
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
  });

  it("returns 422 when escrowTxId is missing (schema rejects)", async () => {
    const bad = makeBody();
    delete (bad as Record<string, unknown>).escrowTxId;
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(422);
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 422 when proofType is not one of the enum values", async () => {
    const res = await POST(makeRequest(makeBody({ proofType: "telepathy" })));
    expect(res.status).toBe(422);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

// ─── 3. Auth (401) ───────────────────────────────────────────────────────

describe("POST /api/escrow/verify — authentication", () => {
  it("returns 401 when the bearer token is invalid; DB + guardian never run", async () => {
    mocks.authenticateApiKey.mockResolvedValue({
      error: { status: 401, body: { error: "Invalid API key" } },
    });
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("runs auth AFTER the body is parsed (auth called once on a valid body)", async () => {
    await POST(makeRequest(makeBody()));
    expect(mocks.authenticateApiKey).toHaveBeenCalledTimes(1);
  });
});

// ─── 4. Escrow load (404) ────────────────────────────────────────────────

describe("POST /api/escrow/verify — escrow lookup", () => {
  it("returns 404 escrow_not_found when the row does not exist; guardian never runs", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("escrow_not_found");
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "esc-1" } });
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

// ─── 5. Guardian (403 + threading) ───────────────────────────────────────

describe("POST /api/escrow/verify — guardian", () => {
  it("threads escrow.release scope + the ROW's amount/rail + client metadata verbatim", async () => {
    mocks.findUnique.mockResolvedValue(
      makeEscrow({ id: "esc-9", amountMinor: 123456, paymentRail: "sepa" }),
    );
    await POST(
      makeRequest(makeBody({ escrowTxId: "esc-9", proofType: "webhook" }), {
        headers: {
          "x-forwarded-for": "203.0.113.7",
          "user-agent": "BuyerBot/1.0",
        },
      }),
    );
    expect(mocks.guardianCheck).toHaveBeenCalledTimes(1);
    expect(mocks.guardianCheck).toHaveBeenCalledWith({
      agentId: "agent-42",
      jti: "jti-abc",
      scopes: ["escrow.release", "read"],
      requiredScope: "escrow.release",
      requestPath: "/api/escrow/verify",
      requestMethod: "POST",
      amountMinor: 123456, // from the ROW, not the request body
      rail: "sepa", // from the ROW
      signedJwt: "eyJ.sig.blob",
      capabilities: { escrowTxId: "esc-9", proofType: "webhook" },
      ipAddress: "203.0.113.7",
      userAgent: "BuyerBot/1.0",
    });
  });

  it("passes ipAddress/userAgent: undefined when the headers are absent", async () => {
    await POST(makeRequest(makeBody()));
    const arg = mocks.guardianCheck.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.ipAddress).toBeUndefined();
    expect(arg.userAgent).toBeUndefined();
  });

  it("calls the guardian AFTER loading the escrow (amount comes from the DB)", async () => {
    await POST(makeRequest(makeBody()));
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.guardianCheck).toHaveBeenCalledTimes(1);
    const arg = mocks.guardianCheck.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.amountMinor).toBe(50000); // makeEscrow default
  });

  it("returns 403 with the deny reason and persists NOTHING / releases NOTHING", async () => {
    mocks.guardianCheck.mockResolvedValue({
      decision: "deny",
      reason: "value_cap_exceeded",
    });
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("Agentic call denied: value_cap_exceeded");
    expect(body.details).toEqual({ reason: "value_cap_exceeded" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

// ─── 6. Corrupted state (500) ────────────────────────────────────────────

describe("POST /api/escrow/verify — corrupted escrow state", () => {
  it("returns 500 corrupted_escrow when status is not a canonical EscrowState", async () => {
    mocks.findUnique.mockResolvedValue(makeEscrow({ status: "garbage" }));
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("corrupted_escrow");
    // Guardian already ran (it precedes the state gate) but nothing is persisted.
    expect(mocks.guardianCheck).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

// ─── 7. Not releasable (409) ─────────────────────────────────────────────

describe("POST /api/escrow/verify — non-releasable states", () => {
  it.each(["pending", "released", "refunded"])(
    "returns 409 escrow_not_releasable for a %s escrow; nothing persisted",
    async (status) => {
      mocks.findUnique.mockResolvedValue(makeEscrow({ status }));
      const res = await POST(makeRequest(makeBody()));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("escrow_not_releasable");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("allows a disputed escrow through to the verifier (200)", async () => {
    mocks.findUnique.mockResolvedValue(makeEscrow({ status: "disputed" }));
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

// ─── 8. Verifier + persistence (200) ─────────────────────────────────────

describe("POST /api/escrow/verify — verifier + PoTEProof persistence", () => {
  it("persists a PoTEProof and returns 200 for a valid signature proof (pending)", async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          proofType: "signature",
          proofPayload: { artifactSignature: "sig-blob" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        escrowTxId: "esc-1",
        proofType: "signature",
        proofPayloadJson: JSON.stringify({ artifactSignature: "sig-blob" }),
        submittedHash: null,
        verifierResult: "pending",
        verifierMessage:
          "Signature recorded; admin must approve manually in Phase 9 dashboard.",
        verifiedAt: null,
      },
    });
    const body = await res.json();
    expect(body).toEqual({
      escrowStatus: "funded", // unchanged — not a pass
      proofId: "proof-1",
      verifierResult: "pending",
      verifierMessage:
        "Signature recorded; admin must approve manually in Phase 9 dashboard.",
    });
    // Not a pass ⇒ no state release.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("records verifierResult=fail for a signature proof missing artifactSignature", async () => {
    const res = await POST(
      makeRequest(makeBody({ proofType: "signature", proofPayload: {} })),
    );
    expect(res.status).toBe(200);
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.verifierResult).toBe("fail");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("records verifierResult=pending for a valid delivery proof", async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          proofType: "delivery",
          proofPayload: { trackingNumber: "TN123", carrier: "gls" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.verifierResult).toBe("pending");
  });

  it("records verifierResult=fail for a delivery proof missing trackingNumber", async () => {
    const res = await POST(
      makeRequest(
        makeBody({ proofType: "delivery", proofPayload: { carrier: "gls" } }),
      ),
    );
    expect(res.status).toBe(200);
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.verifierResult).toBe("fail");
  });

  it("records verifierResult=pending for a valid webhook proof", async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          proofType: "webhook",
          proofPayload: { webhookEventId: "evt_123" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.verifierResult).toBe("pending");
  });

  it("threads submittedHash through onto the PoTEProof row", async () => {
    await POST(
      makeRequest(
        makeBody({
          proofType: "hash",
          proofPayload: { note: "x" },
          submittedHash: "abcdef",
        }),
      ),
    );
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.submittedHash).toBe("abcdef");
  });

  it("Phase-8 invariant: NO proofType yields a release — hash always fails (expectedHash hard-coded null)", async () => {
    // The route calls verifyProof(..., expectedHash=null, ...) so hash proofs
    // can never pass; delivery/signature/webhook are always 'pending'. The
    // release branch (escrowTransaction.update → 'released') is therefore
    // unreachable through the public route in Phase 8.
    for (const proofType of ["hash", "delivery", "signature", "webhook"]) {
      vi.clearAllMocks();
      mocks.authenticateApiKey.mockResolvedValue({ actor: { id: "key-1" } });
      mocks.guardianCheck.mockResolvedValue({ decision: "allow", reason: "ok" });
      mocks.findUnique.mockResolvedValue(makeEscrow());
      mocks.create.mockResolvedValue({ id: "proof-1" });
      const res = await POST(
        makeRequest(
          makeBody({
            proofType,
            proofPayload: {
              trackingNumber: "TN",
              carrier: "gls",
              artifactSignature: "s",
              webhookEventId: "e",
            },
            submittedHash: "deadbeef",
          }),
        ),
      );
      const body = await res.json();
      expect(body.escrowStatus).toBe("funded"); // never "released"
      expect(body.verifierResult).not.toBe("pass");
      expect(mocks.update).not.toHaveBeenCalled();
    }
  });

  it("reports verifierResult=fail for a hash proof (expectedHash is null in Phase 8)", async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          proofType: "hash",
          proofPayload: {},
          submittedHash: "deadbeef",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const arg = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.verifierResult).toBe("fail");
    expect(arg.data.verifierMessage).toBe(
      "Escrow has no expectedHash configured; hash proof unsupported on this row.",
    );
  });
});
