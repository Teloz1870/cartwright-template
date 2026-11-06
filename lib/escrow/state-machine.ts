/**
 * Master Plan §4 Phase 5/7 — escrow state machine.
 *
 * Pure transition rules for EscrowTransaction.status. Lives outside the
 * Prisma layer so that:
 *   1. Decision logic is testable without a DB.
 *   2. The set of legal transitions is documented in one place + exhaustively.
 *   3. Guardian middleware (Phase 7) can consult these rules before writing
 *      to the DB, rejecting illegal transitions atomically.
 *
 * The state machine itself is defined as a transition table (an immutable
 * map from current state to allowed next states). Adding a new transition
 * requires editing the table + the corresponding test row — there is no
 * branch in code that "happens to allow" an undocumented transition.
 *
 * Pure module — no imports, no side effects.
 */

/** Canonical state names. Strings are stored in EscrowTransaction.status. */
export const ESCROW_STATES = [
  "pending",
  "funded",
  "released",
  "refunded",
  "disputed",
] as const;

export type EscrowState = (typeof ESCROW_STATES)[number];

/**
 * Legal transitions. Reading: `pending` can become `funded` or `refunded`
 * (refunded covers the "buyer pulled out before payment" case).
 *
 * Terminal states (released, refunded) have an empty next-set — they cannot
 * be transitioned out of without administrator intervention via a separate
 * codepath that writes a NEW EscrowTransaction (the original row is
 * append-only audit history).
 */
const TRANSITIONS: Readonly<Record<EscrowState, readonly EscrowState[]>> = {
  pending: ["funded", "refunded"],
  funded: ["released", "refunded", "disputed"],
  disputed: ["released", "refunded"],
  released: [], // terminal
  refunded: [], // terminal
};

/** True iff `from → to` is a legal transition. */
export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Error returned by `transition()` when the requested move is illegal. */
export class IllegalEscrowTransitionError extends Error {
  readonly from: EscrowState;
  readonly to: EscrowState;
  constructor(from: EscrowState, to: EscrowState) {
    super(
      `Illegal escrow transition: ${from} → ${to}. Legal next states from ${from}: [${TRANSITIONS[from].join(", ") || "(terminal)"}]`,
    );
    this.from = from;
    this.to = to;
    this.name = "IllegalEscrowTransitionError";
  }
}

/**
 * Validate that `to` is reachable from `from`. Throws
 * IllegalEscrowTransitionError on violation. Returns void on success.
 *
 * Pure — no DB writes, no time references. Callers compose this with their
 * own audit/persistence layer.
 */
export function assertTransition(from: EscrowState, to: EscrowState): void {
  if (!canTransition(from, to)) {
    throw new IllegalEscrowTransitionError(from, to);
  }
}

/** True iff the state is terminal (no further transitions allowed). */
export function isTerminal(state: EscrowState): boolean {
  return TRANSITIONS[state].length === 0;
}

/** Returns the set of legal next states from `from`, as an array. */
export function legalNextStates(from: EscrowState): readonly EscrowState[] {
  return TRANSITIONS[from];
}

/** Type-guard for runtime validation of values coming from the DB. */
export function isEscrowState(value: unknown): value is EscrowState {
  return (
    typeof value === "string" &&
    (ESCROW_STATES as readonly string[]).includes(value)
  );
}
