/**
 * Master Plan §4 Phase 6 — Anchor-and-Resume negotiation engine.
 *
 * Deterministic negotiation kernel. Takes a structured input (floor, anchor,
 * concession rate, current/counter offers) and returns a structured decision
 * with reasoning codes.
 *
 * Architecture invariants (§3.2 hard rules):
 *
 *   1. NO LLM imports. This file MUST NOT import any of:
 *      @ai-sdk/*, anthropic, openai, gemini, chatModel, generateText,
 *      lib/ai/*, or any other file that transitively brings in a model call.
 *      Enforced by tests/unit/negotiation/no-llm-imports.test.ts which scans
 *      this file's source text. Adding such an import = test failure.
 *
 *   2. Monotonicity guarantee. Once an offer has been put on the table, the
 *      next offer the engine emits to the same counterparty MUST be equal to
 *      or better-for-the-counterparty (i.e. ≤ current price for shop-side
 *      offers). Background market shifts MUST NOT retract or worsen a live
 *      offer. Enforced by tests/unit/negotiation/monotonicity.property.test.ts.
 *
 *   3. Floor respect. The engine never offers a price strictly below the
 *      floor (the shop's minimum acceptable price). Floor is configured by
 *      the human admin via BrandingSettings.agenticPolicyJson (Phase 7
 *      legislation branch).
 *
 *   4. Anchor respect. The engine never offers a price strictly above the
 *      anchor (the shop's list price). The anchor is the opening offer.
 *
 *   5. No price computation by LLM. This file produces a number; an
 *      external LLM translation layer (§3.2) may render that number as
 *      natural language for buyer-facing comms. The LLM never chooses the
 *      number.
 *
 *   6. Deterministic. Given identical input, the engine returns identical
 *      output. No clocks, no randomness, no external state. Inputs that
 *      include time (e.g. counter offer validUntil) must be passed in
 *      explicitly via the `now` parameter.
 *
 * Pure module — only imports a sibling pure module (reasoning-codes.ts).
 */

import type { ReasoningCode } from "./reasoning-codes";

// ============================================================================
// Public types
// ============================================================================

export type Offer = {
  /** Price in minor currency unit (øre/cents). Non-negative integer. */
  priceMinor: number;
  /** Quantity of the line item this offer covers. Positive integer. */
  quantity: number;
  /**
   * Validity timestamp. After this point the offer should be considered
   * expired. The engine compares against the `now` parameter — never against
   * Date.now() directly, to preserve determinism.
   */
  validUntil: Date;
};

export type MarketSignals = {
  /** Latest observed competitor price in same currency. Optional. */
  competitorPriceMinor?: number;
  /** Demand index 0-1. Optional. Currently informational only. */
  demandIndex?: number;
};

export type NegotiationInput = {
  // ─── Shop-side parameters (set by admin via legislation branch) ──────────

  /** Minimum acceptable price in minor currency unit. Must satisfy 0 ≤ floor ≤ anchor. */
  floorMinor: number;

  /** List price (opening offer) in minor currency unit. Must satisfy anchor ≥ floor. */
  anchorMinor: number;

  /**
   * Fraction of the gap (current - floor) to close per concession round.
   * 0.0 = never concede (counter offers below floor are rejected outright).
   * 1.0 = concede all the way to the floor in one step.
   * Typical values: 0.25 – 0.5.
   */
  concessionRate: number;

  // ─── Counterparty state ────────────────────────────────────────────────

  /**
   * Shop's current offer on the table (the last counter we sent). Null on
   * the first round before we've offered anything.
   */
  currentOffer: Offer | null;

  /**
   * Counterparty's last offer. Null if they haven't made one yet (first
   * round) or have explicitly withdrawn.
   */
  counterOffer: Offer | null;

  /**
   * Optional market signals. The engine reads these but per the monotonicity
   * guarantee MUST NOT use them to retract or worsen a live offer.
   */
  marketSignals?: MarketSignals;

  // ─── Loop guard ────────────────────────────────────────────────────────

  /** Current round number, 1-indexed. */
  round: number;

  /** Cap on negotiation rounds. After this many, engine force-rejects. */
  maxRounds: number;

  /**
   * Wall-clock time the decision is being made (for expiry checks). Passed
   * in explicitly to keep the engine pure / deterministic.
   */
  now: Date;
};

