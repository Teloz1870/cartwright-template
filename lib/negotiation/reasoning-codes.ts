/**
 * Master Plan §4 Phase 6 — Anchor-and-Resume reasoning codes.
 *
 * Every decision the negotiation engine returns includes a (non-empty) list of
 * reasoning codes that explain WHY the decision came out the way it did. The
 * LLM translation layer (§3.2, out of scope for Phase 6) renders these as
 * natural language. The engine itself never generates natural language — it
 * only emits codes.
 *
 * The set of codes is intentionally small + closed. Each represents a
 * distinct branch in the engine's decision tree. Adding a new code requires
 * adding a corresponding branch and updating the table-driven test suite.
 *
 * Pure module — no imports, no side effects.
 */

export const REASONING_CODES = [
  /**
   * No counter-offer received and no current offer. Opening the negotiation
   * with the anchor (list price). Always paired with `decision: "counter"`.
   */
  "FIRST_ROUND_ANCHOR",

  /**
   * Counter-offer received at or above floor. Engine accepts it as-is.
   * Always paired with `decision: "accept"`.
   */
  "COUNTER_AT_OR_ABOVE_FLOOR",

  /**
   * Counter-offer received strictly below floor — unacceptable. Engine
   * either rejects outright or counters with a concession (depending on
   * whether further concession is possible without breaking monotonicity).
   */
  "COUNTER_BELOW_FLOOR",

  /**
   * Engine concedes from current offer toward the floor. The concession size
   * is `(current - floor) * concessionRate`, clamped to never go below floor.
   * Always paired with `decision: "counter"`.
   */
  "CONCESSION_APPLIED",

  /**
   * Current offer is already at the floor — engine cannot concede further.
   * Either holds at floor (if counter is at floor exactly) or rejects.
   */
  "AT_FLOOR",

  /**
   * Engine considered raising the next offer (e.g. due to market signals)
   * but monotonicity guarantee forbids it. Held at current offer instead.
   * Always paired with `decision: "hold"` or `"counter"` at unchanged price.
   */
  "MONOTONICITY_HOLD",

  /**
   * Validation: floor > anchor, concessionRate outside [0,1], or other
   * invariant violation in input. Engine refuses to proceed.
   * Always paired with `decision: "reject"`.
   */
  "INVALID_INPUT",

  /**
   * Counter-offer's validUntil is in the past. Cannot accept an expired offer.
   * Engine either counters with a fresh offer or rejects.
   */
  "COUNTER_EXPIRED",

  /**
   * Engine has reached the maximum number of negotiation rounds (capped to
   * prevent infinite negotiation loops). Force-rejects to terminate.
   */
  "MAX_ROUNDS_REACHED",
] as const;

export type ReasoningCode = (typeof REASONING_CODES)[number];

/**
 * Type-guard for runtime validation of incoming reasoning codes (e.g. from
 * persisted AgenticJWT.capabilitiesJson). Returns true iff the string is a
 * recognised reasoning code.
 */
export function isReasoningCode(value: unknown): value is ReasoningCode {
  return (
    typeof value === "string" &&
    (REASONING_CODES as readonly string[]).includes(value)
  );
}
