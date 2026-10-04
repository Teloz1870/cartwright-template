import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DRØM9-c — the admin status form and the bulk action say what
 * `orders.update_status` says: a refund status set by an operator moves no
 * money, so the timeline note and the audit record it as a manual registration.
 * Every other move writes exactly what it wrote before.
 */
const mocks = vi.hoisted(() => ({
  audits: [] as { args: unknown }[],
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn((a: unknown) => ({ op: "order.update", a })),
    },
    orderNote: { create: vi.fn((a: unknown) => ({ op: "orderNote.create", a })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/audit", () => ({
  withAudit: (meta: { args: unknown }, handler: () => unknown) => {
    mocks.audits.push({ args: meta.args });
    return handler();
  },
}));
vi.mock("@/lib/stripe", () => ({ createRefund: vi.fn() }));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: vi.fn() },
  sendShippingNotificationEmail: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(),
  sendReturnReceivedEmail: vi.fn(),
}));

import {
  bulkUpdateStatus,
  updateOrderStatusAdmin,
} from "@/app/admin/ordrer/actions";
import {
  MANUAL_REFUND_NOTE,
  isRefundStatus,
  orderStatusPlanPreview,
} from "@/lib/orders/status";

type NoteData = { body: string; metaJson: string };
const noteData = (): NoteData =>
  (mocks.prisma.orderNote.create.mock.calls.at(-1)![0] as { data: NoteData }).data;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audits.length = 0;
  mocks.prisma.order.findUnique.mockResolvedValue({ status: "paid" });
});

describe("admin status form on a refund status", () => {
  it("writes refunded with a note that says no money moved", async () => {
    const res = await updateOrderStatusAdmin("order-1", "refunded");

    expect(res).toEqual({ ok: true });
    expect(mocks.prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "refunded" },
    });
    const note = noteData();
    expect(note.body.startsWith(`${MANUAL_REFUND_NOTE}: Status: `)).toBe(true);
    expect(JSON.parse(note.metaJson)).toEqual({
      from: "paid",
      to: "refunded",
      manual: true,
      moneyMoved: false,
    });
    expect(mocks.audits[0].args).toEqual({
      orderId: "order-1",
      from: "paid",
      to: "refunded",
      manual: true,
      moneyMoved: false,
    });
  });

  it("marks partial_refund the same way", async () => {
    await updateOrderStatusAdmin("order-1", "partial_refund");
    const note = noteData();
    expect(note.body.startsWith(MANUAL_REFUND_NOTE)).toBe(true);
    expect(JSON.parse(note.metaJson)).toMatchObject({ manual: true, moneyMoved: false });
  });

  it("marks a refund status set through the bulk action too", async () => {
    const res = await bulkUpdateStatus(["order-1"], "refunded");
    expect(res).toEqual({ updated: 1, skipped: [] });
    expect(noteData().body.startsWith(MANUAL_REFUND_NOTE)).toBe(true);
  });
});

describe("admin status form on every other move", () => {
  it("writes the same note, meta and audit args as before", async () => {
    await updateOrderStatusAdmin("order-1", "shipped");
    const note = noteData();
    expect(note.body).toBe("Status: Paid → Shipped");
    expect(JSON.parse(note.metaJson)).toEqual({ from: "paid", to: "shipped" });
    expect(mocks.audits[0].args).toEqual({
      orderId: "order-1",
      from: "paid",
      to: "shipped",
    });
  });

  it("still refuses an illegal move without writing", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "refunded" });
    const res = await updateOrderStatusAdmin("order-1", "partial_refund");
    expect(res.ok).toBe(false);
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
    expect(mocks.prisma.orderNote.create).not.toHaveBeenCalled();
  });
});

describe("admin chat plan card for orders.update_status", () => {
  it("says no money moves on a refund status, with the amount when given", () => {
    expect(orderStatusPlanPreview("o1", "refunded")).toBe(
      "Set order o1 to status 'refunded' — manual registration, no money moved",
    );
    expect(orderStatusPlanPreview("o1", "partial_refund", 1250)).toBe(
      "Set order o1 to status 'partial_refund' — manual registration, no money moved (1250 øre refunded outside the shop)",
    );
  });

  it("never shows an amount the tool would refuse", () => {
    const plain =
      "Set order o1 to status 'refunded' — manual registration, no money moved";
    expect(orderStatusPlanPreview("o1", "refunded", 5000)).toBe(plain);
    for (const bad of [Number.NaN, 0, -500, 12.5, "1250"]) {
      expect(orderStatusPlanPreview("o1", "partial_refund", bad)).toBe(
        "Set order o1 to status 'partial_refund' — manual registration, no money moved",
      );
    }
  });

  it("is unchanged for every other status", () => {
    expect(orderStatusPlanPreview("o1", "shipped", 1250)).toBe(
      "Set order o1 to status 'shipped'",
    );
    expect(orderStatusPlanPreview("o1", undefined)).toBe(
      "Set order o1 to status 'undefined'",
    );
  });

  it("knows exactly the two refund statuses", () => {
    expect(isRefundStatus("refunded")).toBe(true);
    expect(isRefundStatus("partial_refund")).toBe(true);
    expect(isRefundStatus("paid")).toBe(false);
    expect(isRefundStatus("cancelled")).toBe(false);
  });
});
