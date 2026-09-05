import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — POST /api/negotiate (the A2A Anchor-and-Resume route).
 *
 * Buyer agents POST their counter-offer here and the shop replies with the
 * deterministic negotiation engine's decision (Master Plan §4 Phase 8). The
 * sibling tests cover the ENGINE (`anchor-resume` monotonicity/anchor-resume
 * property tests) and the no-LLM-imports invariant — but NOTHING imported the
 * route handler, so the WIRING between the HTTP layer and the engine was
 * unpinned. A regression in the route (a dropped a2a gate, a mis-mapped
 * guardian arg, a skipped auth check, a bad engine-input conversion) would
 * ship green with every engine test still passing.
 *
 * This test locks the route's five-step pipeline and its short-circuits:
 *   1. 404  — `brand.features.a2a` off ⇒ indistinguishable from a missing
 *             endpoint; NOTHING downstream runs (moat: no A2A surface leaks
 *             unless a fork opts in ⇒ every default canary returns 404).
 *   2. 400/422 — body fails JSON parse / zod validation ⇒ auth + guardian +
 *             engine never run.
 *   3. 401  — bad/absent bearer token ⇒ guardian + engine never run.
 *   4. 403  — guardianCheck denies (scope/value-cap/rail/replay) ⇒ the engine
 *             never runs; the deny reason is surfaced.
 *   5. 200  — happy path: guardianCheck's args are threaded verbatim, the
 *             request is mapped into the engine's NegotiationInput (offer
 *             date-strings → Date), and the engine's decision is serialized
 *             back (nextOffer.validUntil → ISO string).
 *
 * The route reads the flag through the REAL `a2aDisabledResponse()` and drives
 * the REAL `parseJsonBody()` / `jsonError()` / `guardianDeniedResponse()`
 * (only `@/brand.config` is mocked for the gate) — so the assertions pin the
 * actual wiring. `authenticateApiKey`, `guardianCheck` and `decideNegotiation`
 * are mocked as SPIES so the assertions pin what the ROUTE threads into them,
 * independent of their real implementations (the #348–#350 route-handler
 * pattern applied to a POST body + engine call).
 */

const mocks = vi.hoisted(() => ({
  features: { a2a: true } as { a2a?: boolean },
  authenticateApiKey: vi.fn(),
  guardianCheck: vi.fn(),
  decideNegotiation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({ brand: { features: mocks.features } }));
vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mocks.authenticateApiKey,
}));
vi.mock("@/lib/guardian/middleware", () => ({
  guardianCheck: mocks.guardianCheck,
}));
vi.mock("@/lib/negotiation/anchor-resume", () => ({
  decideNegotiation: mocks.decideNegotiation,
}));

import { POST } from "@/app/api/negotiate/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const VALID_UNTIL = "2026-12-31T23:59:59.000Z";

/** A well-formed request body that passes the route's zod schema. */
function makeBody(over: Record<string, unknown> = {}) {
  return {
    agentId: "agent-42",
    jti: "jti-abc",
    signedJwt: "eyJ.sig.blob",
    scopes: ["negotiate", "read"],
    floorMinor: 8000,
    anchorMinor: 12000,
    concessionRate: 0.25,
    currentOffer: { priceMinor: 11000, quantity: 2, validUntil: VALID_UNTIL },
    counterOffer: { priceMinor: 9500, quantity: 2, validUntil: VALID_UNTIL },
    round: 1,
    maxRounds: 5,
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
  return new Request("http://localhost:3000/api/negotiate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

/** A representative engine decision (the shape decideNegotiation returns). */
function makeDecision(over: Record<string, unknown> = {}) {
  return {
    decision: "counter" as const,
    nextOffer: {
      priceMinor: 10250,
      quantity: 2,
      validUntil: new Date(VALID_UNTIL),
    },
    reasoningCodes: ["ANCHOR_HELD", "CONCESSION_APPLIED"],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features.a2a = true;
  // Default-happy primes; individual tests override as needed.
  mocks.authenticateApiKey.mockResolvedValue({ actor: { id: "key-1" } });
  mocks.guardianCheck.mockResolvedValue({ decision: "allow", reason: "ok" });
  mocks.decideNegotiation.mockReturnValue(makeDecision());
});

// ─── 1. A2A gate (404) ───────────────────────────────────────────────────

describe("POST /api/negotiate — a2a gate", () => {
  it("returns 404 and touches nothing downstream when a2a is off", async () => {
    mocks.features.a2a = false;
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    // Short-circuit: the gate is the FIRST line — no parse, auth, guardian, engine.
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });

  it("returns 404 when the a2a flag is absent (legacy brand layout)", async () => {
    delete mocks.features.a2a;
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(404);
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });
});

// ─── 2. Body validation (400 / 422) ──────────────────────────────────────

describe("POST /api/negotiate — body validation", () => {
  it("returns 400 on non-JSON body without running auth/guardian/engine", async () => {
    const res = await POST(makeRequest(undefined, { raw: "not json{" }));
    expect(res.status).toBe(400);
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });

  it("returns 422 when the schema rejects the body (missing agentId)", async () => {
    const bad = makeBody();
    delete (bad as Record<string, unknown>).agentId;
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(422);
    expect(mocks.authenticateApiKey).not.toHaveBeenCalled();
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });

  it("returns 422 when an offer field is the wrong type (priceMinor negative)", async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          counterOffer: { priceMinor: -5, quantity: 1, validUntil: VALID_UNTIL },
        }),
      ),
    );
    expect(res.status).toBe(422);
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });
});

