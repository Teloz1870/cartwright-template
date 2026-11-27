/**
 * DRØM146-a — the admin order actions on a configured Resend that fails. The
 * real lib/mailer.ts runs (only the Resend adapter is a stand-in), so a failed
 * send now reaches these actions instead of turning into a preview file:
 *
 * - "Resend receipt" and "Send shipping notification" answer with an error and
 *   write no "sent" note, because the customer got nothing.
 * - Receiving a return and refunding one still succeed: the stock and the
 *   money moved, and the mail after them is best-effort.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    return: { findUnique: vi.fn(), update: vi.fn() },
    orderNote: { create: vi.fn(), findMany: vi.fn() },
    returnItem: { findMany: vi.fn() },
    productVariant: { update: vi.fn() },
    product: { update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      order: { findUnique: vi.fn() },
      orderNote: { create: vi.fn() },
      return: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
      ),
    },
    resendOrderConfirmation: vi.fn(),
    resendRaw: vi.fn(),
    createRefund: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/audit", () => ({
  withAudit: (_meta: unknown, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/stripe", () => ({ createRefund: mocks.createRefund }));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/mailer/resend", () => ({
  shouldUseResend: async () => true,
  ResendMailer: class {
    sendOrderConfirmation = mocks.resendOrderConfirmation;
    sendRaw = mocks.resendRaw;
  },
}));

import {
  receiveAndRestock,
  refundReturn,
  resendConfirmation,
  sendShippingNotification,
} from "@/app/admin/ordrer/actions";

const DOWN = new Error("Resend error: domain not verified");

const ORDER = {
  id: "order-1",
  status: "paid",
  email: "kunde@example.test",
  shippingName: "Kunde",
  items: [{ productName: "Plank", quantity: 2, unitPriceDkk: 10000 }],
  subtotalDkk: 20000,
  discountDkk: 0,
  shippingDkk: 4900,
  totalDkk: 24900,
  currency: "DKK",
  fxRate: 1,
  carrier: "GLS",
  trackingNumber: "Z9",
  trackingUrl: null,
  stripePaymentIntentId: "pi_1",
};

let cwd: string;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resendOrderConfirmation.mockReset().mockRejectedValue(DOWN);
  mocks.resendRaw.mockReset().mockRejectedValue(DOWN);
  mocks.prisma.order.findUnique.mockResolvedValue(ORDER);
  mocks.prisma.orderNote.create.mockResolvedValue({});
  mocks.prisma.return.update.mockResolvedValue({});
  mocks.tx.orderNote.findMany.mockResolvedValue([]);
  mocks.tx.returnItem.findMany.mockResolvedValue([]);
  mocks.tx.product.update.mockResolvedValue({});
  mocks.tx.productVariant.update.mockResolvedValue({});
  mocks.createRefund.mockResolvedValue({ refundId: "re_1" });
  cwd = mkdtempSync(join(tmpdir(), "cw-mail-"));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

const noPreview = () => expect(existsSync(join(cwd, ".mail-previews"))).toBe(false);
// Every one of these actions drops the error (an empty catch, or `.catch(() => {})`
// for the best-effort return mails), so the server log is the only place
// Resend's own reason ("domain not verified", "rate limited") is left.
const logged = () =>
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[mailer] Resend"), DOWN);

describe("admin order actions, when Resend fails", () => {
  it("Resend receipt answers with an error and notes nothing as resent", async () => {
    expect(await resendConfirmation("order-1")).toEqual({ ok: false, error: "Could not send receipt" });
    expect(mocks.resendOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.orderNote.create).not.toHaveBeenCalled();
    noPreview();
    logged();
  });

  it("Send shipping notification answers with an error and notes nothing as sent", async () => {
    expect(await sendShippingNotification("order-1")).toEqual({
      ok: false,
      error: "Could not send shipping notification",
    });
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.orderNote.create).not.toHaveBeenCalled();
    noPreview();
    logged();
  });

  it("receiving a return still succeeds: the stock moved, the mail is best-effort", async () => {
    mocks.tx.return.findUnique.mockResolvedValue({
      id: "ret-1",
      orderId: "order-1",
      restocked: false,
      status: "approved",
      items: [
        {
          productName: "Plank",
          quantity: 1,
          variantId: null,
          orderItemId: "line-1",
          orderItem: { productId: "prod-1", quantity: 2 },
        },
      ],
      order: { id: "order-1", email: ORDER.email, shippingName: ORDER.shippingName, status: "paid", paidAt: new Date() },
    });

    expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    noPreview();
    logged();
  });

  it("refunding a return still succeeds: the money moved, the mail is best-effort", async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({
      id: "ret-1",
      status: "received",
      order: {
        id: "order-1",
        email: ORDER.email,
        shippingName: ORDER.shippingName,
        stripePaymentIntentId: "pi_1",
        totalDkk: ORDER.totalDkk,
        fxRate: 1,
      },
    });

    expect(await refundReturn("ret-1", 1000)).toEqual({ ok: true });
    expect(mocks.createRefund).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.return.update).toHaveBeenCalledTimes(1);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    noPreview();
    logged();
  });
});