export type NegotiationDecision = {
  /**
   * The decision verdict:
   *   "accept"  — counterparty's offer is acceptable; commit to it.
   *   "counter" — engine emits a new offer (in nextOffer).
   *   "hold"    — engine maintains its current offer without change.
   *   "reject"  — negotiation terminated; no acceptable agreement reached.
   */
  decision: "accept" | "counter" | "hold" | "reject";

  /**
   * The offer associated with the decision:
   *   - decision="accept"  → the counterparty's offer (echoed back)
   *   - decision="counter" → the new offer we are emitting
   *   - decision="hold"    → the current offer, unchanged
   *   - decision="reject"  → null
   */
  nextOffer: Offer | null;

  /**
   * Non-empty list of reasoning codes that explain the decision. Order is
   * meaningful: most specific code first.
   */
  reasoningCodes: ReadonlyArray<ReasoningCode>;
};

// ============================================================================
// Engine
// ============================================================================

/**
 * Core decision function. Pure — same input always produces same output.
 *
 * Returns an immutable structure; callers MUST NOT mutate it.
 */
export function decideNegotiation(
  input: NegotiationInput,
): NegotiationDecision {
  // ─── Step 1: Input validation ─────────────────────────────────────────
  const validationError = validate(input);
  if (validationError) {
    return {
      decision: "reject",
      nextOffer: null,
      reasoningCodes: ["INVALID_INPUT"],
    };
  }

  // ─── Step 2: Round-limit guard ────────────────────────────────────────
  if (input.round > input.maxRounds) {
    return {
      decision: "reject",
      nextOffer: null,
      reasoningCodes: ["MAX_ROUNDS_REACHED"],
    };
  }

  // ─── Step 3: First round — open with the anchor ───────────────────────
  if (input.currentOffer === null && input.counterOffer === null) {
    return {
      decision: "counter",
      nextOffer: makeOffer(input.anchorMinor, defaultQuantity(input), defaultValidUntil(input)),
      reasoningCodes: ["FIRST_ROUND_ANCHOR"],
    };
  }

  // ─── Step 4: Counter-offer evaluation ─────────────────────────────────
  if (input.counterOffer !== null) {
    // Step 4a: Has the counter expired?
    if (input.counterOffer.validUntil.getTime() < input.now.getTime()) {
      // Counter has expired. If we still have room to concede, send a fresh
      // offer; else reject. We treat expiry like a "no counter received" but
      // tagged so the audit log can show why.
      const concessionResult = attemptConcession(input);
      return {
        ...concessionResult,
        reasoningCodes: ["COUNTER_EXPIRED", ...concessionResult.reasoningCodes],
      };
    }

    // Step 4b: Counter at or above floor → accept.
    if (input.counterOffer.priceMinor >= input.floorMinor) {
      return {
        decision: "accept",
        nextOffer: input.counterOffer,
        reasoningCodes: ["COUNTER_AT_OR_ABOVE_FLOOR"],
      };
    }

    // Step 4c: Counter below floor → either concede toward floor or reject.
    const concessionResult = attemptConcession(input);
    return {
      ...concessionResult,
      reasoningCodes: ["COUNTER_BELOW_FLOOR", ...concessionResult.reasoningCodes],
    };
  }

  // ─── Step 5: We have a current offer but no fresh counter ─────────────
  // Counterparty is silent. Hold our current offer (monotonicity: never
  // raise; we already hit floor or are waiting).
  //
  // Even if marketSignals would suggest a higher price, monotonicity
  // forbids us from raising. Emit MONOTONICITY_HOLD if that's why.

  const marketWouldRaise =
    input.marketSignals?.competitorPriceMinor !== undefined &&
    input.currentOffer !== null &&
    input.marketSignals.competitorPriceMinor > input.currentOffer.priceMinor;

  return {
    decision: "hold",
    nextOffer: input.currentOffer,
    reasoningCodes: marketWouldRaise ? ["MONOTONICITY_HOLD"] : ["MONOTONICITY_HOLD"],
  };
}

