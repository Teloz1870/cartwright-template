import { describe, it, expect } from "vitest";
import {
  ESCROW_STATES,
  canTransition,
  assertTransition,
  isTerminal,
  legalNextStates,
  isEscrowState,
  IllegalEscrowTransitionError,
  type EscrowState,
} from "@/lib/escrow/state-machine";

/**
 * Master Plan §4 Phase 5/7 — tests for the escrow state machine.
 *
 * The state machine is the only authority for which transitions are legal.
 * Adding a row to the LEGAL_TRANSITIONS table below requires editing the
 * source's transition table and the corresponding row here in lockstep.
 */

const LEGAL_TRANSITIONS: ReadonlyArray<[EscrowState, EscrowState]> = [
  ["pending", "funded"],
  ["pending", "refunded"],
  ["funded", "released"],
  ["funded", "refunded"],
  ["funded", "disputed"],
  ["disputed", "released"],
  ["disputed", "refunded"],
];

describe("Escrow state machine — legal transitions", () => {
  for (const [from, to] of LEGAL_TRANSITIONS) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  }
});

describe("Escrow state machine — illegal transitions", () => {
  // Every (from, to) pair that is NOT in LEGAL_TRANSITIONS must be illegal.
  const allPairs: Array<[EscrowState, EscrowState]> = [];
  for (const from of ESCROW_STATES) {
    for (const to of ESCROW_STATES) {
      if (from === to) continue; // self-loop is also illegal (no-op)
      const isLegal = LEGAL_TRANSITIONS.some(([f, t]) => f === from && t === to);
      if (!isLegal) allPairs.push([from, to]);
    }
  }

  for (const [from, to] of allPairs) {
    it(`rejects ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(
        IllegalEscrowTransitionError,
      );
    });
  }

  it("throws with descriptive message", () => {
    expect(() => assertTransition("released", "funded")).toThrow(
      /Illegal escrow transition: released → funded/,
    );
  });

  it("includes legal next-states in the error message for non-terminal source", () => {
    try {
      assertTransition("pending", "released");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalEscrowTransitionError);
      expect((err as Error).message).toMatch(/funded|refunded/);
    }
  });
});

describe("Escrow state machine — terminal detection", () => {
  it("released is terminal", () => {
    expect(isTerminal("released")).toBe(true);
    expect(legalNextStates("released")).toEqual([]);
  });

  it("refunded is terminal", () => {
    expect(isTerminal("refunded")).toBe(true);
    expect(legalNextStates("refunded")).toEqual([]);
  });

  it("pending, funded, disputed are not terminal", () => {
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("funded")).toBe(false);
    expect(isTerminal("disputed")).toBe(false);
  });
});

describe("Escrow state machine — type-guard", () => {
  it("recognises canonical state strings", () => {
    expect(isEscrowState("pending")).toBe(true);
    expect(isEscrowState("funded")).toBe(true);
    expect(isEscrowState("released")).toBe(true);
    expect(isEscrowState("refunded")).toBe(true);
    expect(isEscrowState("disputed")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isEscrowState("PENDING")).toBe(false); // case-sensitive
    expect(isEscrowState("paid")).toBe(false);
    expect(isEscrowState("")).toBe(false);
    expect(isEscrowState(null)).toBe(false);
    expect(isEscrowState(undefined)).toBe(false);
    expect(isEscrowState(42)).toBe(false);
  });
});
