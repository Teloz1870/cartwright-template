/**
 * DRØM146-a — with Resend configured, a failed send is an error the caller
 * sees, not a file in `.mail-previews/`. Without Resend (dev) the preview file
 * is written exactly as before.
 *
 * The real lib/mailer.ts runs here; only the Resend adapter is a stand-in. The
 * three library callers below run for real on top of it, so the chain "Resend
 * rejects → the caller records nothing as sent" is pinned end to end. The
 * admin actions are in ./orders/actions-mail-failure.test.ts; the four paid
 * paths (Stripe webhook, reconcile cron, ACP, mock checkout) answer and mark the
 * order paid on a rejected receipt in ./on-order-paid-replay-db.test.ts.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useResend: true,
  resendOrderConfirmation: vi.fn(),
  resendRaw: vi.fn(),
  orderUpdate: vi.fn(),
  orderNoteCreate: vi.fn(),
  getBrand: vi.fn(),
}));

vi.mock("@/lib/mailer/resend", () => ({
  shouldUseResend: async () => mocks.useResend,
  ResendMailer: class {
    sendOrderConfirmation = mocks.resendOrderConfirmation;
    sendRaw = mocks.resendRaw;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    order: { update: mocks.orderUpdate },
    orderNote: { create: mocks.orderNoteCreate },
  },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: (_meta: unknown, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/orders/paid-hooks", () => ({ schedulePaidOrderHooks: vi.fn() }));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: vi.fn(),
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));

import {
  mailer,
  sendOwnerNewOrderEmail,
  sendRefundConfirmationEmail,
  sendReturnReceivedEmail,
  sendShippingNotificationEmail,
  type OrderEmailData,
} from "@/lib/mailer";
import { onOrderPaid } from "@/lib/orders/on-paid";
import { notifyOwnerOfPaidOrder } from "@/lib/orders/notify-owner";
import { notifyShipped } from "@/lib/orders/tracking";

const ORDER: OrderEmailData = {
  orderId: "ord_drm146a",
  email: "buyer@shop.example.test",
  shippingName: "Buyer",
  items: [{ productName: "Plank", quantity: 2, unitPriceDkk: 10000 }],
  subtotalDkk: 20000,
  discountDkk: 0,
  shippingDkk: 4900,
  totalDkk: 24900,
};
const SHIPPED = {
  orderId: ORDER.orderId,
  email: ORDER.email,
  shippingName: ORDER.shippingName,
  carrier: "GLS",
  trackingNumber: "Z9",
  trackingUrl: null,
  items: [{ productName: "Plank", quantity: 2 }],
};
const DOWN = new Error("Resend error: domain not verified");

const SENDERS = [
  ["shipping notification", () => sendShippingNotificationEmail(SHIPPED)],
  [
    "refund confirmation",
    () => sendRefundConfirmationEmail({ ...SHIPPED, refundDkk: 1000, partial: true }),
  ],
  ["return received", () => sendReturnReceivedEmail(SHIPPED)],
  [
    "owner new order",
    () => sendOwnerNewOrderEmail({ ...ORDER, to: "owner@shop.example.test", adminUrl: null }),
  ],
] as const;

let cwd: string;
let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useResend = true;
  mocks.resendOrderConfirmation.mockReset().mockRejectedValue(DOWN);
  mocks.resendRaw.mockReset().mockRejectedValue(DOWN);
  mocks.orderUpdate.mockReset().mockResolvedValue({});
  mocks.orderNoteCreate.mockReset().mockResolvedValue({});
  mocks.getBrand.mockReset().mockResolvedValue({
    features: { ownerOrderEmail: true },
    emails: { admin: "owner@shop.example.test" },
    url: "https://shop.example.test",
  });
  // PreviewMailer writes under process.cwd(): point it at an empty directory.
  cwd = mkdtempSync(join(tmpdir(), "cw-mail-"));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

const previews = () => {
  const dir = join(cwd, ".mail-previews");
  return existsSync(dir) ? readdirSync(dir) : [];
};

describe("Resend configured and failing: the error reaches the caller", () => {
  it("the receipt rejects with Resend's error and writes no preview file", async () => {
    await expect(mailer.sendOrderConfirmation(ORDER)).rejects.toBe(DOWN);
    expect(mocks.resendOrderConfirmation).toHaveBeenCalledExactlyOnceWith(ORDER);
    expect(previews()).toEqual([]);
  });

  it.each(SENDERS)("the %s rejects with Resend's error and writes no preview file", async (_name, send) => {
    await expect(send()).rejects.toBe(DOWN);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    expect(previews()).toEqual([]);
  });

  it("a send Resend accepts writes no preview file either", async () => {
    mocks.resendOrderConfirmation.mockResolvedValue(undefined);
    mocks.resendRaw.mockResolvedValue(undefined);
    await mailer.sendOrderConfirmation(ORDER);
    for (const [, send] of SENDERS) await send();
    expect(previews()).toEqual([]);
  });
});

describe("no Resend (dev): the preview file, exactly as before", () => {
  it("the receipt and every order mail land in .mail-previews/ and resolve", async () => {
    mocks.useResend = false;
    // The preview name is `mail-<Date.now()>-<to>`: one tick per send, so two
    // sends to the same address in one millisecond do not share a file here.
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => ++now);
    await mailer.sendOrderConfirmation(ORDER);
    for (const [, send] of SENDERS) await send();

    const files = previews().sort();
    expect(files).toHaveLength(5);
    expect(files).toContain(`order-${ORDER.orderId}.html`);
    expect(files.filter((f) => /^mail-\d+-.+\.html$/.test(f))).toHaveLength(4);
    expect(readFileSync(join(cwd, ".mail-previews", `order-${ORDER.orderId}.html`), "utf8")).toContain(
      "Plank",
    );
    expect(mocks.resendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.resendRaw).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalled();
  });
});

describe("the library callers, on a failing Resend", () => {
  it("onOrderPaid resolves, logs the failure and leaves confirmationEmailSentAt unset", async () => {
    await expect(
      onOrderPaid({
        order: ORDER,
        receiptSentAt: null,
        emitOrderPlaced: false,
        receiptFailureLog: "[path] receipt failed",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.orderUpdate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[path] receipt failed", DOWN);
    expect(previews()).toEqual([]);
  });

  it("notifyOwnerOfPaidOrder resolves (a failed owner mail never fails a payment)", async () => {
    await expect(notifyOwnerOfPaidOrder(ORDER)).resolves.toBeUndefined();
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    expect(previews()).toEqual([]);
  });

  it("notifyShipped answers false and writes no 'notification sent' note", async () => {
    const ok = await notifyShipped({ id: ORDER.orderId, ...SHIPPED }, "user:admin-1");
    expect(ok).toBe(false);
    expect(mocks.orderNoteCreate).not.toHaveBeenCalled();
    expect(previews()).toEqual([]);
  });
});
