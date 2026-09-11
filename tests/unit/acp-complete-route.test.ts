import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — POST /api/acp/v1/checkout_sessions/[id]/complete
 * (ACP delegated-payment completion, "Hul C").
 *
 * Buyer agents POST a Shared Payment Token here to finalise an ACP checkout
 * session. The sibling `acp-complete.test.ts` covers the ORCHESTRATION
 * (`completeAcpSession`: idempotency replay, Stripe SPT charge args,
 * refund-on-failure, the happy path) with Stripe/DB mocked — but NOTHING
 * imported the route handler, so the WIRING between the HTTP layer and the
 * completion builder was unpinned. A regression in the route (a dropped acp
 * gate, a skipped env-flag short-circuit, a bad body-parse order, a mis-mapped
 * exception) would ship green with every `completeAcpSession` test still
 * passing.
 *
 * This test locks the route's pipeline and its short-circuit ORDER:
 *   1. 404  — `brand.acp.enabled` off ⇒ indistinguishable from a missing
 *             endpoint; NOTHING downstream runs (moat: no ACP surface leaks
 *             unless a fork opts in ⇒ every default/website-mode canary 404s).
 *   2. 501  — `isAcpCompletionEnabled()` false (env `ACP_PAYMENT_COMPLETION`
 *             unset) ⇒ inert "not enabled" reply, checked BEFORE the body is
 *             parsed (so a malformed body on a disabled store still 501s, never
 *             400) and the builder never runs.
 *   3. 400/422 — body fails JSON parse / zod validation ⇒ the builder never runs.
 *   4. 200  — happy path: the awaited route param `id` and the parsed body are
 *             threaded verbatim into `completeAcpSession`, whose result is
 *             serialized straight back.
 *   5. exceptions — an `AcpError` maps to its own status/code/message; any other
 *             throw becomes a generic 500 `internal_error` (no leak).
 *
 * The route drives the REAL `acpDisabledResponse()` / `jsonError()` /
 * `parseJsonBody()` / `acpExceptionResponse()` from `@/lib/acp/http` (only
 * `@/brand.config` is mocked, for the gate, and `@/lib/acp` for a real
 * `AcpError` class so `instanceof` holds). `completeAcpSession` and
 * `isAcpCompletionEnabled` are mocked as SPIES so the assertions pin what the
 * ROUTE threads into / branches on, independent of the builder's real
 * implementation (the #348–#357 route-handler pattern applied to a body +
 * env-gated builder call).
 */

// A real AcpError class shared by the mocked @/lib/acp (used by the REAL
// acpExceptionResponse) and by the tests that throw it — so `instanceof`
// resolves the same constructor in both places. Mirrors lib/acp's AcpError.
// Defined inside vi.hoisted so it is initialised before the hoisted vi.mock
// factory that references it (a top-level `class` would be in the TDZ).
const mocks = vi.hoisted(() => {
  class AcpError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
      this.name = "AcpError";
    }
  }
  return {
    AcpError,
    acp: { enabled: true } as { enabled?: boolean },
    completionEnabled: true,
    completeAcpSession: vi.fn(),
    isAcpCompletionEnabled: vi.fn(),
  };
});

const { AcpError } = mocks;

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({ brand: { acp: mocks.acp } }));
vi.mock("@/lib/acp", () => ({ AcpError: mocks.AcpError }));
vi.mock("@/lib/acp/complete", async () => {
  // The route imports the schema from here; the real one is a tiny, stable
  // zod object (mirrored verbatim) — running it REAL keeps the 400/422 branch
  // genuine while the builder + env-gate stay controllable spies.
  const { z } = await import("zod");
  return {
    completeSessionInputSchema: z.object({
      shared_payment_token: z.string().trim().min(1),
      idempotency_key: z.string().trim().min(1).optional(),
    }),
    completeAcpSession: mocks.completeAcpSession,
    isAcpCompletionEnabled: mocks.isAcpCompletionEnabled,
  };
});

import { POST } from "@/app/api/acp/v1/checkout_sessions/[id]/complete/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const SESSION_ID = "cs_acp_test_123";

/** A well-formed request body that passes the route's zod schema. */
function makeBody(over: Record<string, unknown> = {}) {
  return {
    shared_payment_token: "spt_abc123",
    idempotency_key: "idem-key-1",
    ...over,
  };
}