// ============================================================================
// Internal helpers (pure)
// ============================================================================

/**
 * Compute the next concession price and decide whether to counter or reject.
 *
 * Concession formula:
 *   next = current - (current - floor) * concessionRate
 *   next = max(next, floor)               // don't go below floor
 *   next = min(next, current.priceMinor)  // monotonicity: never raise
 *
 * If next == current, no further concession is possible — reject (or hold,
 * but for clarity we reject when counterparty offered below floor).
 */
function attemptConcession(input: NegotiationInput): {
  decision: "counter" | "hold" | "reject";
  nextOffer: Offer | null;
  reasoningCodes: ReadonlyArray<ReasoningCode>;
} {
  // If no current offer, start with anchor (this can happen if counterOffer
  // was made first, e.g. buyer-initiated negotiation).
  const currentPrice =
    input.currentOffer?.priceMinor ?? input.anchorMinor;

  // Already at floor → cannot concede further.
  if (currentPrice <= input.floorMinor) {
    return {
      decision: "reject",
      nextOffer: null,
      reasoningCodes: ["AT_FLOOR"],
    };
  }

  // Compute concession.
  const gap = currentPrice - input.floorMinor;
  // Round to nearest integer (minor unit is integer). Use Math.floor to keep
  // the engine deterministic and slightly buyer-friendly.
  const concessionAmount = Math.floor(gap * input.concessionRate);
  let nextPrice = currentPrice - concessionAmount;

  // Floor clamp (defence-in-depth — the formula above should already respect).
  if (nextPrice < input.floorMinor) {
    nextPrice = input.floorMinor;
  }

  // Monotonicity clamp.
  if (nextPrice > currentPrice) {
    nextPrice = currentPrice;
  }

  // If no actual concession (zero step), reject.
  if (nextPrice === currentPrice) {
    return {
      decision: "reject",
      nextOffer: null,
      reasoningCodes: input.concessionRate === 0 ? ["AT_FLOOR"] : ["AT_FLOOR"],
    };
  }

  // Construct the new offer.
  return {
    decision: "counter",
    nextOffer: makeOffer(nextPrice, defaultQuantity(input), defaultValidUntil(input)),
    reasoningCodes: ["CONCESSION_APPLIED"],
  };
}

/**
 * Validate input invariants. Returns an error string if invalid, null if ok.
 */
function validate(input: NegotiationInput): string | null {
  if (!Number.isFinite(input.floorMinor) || input.floorMinor < 0) {
    return "floorMinor must be a non-negative finite number";
  }
  if (!Number.isFinite(input.anchorMinor) || input.anchorMinor < 0) {
    return "anchorMinor must be a non-negative finite number";
  }
  if (input.floorMinor > input.anchorMinor) {
    return "floorMinor must be ≤ anchorMinor";
  }
  if (
    !Number.isFinite(input.concessionRate) ||
    input.concessionRate < 0 ||
    input.concessionRate > 1
  ) {
    return "concessionRate must be in [0, 1]";
  }
  if (!Number.isInteger(input.round) || input.round < 1) {
    return "round must be a positive integer";
  }
  if (!Number.isInteger(input.maxRounds) || input.maxRounds < 1) {
    return "maxRounds must be a positive integer";
  }
  if (input.currentOffer && input.currentOffer.priceMinor < 0) {
    return "currentOffer.priceMinor must be non-negative";
  }
  if (input.counterOffer && input.counterOffer.priceMinor < 0) {
    return "counterOffer.priceMinor must be non-negative";
  }
  return null;
}

/** Constructor — keeps Offer creation in one place. */
function makeOffer(
  priceMinor: number,
  quantity: number,
  validUntil: Date,
): Offer {
  return Object.freeze({ priceMinor, quantity, validUntil });
}

/** Pick a sensible default quantity from prior offers, defaulting to 1. */
function defaultQuantity(input: NegotiationInput): number {
  return (
    input.counterOffer?.quantity ??
    input.currentOffer?.quantity ??
    1
  );
}

/** Default offer expiry: 24 hours after `now`. */
function defaultValidUntil(input: NegotiationInput): Date {
  return new Date(input.now.getTime() + 24 * 60 * 60 * 1000);
}
