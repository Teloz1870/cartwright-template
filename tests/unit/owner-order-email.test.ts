/**
 * GAP1 — the owner gets an e-mail when an order is paid (flag ownerOrderEmail).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  sendOwnerNewOrderEmail: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  sendOwnerNewOrderEmail: mocks.sendOwnerNewOrderEmail,
}));

import { notifyOwnerOfPaidOrder } from "@/lib/orders/notify-owner";
import { renderOwnerNewOrderHtml } from "@/lib/mailer";

const order = {
  orderId: "ckorder123456",
  email: "kunde@example.dk",
  shippingName: "Kunde",
  items: [{ productName: "Plank", quantity: 2, unitPriceDkk: 10000 }],
  subtotalDkk: 20000,
  discountDkk: 0,
  shippingDkk: 0,
  totalDkk: 20000,
};

function brandWith(features: Record<string, boolean>, admin = "owner@shop.dk", url = "https://shop.dk") {
  return { features, emails: { admin }, url };
}

describe("notifyOwnerOfPaidOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends nothing while the flag is off (the default)", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ ownerOrderEmail: false }));
    await notifyOwnerOfPaidOrder(order);
    expect(mocks.sendOwnerNewOrderEmail).not.toHaveBeenCalled();
  });

  it("mails emails.admin with a link to the order when the flag is on", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ ownerOrderEmail: true }));
    await notifyOwnerOfPaidOrder(order);
    expect(mocks.sendOwnerNewOrderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendOwnerNewOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@shop.dk",
        orderId: "ckorder123456",
        adminUrl: "https://shop.dk/admin/ordrer/ckorder123456",
      }),
    );
  });

  it("leaves the link out when the shop URL is not http(s)", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ ownerOrderEmail: true }, "owner@shop.dk", "javascript:alert(1)"));
    await notifyOwnerOfPaidOrder(order);
    expect(mocks.sendOwnerNewOrderEmail).toHaveBeenCalledWith(expect.objectContaining({ adminUrl: null }));
  });

  it("sends nothing without an admin address", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ ownerOrderEmail: true }, "  "));
    await notifyOwnerOfPaidOrder(order);
    expect(mocks.sendOwnerNewOrderEmail).not.toHaveBeenCalled();
  });

  it("never throws — a failed owner mail must not fail the payment", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ ownerOrderEmail: true }));
    mocks.sendOwnerNewOrderEmail.mockRejectedValue(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyOwnerOfPaidOrder(order)).resolves.toBeUndefined();
    mocks.getBrand.mockRejectedValue(new Error("db down"));
    await expect(notifyOwnerOfPaidOrder(order)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("renderOwnerNewOrderHtml", () => {
  it("escapes what the customer typed", () => {
    const html = renderOwnerNewOrderHtml({
      ...order,
      shippingName: '<img src=x onerror="alert(1)">',
      items: [{ productName: "<script>x</script>", quantity: 1, unitPriceDkk: 100 }],
      to: "owner@shop.dk",
      adminUrl: null,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("Open the order in admin");
  });

  it("links the order when an admin URL is given", () => {
    const html = renderOwnerNewOrderHtml({ ...order, to: "o@s.dk", adminUrl: "https://shop.dk/admin/ordrer/x" });
    expect(html).toContain('href="https://shop.dk/admin/ordrer/x"');
  });
});

describe("wiring — every checkout path sends the owner mail once, after the receipt", () => {
  // The webhook is exercised end to end in stripe-webhook.test.ts; these three
  // paths are pinned at the source so removing or reordering a call goes red.
  const PATHS = [
    "app/api/webhook/stripe/route.ts",
    "app/api/cron/reconcile-stripe/route.ts",
    "lib/orders/create.ts",
    "lib/orders/create-acp.ts",
  ];
  for (const file of PATHS) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      const calls = src.split("await notifyOwnerOfPaidOrder(").length - 1;
      expect(calls, "one owner-mail call").toBe(1);
      expect(src.indexOf("await notifyOwnerOfPaidOrder(")).toBeGreaterThan(
        src.lastIndexOf("mailer.sendOrderConfirmation("),
      );
    });
  }

  it("the reconcile cron flips to paid only from pending_payment", () => {
    const src = readFileSync("app/api/cron/reconcile-stripe/route.ts", "utf8");
    expect(src).toMatch(/updateMany\(\{\s*where: \{ id: order\.id, status: "pending_payment" \}/);
    expect(src).toMatch(/if \(flipped\.count === 0\)/);
  });
});
