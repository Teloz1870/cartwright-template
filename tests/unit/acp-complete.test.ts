import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Hul C (scaffold) — completeAcpSession. Tester de ægte, testbare dele:
 * env-gate + status-validering + at flowet når frem til (men ikke forbi) det
 * uwired SPT-trin. retrieveSession + AcpError er mocket.
 */

const mocks = vi.hoisted(() => ({ retrieveSession: vi.fn() }));

vi.mock("@/lib/acp", () => {
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
  return { AcpError, retrieveSession: mocks.retrieveSession };
});

import { completeAcpSession } from "@/lib/acp/complete";

const VALID_INPUT = { shared_payment_token: "spt_test_123" };

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

beforeEach(() => {
  mocks.retrieveSession.mockReset();
  delete process.env.ACP_PAYMENT_COMPLETION;
});
afterEach(() => {
  delete process.env.ACP_PAYMENT_COMPLETION;
});

describe("completeAcpSession — env-gate", () => {
  it("kaster not_enabled når ACP_PAYMENT_COMPLETION ikke er sat (inert default)", async () => {
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_checkout_completion_not_enabled",
    );
    expect(mocks.retrieveSession).not.toHaveBeenCalled();
  });
});

describe("completeAcpSession — validering (flag on)", () => {
  beforeEach(() => {
    process.env.ACP_PAYMENT_COMPLETION = "1";
  });

  it("kaster not_found når sessionen ikke findes", async () => {
    mocks.retrieveSession.mockResolvedValue(null);
    expect(await codeOf(completeAcpSession("ghost", VALID_INPUT))).toBe(
      "acp_session_not_found",
    );
  });

  it("kaster not_ready når status ikke er ready_for_payment", async () => {
    mocks.retrieveSession.mockResolvedValue({
      status: "not_ready_for_payment",
      totalDkk: 1000,
      currency: "dkk",
    });
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_session_not_ready",
    );
  });

  it("når frem til det uwired SPT-trin når sessionen er ready_for_payment", async () => {
    mocks.retrieveSession.mockResolvedValue({
      status: "ready_for_payment",
      totalDkk: 1000,
      currency: "dkk",
    });
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "payment_not_wired",
    );
  });
});
