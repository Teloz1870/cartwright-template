import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A return's refund is typed in the shop's base currency. Stripe takes the currency
 * the customer was charged in, so an order charged in EUR needs the order's own
 * snapshotted rate, as issueRefund already does.
 */

const mocks = vi.hoisted(() => ({
  findReturn: vi.fn(),
  updateReturn: vi.fn((args: unknown) => args),
  createNote: vi.fn((args: unknown) => args),
  createRefund: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin-1" } }) }));
vi.mock("@/lib/audit", () => ({
  withAudit: async (_meta: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    return: { findUnique: mocks.findReturn, update: mocks.updateReturn },
    orderNote: { create: mocks.createNote },
    $transaction: async (writes: unknown[]) => writes,
  },
}));
vi.mock("@/lib/stripe", () => ({ createRefund: mocks.createRefund }));
vi.mock("@/lib/mailer", () => ({
  mailer: {},
  sendShippingNotificationEmail: vi.fn(),
  sendReturnReceivedEmail: vi.fn(),
  sendRefundConfirmationEmail: mocks.sendRefundConfirmationEmail,
}));

import { refundReturn } from "@/app/admin/ordrer/actions";

function returnOn(order: { totalDkk: number; fxRate: number }) {
  return {
    id: "ret-1",
    order: {
      id: "ord-1",
      email: "kunde@example.test",
      shippingName: "Ada Testesen",
      stripePaymentIntentId: "pi_1",
      ...order,
    },
  };
}

describe("refundReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts to the charge currency for Stripe and keeps base currency everywhere else", async () => {
    mocks.findReturn.mockResolvedValue(returnOn({ totalDkk: 100000, fxRate: 0.134 }));
    mocks.createRefund.mockResolvedValue({ refundId: "re_1", amount: 1340, status: "succeeded" });

    await expect(refundReturn("ret-1", 10000)).resolves.toEqual({ ok: true });

    expect(mocks.createRefund.mock.calls[0][0]).toMatchObject({ amountOere: 1340 });
    expect(mocks.updateReturn.mock.calls[0][0]).toMatchObject({
      data: { status: "refunded", refundDkk: 10000, stripeRefundId: "re_1" },
    });
    expect(JSON.stringify(mocks.createNote.mock.calls[0][0])).toMatch(/100[,.]00|100 kr/);
    expect(mocks.sendRefundConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ refundDkk: 10000, partial: true }),
    );
  });

  it("calls a full refund full, though the charge currency's figure is smaller", async () => {
    mocks.findReturn.mockResolvedValue(returnOn({ totalDkk: 100000, fxRate: 0.134 }));
    mocks.createRefund.mockResolvedValue({ refundId: "re_4", amount: 13400, status: "succeeded" });

    await refundReturn("ret-1", 100000);

    expect(mocks.sendRefundConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ refundDkk: 100000, partial: false }),
    );
  });

  it("rounds to a whole minor unit", async () => {
    mocks.findReturn.mockResolvedValue(returnOn({ totalDkk: 100000, fxRate: 0.1341 }));
    mocks.createRefund.mockResolvedValue({ refundId: "re_2", amount: 13, status: "succeeded" });

    await refundReturn("ret-1", 99);

    expect(mocks.createRefund.mock.calls[0][0]).toMatchObject({ amountOere: 13 });
  });

  it("sends the typed amount unchanged on an order charged in base currency", async () => {
    mocks.findReturn.mockResolvedValue(returnOn({ totalDkk: 10000, fxRate: 1 }));
    mocks.createRefund.mockResolvedValue({ refundId: "re_3", amount: 10000, status: "succeeded" });

    await refundReturn("ret-1", 10000);

    expect(mocks.createRefund.mock.calls[0][0]).toMatchObject({ amountOere: 10000 });
    expect(mocks.sendRefundConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ refundDkk: 10000, partial: false }),
    );
  });
});
