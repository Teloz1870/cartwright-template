/**
 * ORD1-a1 — the static status table (lib/orders/status-table.ts). A row says what
 * the code does today, so each meaning is checked here against the code that does
 * it, not against a second copy of the table. The reader and the seed run on a
 * real database in ../order-status-table-db.test.ts, the admin pages in
 * ../order-status-admin-db.test.tsx, and what the money path may not do in
 * ./status-money-path.test.ts and ../order-status-name-no-money-db.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { suggestNextActions } from "@/lib/orders/next-action";
import { isUnpaidCancel } from "@/lib/orders/operator-status";
import {
  ORDER_STATUSES,
  ORDER_TABS,
  STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  STATUS_LABELS,
  canTransition,
  isTerminal,
  legalNextStates,
  revenueOrderWhere,
  statusColor,
  statusLabel,
  type OrderStatus,
} from "@/lib/orders/status";
import {
  STATIC_ORDER_STATUS_ROWS,
  STOCK_EFFECTS,
  orderStatusDisplay,
  overlayOrderStatuses,
  type OrderStatusDbRow,
  type OrderStatusRow,
} from "@/lib/orders/status-table";
import { stripComments } from "../../helpers/claims";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => stripComments(read(p));

const row = (key: string): OrderStatusRow => {
  const found = STATIC_ORDER_STATUS_ROWS.find((r) => r.key === key);
  if (!found) throw new Error(`no row for ${key}`);
  return found;
};
const keysWhere = (test: (r: OrderStatusRow) => boolean) =>
  STATIC_ORDER_STATUS_ROWS.filter(test).map((r) => r.key);

describe("the static table is 1:1 with the statuses the code knows", () => {
  it("one row per status, in the order of ORDER_STATUSES, with nothing beside them", () => {
    expect(STATIC_ORDER_STATUS_ROWS.map((r) => r.key)).toEqual([...ORDER_STATUSES]);
  });

  it("today's label and colour on every row", () => {
    for (const r of STATIC_ORDER_STATUS_ROWS) {
      expect(r.label).toBe(STATUS_LABELS[r.key as OrderStatus]);
      expect(r.color).toBe(STATUS_COLORS[r.key as OrderStatus]);
      expect(r.label).toBe(statusLabel(r.key));
      expect(r.color).toBe(statusColor(r.key));
      expect(r.translations).toBeNull();
    }
  });

  it("sortOrder runs up the table, with room between two rows for a shop's own", () => {
    const orders = STATIC_ORDER_STATUS_ROWS.map((r) => r.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (let i = 1; i < orders.length; i++) expect(orders[i] - orders[i - 1]).toBeGreaterThan(1);
  });

  it("every stockEffect is one the schema names", () => {
    for (const r of STATIC_ORDER_STATUS_ROWS) expect(STOCK_EFFECTS).toContain(r.stockEffect);
    expect(read("prisma/schema.prisma")).toMatch(/stockEffect\s+String\s+@default\("none"\)\s*\/\/ "reserve" \| "release" \| "none"/);
  });
});

describe("each meaning agrees with the code that uses it today", () => {
  it("countsAsRevenue: false exactly where revenueOrderWhere leaves the order out", () => {
    const excluded = revenueOrderWhere().status.notIn;
    for (const r of STATIC_ORDER_STATUS_ROWS) expect(r.countsAsRevenue, r.key).toBe(!excluded.includes(r.key));
    // The odd ones are said out loud: this row describes today's rule, not a better one.
    expect(row("pending_payment").countsAsRevenue).toBe(true);
    expect(row("refunded").countsAsRevenue).toBe(true);
  });

  it("isFinal: exactly the statuses the machine has no move out of", () => {
    for (const status of ORDER_STATUSES) {
      expect(row(status).isFinal, status).toBe(isTerminal(status));
      expect(row(status).isFinal, status).toBe(legalNextStates(status).length === 0);
    }
    expect(keysWhere((r) => r.isFinal)).toEqual(["cancelled", "refunded", "partial_refund"]);
  });

  describe("isPaid", () => {
    it("is false on every status that can still become paid: the machine's `… → paid` rows", () => {
      const awaiting = ORDER_STATUSES.filter((s) => canTransition(s, "paid"));
      expect(awaiting).toEqual(["pending_payment", "pending", "flagged_review"]);
      for (const status of awaiting) expect(row(status).isPaid, status).toBe(false);
    });

    it("is true on `paid`, and on what the admin already calls paid", () => {
      expect(row("paid").isPaid).toBe(true);
      // suggestNextActions: "Paid N days ago and not yet shipped."
      const called = ORDER_STATUSES.filter((status) =>
        suggestNextActions({ status, ageDays: 9, hasSupplier: false, lowStock: false, openReturns: 0, hasStripePayment: true })
          .some((a) => /^Paid /.test(a.reason)),
      );
      expect(called).toEqual(["paid", "processing"]);
      for (const status of called) expect(row(status).isPaid, status).toBe(true);
    });

    it("is false on the tab of orders awaiting payment", () => {
      const tab = ORDER_TABS.find((t) => t.key === "awaiting_payment");
      for (const status of tab?.statuses ?? []) expect(row(status).isPaid, status).toBe(false);
      expect(tab?.statuses?.length).toBeGreaterThan(0);
    });

    it("is true on the statuses a paid order gets a review prompt in", () => {
      const cron = "plugins/reviews/api/review-prompt-cron.ts";
      if (!existsSync(join(ROOT, cron))) return; // a scaffold may have left the plugin out
      const listed = /status:\s*\{\s*in:\s*\[([^\]]+)\]/.exec(code(cron))?.[1] ?? "";
      const statuses = [...listed.matchAll(/"(\w+)"/g)].map((m) => m[1]);
      expect(statuses.length).toBeGreaterThan(0);
      for (const status of statuses) expect(row(status).isPaid, status).toBe(true);
    });

    it("the whole list: a payment was taken, not all of it went back, and the order was not cancelled", () => {
      expect(keysWhere((r) => r.isPaid)).toEqual([
        "paid",
        "shipped",
        "partial_refund", // a part went back, the rest did not
        "disputed", // contested, not returned: disputed → completed is a legal move
        "processing",
        "delivered",
        "completed",
      ]);
    });
  });

  it("stockEffect: the one stock move a status makes today is isUnpaidCancel", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const table = row(from).stockEffect === "reserve" && row(to).stockEffect === "release";
        expect(table, `${from} → ${to}`).toBe(isUnpaidCancel(from, to));
      }
    }
    expect(keysWhere((r) => r.stockEffect === "reserve")).toEqual(["pending_payment"]);
    expect(keysWhere((r) => r.stockEffect === "release")).toEqual(["cancelled"]);
  });

  it("notifyCustomer: only `paid`, whose receipt goes out from onOrderPaid; no status write mails anyone", () => {
    expect(keysWhere((r) => r.notifyCustomer)).toEqual(["paid"]);
    expect(code("lib/orders/on-paid.ts")).toMatch(/mailer\.sendOrderConfirmation\(/);

    const MAIL = /\bmailer\.|\bsend[A-Z]\w*Email\b/;
    for (const file of [
      "lib/orders/operator-status.ts",
      "lib/orders/cancel-unpaid.ts",
      "lib/orders/cancel-payment.ts",
      "app/api/webhook/stripe/route.ts",
      "app/api/cron/reconcile-stripe/route.ts",
    ]) {
      expect(code(file), file).not.toMatch(MAIL);
    }
    // The operator paths' status write, cut out of a file that mails on its own buttons.
    const actions = code("app/admin/ordrer/actions.ts");
    const transitionCore = actions.slice(
      actions.indexOf("async function transitionCore"),
      actions.indexOf("export async function listOrdersPage"),
    );
    expect(transitionCore).toMatch(/writeOperatorStatus\(/);
    expect(transitionCore).not.toMatch(MAIL);
  });

  it("customerVisible: all of them, because a customer's account lists every order they have", () => {
    expect(keysWhere((r) => r.customerVisible)).toEqual([...ORDER_STATUSES]);
    expect(code("app/[locale]/account/orders/page.tsx")).toMatch(/where:\s*\{\s*userId:\s*session\.user\.id\s*\}/);
  });
});

const dbRow = (over: Partial<OrderStatusDbRow> & { key: string }): OrderStatusDbRow => ({
  label: over.key,
  translations: null,
  color: null,
  sortOrder: 0,
  isPaid: false,
  isFinal: false,
  countsAsRevenue: false,
  stockEffect: "none",
  notifyCustomer: false,
  customerVisible: true,
  ...over,
});

describe("overlayOrderStatuses", () => {
  it("no rows: the static table itself", () => {
    expect(overlayOrderStatuses([])).toBe(STATIC_ORDER_STATUS_ROWS);
  });

  it("rows 1:1 with the static table, in any order: the static table", () => {
    const rows = [...STATIC_ORDER_STATUS_ROWS].reverse();
    expect(overlayOrderStatuses(rows)).toEqual(STATIC_ORDER_STATUS_ROWS);
  });

  it("a shop's row replaces the static one, and a status with no row keeps the static one", () => {
    const rows = overlayOrderStatuses([dbRow({ ...row("paid"), label: "Betalt", color: "bg-pink-100 text-pink-800", isPaid: false })]);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.key === "paid")).toMatchObject({ label: "Betalt", color: "bg-pink-100 text-pink-800", isPaid: false });
    expect(rows.find((r) => r.key === "shipped")).toEqual(row("shipped"));
  });

  it("sorts by sortOrder, and a key of the shop's own comes along with its declared meaning", () => {
    const rows = overlayOrderStatuses([
      dbRow({ key: "mine", label: "Mine", sortOrder: 15, isPaid: true, stockEffect: "reserve", notifyCustomer: true, customerVisible: false }),
    ]);
    expect(rows.map((r) => r.key).slice(0, 3)).toEqual(["pending_payment", "pending", "mine"]);
    expect(rows.find((r) => r.key === "mine")).toEqual({
      key: "mine",
      label: "Mine",
      translations: null,
      color: null,
      sortOrder: 15,
      isPaid: true,
      isFinal: false,
      countsAsRevenue: false,
      stockEffect: "reserve",
      notifyCustomer: true,
      customerVisible: false,
    });
  });

  it("what a row leaves blank stays what it was", () => {
    const rows = overlayOrderStatuses([
      dbRow({ ...row("paid"), label: "  ", color: null }),
      dbRow({ ...row("shipped"), color: " " }),
      dbRow({ key: "mine", label: "", color: "" }),
    ]);
    expect(rows.find((r) => r.key === "paid")).toMatchObject({ label: "Paid", color: STATUS_COLORS.paid });
    expect(rows.find((r) => r.key === "shipped")?.color).toBe(STATUS_COLORS.shipped);
    expect(rows.find((r) => r.key === "mine")).toMatchObject({ label: "mine", color: null });
  });

  it("a stockEffect the schema does not name is no effect a row can declare", () => {
    const rows = overlayOrderStatuses([
      dbRow({ ...row("cancelled"), stockEffect: "explode" }),
      dbRow({ key: "mine", stockEffect: "explode" }),
    ]);
    expect(rows.find((r) => r.key === "cancelled")?.stockEffect).toBe("release");
    expect(rows.find((r) => r.key === "mine")?.stockEffect).toBe("none");
  });
});

describe("orderStatusDisplay", () => {
  const unknown = "legacy_weird";

  it("with no rows, reads exactly as statusLabel and statusColor do, for an unknown string too", () => {
    const display = orderStatusDisplay();
    for (const key of [...ORDER_STATUSES, unknown]) {
      expect(display.label(key)).toBe(statusLabel(key));
      expect(display.color(key)).toBe(statusColor(key));
    }
    expect(display.color(unknown)).toBe(STATUS_COLOR_FALLBACK);
    expect(display.label(unknown)).toBe(unknown);
  });

  it("reads a shop's label and colour; a row of its own with no colour gets the neutral badge", () => {
    const display = orderStatusDisplay(overlayOrderStatuses([
      dbRow({ ...row("paid"), label: "Betalt", color: "bg-pink-100 text-pink-800" }),
      dbRow({ key: "mine", label: "Mine" }),
    ]));
    expect(display.label("paid")).toBe("Betalt");
    expect(display.color("paid")).toBe("bg-pink-100 text-pink-800");
    expect(display.label("mine")).toBe("Mine");
    expect(display.color("mine")).toBe(STATUS_COLOR_FALLBACK);
  });

  it("ownColor: only a colour the shop set itself", () => {
    const seeded = orderStatusDisplay(overlayOrderStatuses(STATIC_ORDER_STATUS_ROWS));
    for (const status of ORDER_STATUSES) expect(seeded.ownColor(status), status).toBeUndefined();
    expect(seeded.ownColor(unknown)).toBeUndefined();

    const own = orderStatusDisplay(overlayOrderStatuses([
      dbRow({ ...row("paid"), color: "bg-pink-100 text-pink-800" }),
      dbRow({ key: "mine", color: "bg-lime-100 text-lime-800" }),
      dbRow({ key: "plain" }),
    ]));
    expect(own.ownColor("paid")).toBe("bg-pink-100 text-pink-800");
    expect(own.ownColor("mine")).toBe("bg-lime-100 text-lime-800");
    expect(own.ownColor("plain")).toBeUndefined();
    expect(own.ownColor("shipped")).toBeUndefined();
  });

  describe("inOrder", () => {
    const LISTS: readonly (readonly string[])[] = [
      ORDER_STATUSES,
      ["processing", "shipped", "delivered", "completed", "cancelled"],
      ...ORDER_STATUSES.map((s) => legalNextStates(s)),
    ];

    it("no single order could keep the machine's lists as they are, which is why it does not try", () => {
      const before = (list: readonly string[], a: string, b: string) => list.indexOf(a) < list.indexOf(b);
      expect(before(legalNextStates("paid"), "cancelled", "refunded")).toBe(true);
      expect(before(legalNextStates("disputed"), "refunded", "cancelled")).toBe(true);
    });

    it("keeps every list as the code wrote it, on no rows and on rows 1:1", () => {
      for (const display of [orderStatusDisplay(), orderStatusDisplay(overlayOrderStatuses(STATIC_ORDER_STATUS_ROWS))]) {
        for (const list of LISTS) expect(display.inOrder(list)).toEqual(list);
      }
    });

    it("keeps them too when the numbers change and the order does not, and for a row of the shop's own in between", () => {
      const display = orderStatusDisplay(overlayOrderStatuses([
        ...STATIC_ORDER_STATUS_ROWS.map((r) => dbRow({ ...r, sortOrder: r.sortOrder * 3 + 7 })),
        dbRow({ key: "mine", sortOrder: 40 }),
      ]));
      for (const list of LISTS) expect(display.inOrder(list)).toEqual(list);
    });

    it("follows the shop once it has changed the order", () => {
      const display = orderStatusDisplay(overlayOrderStatuses([dbRow({ ...row("refunded"), sortOrder: -1 })]));
      expect(display.inOrder(legalNextStates("paid"))).toEqual([
        "refunded",
        "shipped",
        "cancelled",
        "partial_refund",
        "processing",
      ]);
      expect(display.inOrder(ORDER_STATUSES)[0]).toBe("refunded");
    });

    it("never adds a key: a row of the shop's own is no status to move an order to", () => {
      const display = orderStatusDisplay(overlayOrderStatuses([
        dbRow({ ...row("refunded"), sortOrder: -1 }),
        dbRow({ key: "mine", sortOrder: -2 }),
      ]));
      expect(display.inOrder(ORDER_STATUSES)).toHaveLength(ORDER_STATUSES.length);
      expect(display.inOrder(ORDER_STATUSES)).not.toContain("mine");
    });
  });
});
