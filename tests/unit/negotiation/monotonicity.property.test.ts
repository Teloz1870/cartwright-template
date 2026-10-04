import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  decideNegotiation,
  type NegotiationInput,
} from "@/lib/negotiation/anchor-resume";

/**
 * Master Plan §4 Phase 6 — property-based tests for the monotonicity and
 * floor-respect guarantees that define the Anchor-and-Resume engine's
 * correctness.
 *
 * Each property generates ~100 random inputs and asserts an invariant. If
 * any single input violates the invariant, fast-check shrinks to the
 * smallest counter-example and fails the test.
 */

const FIXED_NOW = new Date("2026-05-24T12:00:00.000Z");
const LATER = new Date("2026-05-25T12:00:00.000Z");

/** Generate a valid (floor, anchor, concessionRate) configuration. */
const configArb = fc
  .tuple(
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.float({ min: 0, max: 1, noNaN: true }),
  )
  .map(([a, b, c]) => ({
    floorMinor: Math.min(a, b),
    anchorMinor: Math.max(a, b),
    concessionRate: c,
  }));

describe("Anchor-and-Resume property: monotonicity", () => {
  it("next offer is never higher than the current offer (when there is one)", () => {
    fc.assert(
      fc.property(configArb, fc.integer({ min: 1, max: 1_000_000 }), (cfg, currentPrice) => {
        fc.pre(currentPrice >= cfg.floorMinor && currentPrice <= cfg.anchorMinor);

        const input: NegotiationInput = {
          ...cfg,
          currentOffer: {
            priceMinor: currentPrice,
            quantity: 1,
            validUntil: LATER,
          },
          // Generate a counter below floor to force a concession attempt.
          counterOffer: {
            priceMinor: Math.max(0, cfg.floorMinor - 1),
            quantity: 1,
            validUntil: LATER,
          },
          round: 1,
          maxRounds: 10,
          now: FIXED_NOW,
        };

        const result = decideNegotiation(input);
        if (result.nextOffer !== null && result.decision === "counter") {
          expect(result.nextOffer.priceMinor).toBeLessThanOrEqual(currentPrice);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("market signals suggesting higher price never cause an increase", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (cfg, currentPrice, competitorPrice) => {
          fc.pre(currentPrice >= cfg.floorMinor && currentPrice <= cfg.anchorMinor);

          const input: NegotiationInput = {
            ...cfg,
            currentOffer: {
              priceMinor: currentPrice,
              quantity: 1,
              validUntil: LATER,
            },
            counterOffer: null,
            marketSignals: { competitorPriceMinor: competitorPrice },
            round: 2,
            maxRounds: 10,
            now: FIXED_NOW,
          };

          const result = decideNegotiation(input);
          // No matter what market says, the next offer (if any) must be
          // ≤ current. Even when competitor is offering 10x more.
          if (result.nextOffer !== null) {
            expect(result.nextOffer.priceMinor).toBeLessThanOrEqual(currentPrice);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Anchor-and-Resume property: floor respect", () => {
  it("never emits an offer strictly below the floor", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
        (cfg, currentPrice, counterPrice) => {
          const input: NegotiationInput = {
            ...cfg,
            currentOffer:
              currentPrice === undefined
                ? null
                : { priceMinor: currentPrice, quantity: 1, validUntil: LATER },
            counterOffer:
              counterPrice === undefined
                ? null
                : { priceMinor: counterPrice, quantity: 1, validUntil: LATER },
            round: 1,
            maxRounds: 10,
            now: FIXED_NOW,
          };

          const result = decideNegotiation(input);
          // Only ACCEPT can hand back a counter-offer's price; everything
          // else (counter/hold) must respect the floor.
          if (result.decision === "counter" && result.nextOffer !== null) {
            expect(result.nextOffer.priceMinor).toBeGreaterThanOrEqual(cfg.floorMinor);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never accepts a counter strictly below the floor", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.integer({ min: 0, max: 10_000_000 }),
        (cfg, counterPrice) => {
          const input: NegotiationInput = {
            ...cfg,
            currentOffer: null,
            counterOffer: {
              priceMinor: counterPrice,
              quantity: 1,
              validUntil: LATER,
            },
            round: 1,
            maxRounds: 10,
            now: FIXED_NOW,
          };

          const result = decideNegotiation(input);
          if (result.decision === "accept" && result.nextOffer !== null) {
            expect(result.nextOffer.priceMinor).toBeGreaterThanOrEqual(cfg.floorMinor);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Anchor-and-Resume property: determinism", () => {
  it("identical input always produces identical output", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
        (cfg, currentPrice, counterPrice) => {
          const input: NegotiationInput = {
            ...cfg,
            currentOffer:
              currentPrice === undefined
                ? null
                : { priceMinor: currentPrice, quantity: 1, validUntil: LATER },
            counterOffer:
              counterPrice === undefined
                ? null
                : { priceMinor: counterPrice, quantity: 1, validUntil: LATER },
            round: 1,
            maxRounds: 10,
            now: FIXED_NOW,
          };

          const a = decideNegotiation(input);
          const b = decideNegotiation(input);
          expect(a.decision).toBe(b.decision);
          expect(a.nextOffer?.priceMinor).toBe(b.nextOffer?.priceMinor);
        },
      ),
      { numRuns: 200 },
    );
  });
});
