import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  canTransition,
  assertTransition,
  isTerminal,
  legalNextStates,
  isOrderStatus,
  statusLabel,
  statusColor,
  statusesForTab,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  IllegalOrderTransitionError,
  type OrderStatus,
} from "@/lib/orders/status";

/**
 * Ordrestyring — tests for ordre-status-state-machinen. Transition-tabellen i
 * kilden er den eneste autoritet; tilføj en række her i lockstep med kilden.
 */
const LEGAL_TRANSITIONS: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ["pending_payment", "paid"],
  ["pending_payment", "cancelled"],
  ["pending", "paid"],
  ["pending", "processing"],
  ["pending", "cancelled"],
  ["paid", "processing"],
  ["paid", "shipped"],
  ["paid", "cancelled"],
  ["paid", "refunded"],
  ["paid", "partial_refund"],
  ["processing", "shipped"],
  ["processing", "cancelled"],
  ["processing", "refunded"],
  ["processing", "partial_refund"],
  ["shipped", "delivered"],
  ["shipped", "completed"],
  ["shipped", "refunded"],
  ["shipped", "partial_refund"],
  ["delivered", "completed"],
  ["delivered", "refunded"],
  ["delivered", "partial_refund"],
  ["flagged_review", "paid"],
  ["flagged_review", "cancelled"],
  ["flagged_review", "refunded"],
  ["disputed", "refunded"],
  ["disputed", "cancelled"],
  ["disputed", "completed"],
  ["completed", "refunded"],
  ["completed", "partial_refund"],
];

describe("Order state machine — legal transitions", () => {
  for (const [from, to] of LEGAL_TRANSITIONS) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  }
});

describe("Order state machine — illegal transitions", () => {
  const illegal: Array<[OrderStatus, OrderStatus]> = [];
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      if (from === to) continue;
      const legal = LEGAL_TRANSITIONS.some(([f, t]) => f === from && t === to);
      if (!legal) illegal.push([from, to]);
    }
  }

  for (const [from, to] of illegal) {
    it(`rejects ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(
        IllegalOrderTransitionError,
      );
    });
  }

  it("throws with descriptive message", () => {
    expect(() => assertTransition("refunded", "paid")).toThrow(
      /Ulovlig ordre-transition: refunded → paid/,
    );
  });
});

describe("Order state machine — terminal detection", () => {
  it("cancelled / refunded / partial_refund are terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("refunded")).toBe(true);
    expect(isTerminal("partial_refund")).toBe(true);
    expect(legalNextStates("cancelled")).toEqual([]);
  });

  it("paid / shipped / processing are not terminal", () => {
    expect(isTerminal("paid")).toBe(false);
    expect(isTerminal("shipped")).toBe(false);
    expect(isTerminal("processing")).toBe(false);
  });
});

describe("Order state machine — type-guard", () => {
  it("recognises all canonical statuses", () => {
    for (const s of ORDER_STATUSES) expect(isOrderStatus(s)).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isOrderStatus("PAID")).toBe(false);
    expect(isOrderStatus("foo")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
    expect(isOrderStatus(42)).toBe(false);
  });
});

describe("Order state machine — labels & colors completeness", () => {
  it("every canonical status has a label and a color", () => {
    for (const s of ORDER_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_COLORS[s]).toBeTruthy();
    }
  });

  it("the four legacy colors are preserved verbatim", () => {
    expect(STATUS_COLORS.pending).toBe("bg-yellow-100 text-yellow-800");
    expect(STATUS_COLORS.paid).toBe("bg-green-100 text-green-800");
    expect(STATUS_COLORS.shipped).toBe("bg-blue-100 text-blue-800");
    expect(STATUS_COLORS.cancelled).toBe("bg-red-100 text-red-800");
  });

  it("label/color fall back gracefully for unknown strings", () => {
    expect(statusLabel("legacy_weird")).toBe("legacy_weird");
    expect(statusColor("legacy_weird")).toBe(STATUS_COLOR_FALLBACK);
  });
});

describe("Order state machine — tab → status mapping", () => {
  it("'all' maps to null (no filter)", () => {
    expect(statusesForTab("all")).toBeNull();
  });
  it("'processing' tab covers paid + processing", () => {
    expect(statusesForTab("processing")).toEqual(["paid", "processing"]);
  });
  it("'attention' tab covers flagged_review + disputed", () => {
    expect(statusesForTab("attention")).toEqual(["flagged_review", "disputed"]);
  });
  it("unknown tab maps to null", () => {
    expect(statusesForTab("nope")).toBeNull();
  });
});
