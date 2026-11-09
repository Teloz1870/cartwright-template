import { describe, it, expect } from "vitest";
import {
  decideNegotiation,
  type NegotiationInput,
  type Offer,
} from "@/lib/negotiation/anchor-resume";

/**
 * Master Plan §4 Phase 6 — table-driven happy-path tests for the
 * Anchor-and-Resume engine.
 *
 * Each test asserts ONE specific branch in the decision tree. Property-based
 * tests (monotonicity, floor-respect) live in monotonicity.property.test.ts;
 * import-guard tests live in no-llm-imports.test.ts.
 */

const FIXED_NOW = new Date("2026-05-24T12:00:00.000Z");
const LATER = new Date("2026-05-25T12:00:00.000Z");
const EARLIER = new Date("2026-05-23T12:00:00.000Z");

function makeInput(overrides: Partial<NegotiationInput> = {}): NegotiationInput {
  return {
    floorMinor: 50000, // 500 kr
    anchorMinor: 100000, // 1000 kr
    concessionRate: 0.5,
    currentOffer: null,
    counterOffer: null,
    round: 1,
    maxRounds: 10,
    now: FIXED_NOW,
    ...overrides,
  };
}

function makeOffer(priceMinor: number, opts: Partial<Offer> = {}): Offer {
  return {
    priceMinor,
    quantity: 1,
    validUntil: LATER,
    ...opts,
  };
}

describe("decideNegotiation — first round", () => {
  it("opens with anchor when no offers exist", () => {
    const result = decideNegotiation(makeInput());
    expect(result.decision).toBe("counter");
    expect(result.nextOffer?.priceMinor).toBe(100000);
    expect(result.reasoningCodes).toContain("FIRST_ROUND_ANCHOR");
  });

  it("opening offer has 24h validity from now", () => {
    const result = decideNegotiation(makeInput());
    const expected = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(result.nextOffer?.validUntil.getTime()).toBe(expected.getTime());
  });
});

describe("decideNegotiation — accept", () => {
  it("accepts counter at exactly the floor", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(50000),
      }),
    );
    expect(result.decision).toBe("accept");
    expect(result.nextOffer?.priceMinor).toBe(50000);
    expect(result.reasoningCodes).toContain("COUNTER_AT_OR_ABOVE_FLOOR");
  });

  it("accepts counter above the floor", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(75000),
      }),
    );
    expect(result.decision).toBe("accept");
    expect(result.nextOffer?.priceMinor).toBe(75000);
  });

  it("accepts counter equal to anchor (buyer accepted our opening)", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(100000),
      }),
    );
    expect(result.decision).toBe("accept");
  });
});

describe("decideNegotiation — concession", () => {
  it("counters with 50% concession of the gap when counter is below floor", () => {
    // Current 1000, floor 500, concessionRate 0.5 → concede 250 → next 750
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(30000),
      }),
    );
    expect(result.decision).toBe("counter");
    expect(result.nextOffer?.priceMinor).toBe(75000);
    expect(result.reasoningCodes).toContain("CONCESSION_APPLIED");
    expect(result.reasoningCodes).toContain("COUNTER_BELOW_FLOOR");
  });

  it("never concedes below the floor even with high concession rate", () => {
    const result = decideNegotiation(
      makeInput({
        floorMinor: 80000,
        anchorMinor: 100000,
        concessionRate: 1.0,
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(20000),
      }),
    );
    expect(result.decision).toBe("counter");
    expect(result.nextOffer?.priceMinor).toBe(80000);
    expect(result.nextOffer?.priceMinor).toBeGreaterThanOrEqual(80000);
  });

  it("rejects when current offer is already at floor", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(50000),
        counterOffer: makeOffer(40000),
      }),
    );
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("AT_FLOOR");
  });

  it("rejects with concessionRate=0 (no concession possible)", () => {
    const result = decideNegotiation(
      makeInput({
        concessionRate: 0,
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(30000),
      }),
    );
    expect(result.decision).toBe("reject");
  });
});

describe("decideNegotiation — hold (no fresh counter)", () => {
  it("holds at current offer when counterparty is silent", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(80000),
        counterOffer: null,
      }),
    );
    expect(result.decision).toBe("hold");
    expect(result.nextOffer?.priceMinor).toBe(80000);
    expect(result.reasoningCodes).toContain("MONOTONICITY_HOLD");
  });

  it("holds even when market signals suggest a higher price (§3.2 monotonicity)", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(80000),
        counterOffer: null,
        marketSignals: { competitorPriceMinor: 90000 },
      }),
    );
    expect(result.decision).toBe("hold");
    expect(result.nextOffer?.priceMinor).toBe(80000); // unchanged, NOT 90000
    expect(result.reasoningCodes).toContain("MONOTONICITY_HOLD");
  });
});

describe("decideNegotiation — expiry", () => {
  it("treats expired counter as missing + applies concession if possible", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(100000),
        counterOffer: makeOffer(30000, { validUntil: EARLIER }),
      }),
    );
    expect(result.reasoningCodes).toContain("COUNTER_EXPIRED");
    expect(result.decision).toBe("counter");
    expect(result.nextOffer?.priceMinor).toBe(75000);
  });

  it("rejects when expired counter + already at floor", () => {
    const result = decideNegotiation(
      makeInput({
        currentOffer: makeOffer(50000),
        counterOffer: makeOffer(30000, { validUntil: EARLIER }),
      }),
    );
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("COUNTER_EXPIRED");
    expect(result.reasoningCodes).toContain("AT_FLOOR");
  });
});

describe("decideNegotiation — guard rails", () => {
  it("rejects with INVALID_INPUT when floor > anchor", () => {
    const result = decideNegotiation(
      makeInput({ floorMinor: 200000, anchorMinor: 100000 }),
    );
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("INVALID_INPUT");
  });

  it("rejects with INVALID_INPUT when concessionRate > 1", () => {
    const result = decideNegotiation(makeInput({ concessionRate: 1.5 }));
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("INVALID_INPUT");
  });

  it("rejects with INVALID_INPUT when concessionRate < 0", () => {
    const result = decideNegotiation(makeInput({ concessionRate: -0.1 }));
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("INVALID_INPUT");
  });

  it("rejects with INVALID_INPUT when floorMinor is NaN", () => {
    const result = decideNegotiation(makeInput({ floorMinor: NaN }));
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("INVALID_INPUT");
  });

  it("force-rejects after maxRounds", () => {
    const result = decideNegotiation(
      makeInput({ round: 11, maxRounds: 10 }),
    );
    expect(result.decision).toBe("reject");
    expect(result.reasoningCodes).toContain("MAX_ROUNDS_REACHED");
  });
});

describe("decideNegotiation — determinism", () => {
  it("returns identical output for identical input across two calls", () => {
    const input = makeInput({
      currentOffer: makeOffer(95000),
      counterOffer: makeOffer(40000),
    });
    const a = decideNegotiation(input);
    const b = decideNegotiation(input);
    expect(a).toEqual(b);
  });

  it("nextOffer is frozen (cannot be mutated by caller)", () => {
    const result = decideNegotiation(makeInput());
    expect(Object.isFrozen(result.nextOffer)).toBe(true);
  });
});