// ─── 3. Auth (401) ───────────────────────────────────────────────────────

describe("POST /api/negotiate — authentication", () => {
  it("returns 401 when the bearer token is invalid; guardian + engine never run", async () => {
    mocks.authenticateApiKey.mockResolvedValue({
      error: { status: 401, body: { error: "Invalid API key" } },
    });
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(mocks.guardianCheck).not.toHaveBeenCalled();
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });

  it("runs auth AFTER the body is parsed (auth called once on a valid body)", async () => {
    await POST(makeRequest(makeBody()));
    expect(mocks.authenticateApiKey).toHaveBeenCalledTimes(1);
  });
});

// ─── 4. Guardian (403) ───────────────────────────────────────────────────

describe("POST /api/negotiate — guardian", () => {
  it("threads the request fields + client metadata verbatim into guardianCheck", async () => {
    await POST(
      makeRequest(makeBody(), {
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
      scopes: ["negotiate", "read"],
      requiredScope: "negotiate",
      requestPath: "/api/negotiate",
      requestMethod: "POST",
      amountMinor: 9500, // counterOffer.priceMinor
      signedJwt: "eyJ.sig.blob",
      ipAddress: "203.0.113.7",
      userAgent: "BuyerBot/1.0",
    });
  });

  it("passes amountMinor: undefined when there is no counter-offer", async () => {
    await POST(makeRequest(makeBody({ counterOffer: null })));
    const arg = mocks.guardianCheck.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.amountMinor).toBeUndefined();
  });

  it("passes ipAddress/userAgent: undefined when the headers are absent", async () => {
    await POST(makeRequest(makeBody()));
    const arg = mocks.guardianCheck.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.ipAddress).toBeUndefined();
    expect(arg.userAgent).toBeUndefined();
  });

  it("returns 403 with the deny reason and never runs the engine", async () => {
    mocks.guardianCheck.mockResolvedValue({
      decision: "deny",
      reason: "value_cap_exceeded",
    });
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(403);
    const body = await res.json();
    // guardianDeniedResponse surfaces the reason in the message + details.
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("Agentic call denied: value_cap_exceeded");
    expect(body.details).toEqual({ reason: "value_cap_exceeded" });
    expect(mocks.decideNegotiation).not.toHaveBeenCalled();
  });
});

// ─── 5. Engine input mapping + success serialization (200) ────────────────

describe("POST /api/negotiate — engine wiring + response", () => {
  it("maps the request into NegotiationInput with offers converted to Dates", async () => {
    await POST(makeRequest(makeBody()));
    expect(mocks.decideNegotiation).toHaveBeenCalledTimes(1);
    const input = mocks.decideNegotiation.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(input.floorMinor).toBe(8000);
    expect(input.anchorMinor).toBe(12000);
    expect(input.concessionRate).toBe(0.25);
    expect(input.round).toBe(1);
    expect(input.maxRounds).toBe(5);
    // Offers: validUntil strings become Date instances at the exact instant.
    const current = input.currentOffer as { validUntil: Date; priceMinor: number };
    const counter = input.counterOffer as { validUntil: Date; priceMinor: number };
    expect(current.validUntil).toBeInstanceOf(Date);
    expect(current.validUntil.toISOString()).toBe(VALID_UNTIL);
    expect(current.priceMinor).toBe(11000);
    expect(counter.validUntil).toBeInstanceOf(Date);
    expect(counter.priceMinor).toBe(9500);
    // `now` is stamped server-side.
    expect(input.now).toBeInstanceOf(Date);
  });

  it("maps a null offer through as null (not a Date-wrapped empty)", async () => {
    await POST(makeRequest(makeBody({ currentOffer: null })));
    const input = mocks.decideNegotiation.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(input.currentOffer).toBeNull();
  });

  it("serializes the engine decision back with nextOffer.validUntil as an ISO string", async () => {
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      decision: "counter",
      nextOffer: {
        priceMinor: 10250,
        quantity: 2,
        validUntil: VALID_UNTIL,
      },
      reasoningCodes: ["ANCHOR_HELD", "CONCESSION_APPLIED"],
    });
  });

  it("passes a null nextOffer straight through (e.g. a reject decision)", async () => {
    mocks.decideNegotiation.mockReturnValue(
      makeDecision({ decision: "reject", nextOffer: null, reasoningCodes: ["FLOOR_BREACHED"] }),
    );
    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("reject");
    expect(body.nextOffer).toBeNull();
    expect(body.reasoningCodes).toEqual(["FLOOR_BREACHED"]);
  });
});