/** Build the POST Request + the Next route-context (params is a Promise). */
function invoke(
  body: unknown,
  { id = SESSION_ID, raw }: { id?: string; raw?: string } = {},
) {
  const request = new Request(
    `http://localhost:3000/api/acp/v1/checkout_sessions/${id}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw !== undefined ? raw : JSON.stringify(body),
    },
  );
  return POST(request, { params: Promise.resolve({ id }) });
}

/** A representative completion result (the shape completeAcpSession returns). */
function makeResult(over: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    status: "completed",
    payment_intent_id: "pi_test_1",
    order_id: "ord_42",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acp.enabled = true;
  mocks.completionEnabled = true;
  mocks.isAcpCompletionEnabled.mockImplementation(() => mocks.completionEnabled);
  mocks.completeAcpSession.mockResolvedValue(makeResult());
});

// ─── 1. ACP gate (404) ─────────────────────────────────────────────────────

describe("POST /acp complete — acp gate", () => {
  it("returns 404 and touches nothing downstream when acp is disabled", async () => {
    mocks.acp.enabled = false;
    const res = await invoke(makeBody());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    // The gate is the FIRST line — no env-check, no parse, no builder.
    expect(mocks.isAcpCompletionEnabled).not.toHaveBeenCalled();
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the acp flag is absent (legacy brand layout)", async () => {
    delete mocks.acp.enabled;
    const res = await invoke(makeBody());
    expect(res.status).toBe(404);
    // Same short-circuit as the explicit-false case: the env-gate + builder
    // are never reached when the acp gate closes.
    expect(mocks.isAcpCompletionEnabled).not.toHaveBeenCalled();
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });
});

// ─── 2. Completion env-gate (501) — checked BEFORE body parse ───────────────

describe("POST /acp complete — completion env-gate", () => {
  it("returns 501 acp_checkout_completion_not_enabled when the env flag is off", async () => {
    mocks.completionEnabled = false;
    const res = await invoke(makeBody());
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("acp_checkout_completion_not_enabled");
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });

  it("short-circuits to 501 BEFORE parsing the body (malformed body still 501, not 400)", async () => {
    mocks.completionEnabled = false;
    const res = await invoke(undefined, { raw: "not json{" });
    expect(res.status).toBe(501);
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });

  it("runs the env-gate only AFTER the acp gate has passed", async () => {
    await invoke(makeBody());
    expect(mocks.isAcpCompletionEnabled).toHaveBeenCalledTimes(1);
  });
});

// ─── 3. Body validation (400 / 422) ─────────────────────────────────────────

describe("POST /acp complete — body validation", () => {
  it("returns 400 invalid_json on a non-JSON body without running the builder", async () => {
    const res = await invoke(undefined, { raw: "not json{" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });

  it("returns 422 validation_error when shared_payment_token is missing", async () => {
    const bad = makeBody();
    delete (bad as Record<string, unknown>).shared_payment_token;
    const res = await invoke(bad);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });

  it("returns 422 when shared_payment_token is blank (trim().min(1))", async () => {
    const res = await invoke(makeBody({ shared_payment_token: "   " }));
    expect(res.status).toBe(422);
    expect(mocks.completeAcpSession).not.toHaveBeenCalled();
  });
});

// ─── 4. Success wiring + serialization (200) ────────────────────────────────

describe("POST /acp complete — success wiring", () => {
  it("threads the awaited route id + parsed body into completeAcpSession and serializes the result", async () => {
    const res = await invoke(makeBody(), { id: "cs_specific_9" });
    expect(res.status).toBe(200);
    expect(mocks.completeAcpSession).toHaveBeenCalledTimes(1);
    expect(mocks.completeAcpSession).toHaveBeenCalledWith("cs_specific_9", {
      shared_payment_token: "spt_abc123",
      idempotency_key: "idem-key-1",
    });
    await expect(res.json()).resolves.toEqual(makeResult());
  });

  it("passes a body without the optional idempotency_key through (no undefined injected)", async () => {
    const body = makeBody();
    delete (body as Record<string, unknown>).idempotency_key;
    await invoke(body);
    expect(mocks.completeAcpSession).toHaveBeenCalledWith(SESSION_ID, {
      shared_payment_token: "spt_abc123",
    });
  });

  it("returns whatever result shape the builder produces (route does not reshape it)", async () => {
    mocks.completeAcpSession.mockResolvedValue(
      makeResult({ status: "already_completed", replayed: true }),
    );
    const res = await invoke(makeBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("already_completed");
    expect(body.replayed).toBe(true);
  });
});

// ─── 5. Exception mapping ───────────────────────────────────────────────────

describe("POST /acp complete — exception mapping", () => {
  it("maps an AcpError to its own status/code/message", async () => {
    mocks.completeAcpSession.mockRejectedValue(
      new AcpError("acp_payment_failed", "Delegated payment did not succeed.", 402),
    );
    const res = await invoke(makeBody());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("acp_payment_failed");
    expect(body.message).toBe("Delegated payment did not succeed.");
  });

  it("maps a non-AcpError throw to a generic 500 internal_error (no leak of the raw message)", async () => {
    mocks.completeAcpSession.mockRejectedValue(new Error("stripe secret sk_live_xyz blew up"));
    const res = await invoke(makeBody());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("Internal ACP checkout error.");
    expect(JSON.stringify(body)).not.toContain("sk_live_xyz");
  });
});
