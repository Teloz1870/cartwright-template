import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TABS,
  ORDER_TABS_WITH_QUOTES,
  NON_REVENUE_STATUSES,
  QUOTE_STATUS,
  canTransition,
  assertTransition,
  isTerminal,
  legalNextStates,
  isOperatorTarget,
  isOrderStatus,
  placedOrderWhere,
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
const EVERY_STATUS: readonly OrderStatus[] = [...ORDER_STATUSES, QUOTE_STATUS];

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
  ["quote", "pending_payment"],
  ["quote", "cancelled"],
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
  for (const from of EVERY_STATUS) {
    for (const to of EVERY_STATUS) {
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
      /Illegal order transition: refunded → paid/,
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

describe("Order state machine — a quote", () => {
  it("is a status the machine knows, and no status an operator may write", () => {
    expect(isOrderStatus(QUOTE_STATUS)).toBe(true);
    expect(isOperatorTarget(QUOTE_STATUS)).toBe(false);
    for (const s of ORDER_STATUSES) expect(isOperatorTarget(s), s).toBe(true);
    expect(isOperatorTarget("legacy_weird")).toBe(false);
    expect(isOperatorTarget(null)).toBe(false);
    expect(ORDER_STATUSES).toHaveLength(12);
  });

  it("is not terminal: it has exactly its two ways out, in the order a control opens on", () => {
    expect(isTerminal(QUOTE_STATUS)).toBe(false);
    expect(legalNextStates(QUOTE_STATUS)).toEqual(["pending_payment", "cancelled"]);
  });

  it("no status has a move into it", () => {
    for (const from of EVERY_STATUS) expect(legalNextStates(from), from).not.toContain(QUOTE_STATUS);
  });

  it("the webhook's question has the answer no: a payment does not make a quote paid", () => {
    expect(canTransition(QUOTE_STATUS, "paid")).toBe(false);
  });

  it("counts as revenue nowhere, and is left out of what a customer placed", () => {
    expect(NON_REVENUE_STATUSES).toContain(QUOTE_STATUS);
    expect(placedOrderWhere()).toEqual({ status: { not: QUOTE_STATUS } });
  });
});

describe("Order state machine — type-guard", () => {
  it("recognises all canonical statuses", () => {
    for (const s of EVERY_STATUS) expect(isOrderStatus(s)).toBe(true);
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
    for (const s of EVERY_STATUS) {
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
  it("the seven tabs stay what they were, and `quotes` is an unknown key among them", () => {
    expect(ORDER_TABS.map((t) => t.key)).toEqual([
      "all",
      "awaiting_payment",
      "processing",
      "shipped",
      "completed",
      "closed",
      "attention",
    ]);
    expect(statusesForTab("quotes")).toBeNull();
    expect(statusesForTab("quotes", ORDER_TABS)).toBeNull();
  });
  it("no tab but its own holds a quote", () => {
    expect(ORDER_TABS.flatMap((t) => t.statuses ?? [])).not.toContain(QUOTE_STATUS);
  });
  it("with the flag's tabs, `quotes` is exactly the quote, and the others mean what they meant", () => {
    expect(statusesForTab("quotes", ORDER_TABS_WITH_QUOTES)).toEqual([QUOTE_STATUS]);
    expect(ORDER_TABS_WITH_QUOTES.slice(0, ORDER_TABS.length)).toEqual([...ORDER_TABS]);
    expect(ORDER_TABS_WITH_QUOTES).toHaveLength(ORDER_TABS.length + 1);
    expect(statusesForTab("all", ORDER_TABS_WITH_QUOTES)).toBeNull();
  });
});
