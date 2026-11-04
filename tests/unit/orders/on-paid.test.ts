/**
 * ORD0-a — onOrderPaid (lib/orders/on-paid.ts), the one door for what follows an
 * order becoming paid. This file pins what the door itself does, and walks the
 * disk to pin that nothing else does it. The four paths that call it run end to
 * end, on a real database, in ../on-order-paid-replay-db.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  steps: [] as string[],
  sendOrderConfirmation: vi.fn(),
  orderUpdate: vi.fn(),
  notifyOwnerOfPaidOrder: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { order: { update: mocks.orderUpdate } } }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));
vi.mock("@/lib/orders/notify-owner", () => ({
  notifyOwnerOfPaidOrder: mocks.notifyOwnerOfPaidOrder,
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: mocks.emitMarketingEvent,
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));

import { onOrderPaid, orderMailData, type OnOrderPaidInput } from "@/lib/orders/on-paid";

const ORDER: OnOrderPaidInput["order"] = {
  orderId: "ord_1",
  email: "buyer@shop.example.test",
  shippingName: "Buyer",
  items: [
    { productName: "Plank", quantity: 2, unitPriceDkk: 10000 },
    { productName: "Post", quantity: 1, unitPriceDkk: 5000 },
  ],
  subtotalDkk: 25000,
  discountDkk: 1000,
  shippingDkk: 4900,
  totalDkk: 28900,
  currency: "EUR",
  fxRate: 0.134,
};

const LOG_LINE = "[path] the receipt failed";

function input(over: Partial<OnOrderPaidInput> = {}): OnOrderPaidInput {
  return {
    order: ORDER,
    receiptSentAt: null,
    emitOrderPlaced: false,
    receiptFailureLog: LOG_LINE,
    ...over,
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.steps.length = 0;
  mocks.emitMarketingEvent.mockReset().mockImplementation(async () => {
    mocks.steps.push("event");
    return false;
  });
  mocks.sendOrderConfirmation.mockReset().mockImplementation(async () => {
    mocks.steps.push("receipt");
  });
  mocks.orderUpdate.mockReset().mockImplementation(async () => {
    mocks.steps.push("stamp");
    return {};
  });
  mocks.notifyOwnerOfPaidOrder.mockReset().mockImplementation(async () => {
    mocks.steps.push("owner mail");
  });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("onOrderPaid", () => {
  it("fires in today's order: the event, the receipt, its stamp, the owner mail", async () => {
    await onOrderPaid(input({ emitOrderPlaced: true }));
    expect(mocks.steps).toEqual(["event", "receipt", "stamp", "owner mail"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("the receipt and the owner mail say the same thing: what the path gave it", async () => {
    await onOrderPaid(input());
    expect(mocks.sendOrderConfirmation).toHaveBeenCalledExactlyOnceWith(ORDER);
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledExactlyOnceWith(ORDER);
  });

  it("stamps the order it was given, and only that column", async () => {
    await onOrderPaid(input());
    expect(mocks.orderUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: "ord_1" },
      data: { confirmationEmailSentAt: expect.any(Date) },
    });
  });

  it("emitOrderPlaced: the post-purchase event, with the payload it has always had", async () => {
    await onOrderPaid(input({ emitOrderPlaced: true }));
    expect(mocks.emitMarketingEvent).toHaveBeenCalledExactlyOnceWith(
      "cartwright.order.placed",
      "buyer@shop.example.test",
      { orderId: "ord_1", totalDkk: 28900, currency: "EUR", itemCount: 2 },
    );
  });

  it("without emitOrderPlaced: no event, the mails still go", async () => {
    await onOrderPaid(input({ emitOrderPlaced: false }));
    expect(mocks.steps).toEqual(["receipt", "stamp", "owner mail"]);
  });

  it("the event is not awaited: one that never settles holds nothing up", async () => {
    mocks.emitMarketingEvent.mockImplementation(() => new Promise(() => {}));
    await onOrderPaid(input({ emitOrderPlaced: true }));
    expect(mocks.steps).toEqual(["receipt", "stamp", "owner mail"]);
  });

  it("receiptSentAt set: no second receipt and no new stamp, the owner still hears", async () => {
    await onOrderPaid(input({ receiptSentAt: new Date("2026-10-01T10:00:00Z") }));
    expect(mocks.steps).toEqual(["owner mail"]);
  });

  it("a failed receipt: the path's own log line, no stamp, the owner still hears, no throw", async () => {
    const down = new Error("mail provider down");
    mocks.sendOrderConfirmation.mockRejectedValue(down);
    await expect(onOrderPaid(input())).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(LOG_LINE, down);
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledTimes(1);
  });

  it("a failed stamp: the same log line, the owner still hears, no throw", async () => {
    const down = new Error("db down");
    mocks.orderUpdate.mockRejectedValue(down);
    await expect(onOrderPaid(input())).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(LOG_LINE, down);
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledTimes(1);
  });
});

describe("orderMailData — an order read back from the database", () => {
  it("names the order's own fields and drops the rest of the row", () => {
    const data = orderMailData({
      id: "ord_1",
      email: "buyer@shop.example.test",
      shippingName: "Buyer",
      items: [
        { productName: "Plank", quantity: 2, unitPriceDkk: 10000 },
        { productName: "Post", quantity: 1, unitPriceDkk: 5000 },
      ].map((line) => ({ ...line, variantSku: "ROW-ONLY", orderId: "ord_1" })),
      subtotalDkk: 25000,
      discountDkk: 1000,
      shippingDkk: 4900,
      totalDkk: 28900,
      currency: "EUR",
      fxRate: 0.134,
      ...{ shippingAddress: "ROW-ONLY", status: "paid" },
    });
    expect(data).toEqual(ORDER);
  });
});

/**
 * The bar this slice exists for: a fifth path (PAY-F1's Frisbii webhook) cannot
 * bring its own copy of these without this going red. Walks the disk, so it
 * holds in a scaffold, which has no git.
 */
describe("one door — nothing but lib/orders/on-paid.ts fires what follows a paid order", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const DOOR = "lib/orders/on-paid.ts";
  const PATHS = [
    "app/api/cron/reconcile-stripe/route.ts",
    "app/api/webhook/stripe/route.ts",
    "lib/orders/create-acp.ts",
    "lib/orders/create.ts",
  ];

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  function sourceFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "generated" || entry.name === "node_modules" ? [] : sourceFiles(path);
      }
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const SOURCES = ["app", "components", "lib", "plugins"]
    .flatMap((dir) => sourceFiles(join(ROOT, dir)))
    .map((path) => ({
      file: relative(ROOT, path).split(sep).join("/"),
      code: stripComments(readFileSync(path, "utf8")),
    }));

  const filesMatching = (pattern: RegExp) =>
    SOURCES.filter(({ code }) => pattern.test(code))
      .map(({ file }) => file)
      .sort();

  it.each([
    ["its stamp", /confirmationEmailSentAt: new Date\(\)/],
    ["the owner mail", /(?<!function )\bnotifyOwnerOfPaidOrder\(/],
    ["the post-purchase event", /MARKETING_EVENTS\.orderPlaced/],
  ])("%s is fired from the door alone", (_what, pattern) => {
    expect(filesMatching(pattern)).toEqual([DOOR]);
  });

  it("the receipt too, apart from the operator's resend button", () => {
    // resendConfirmation is not a paid path: an operator asks for another copy
    // of a receipt, so it stamps nothing and the owner hears nothing.
    expect(filesMatching(/\bmailer\.sendOrderConfirmation\(/)).toEqual([
      "app/admin/ordrer/actions.ts",
      DOOR,
    ]);
  });

  it("the four paths each call the door", () => {
    expect(filesMatching(/\bawait onOrderPaid\(/)).toEqual(PATHS);
  });

  it("a file that writes status \"paid\" calls the door", () => {
    // lib/tools/orders.ts only has it as an example in a tool description. Mock
    // mode writes `status: initialStatus`, so the test above covers it instead.
    const writers = filesMatching(/\bstatus: "paid"/).filter((file) => file !== "lib/tools/orders.ts");
    const callers = filesMatching(/\bawait onOrderPaid\(/);
    expect(writers.length, "the pattern still finds the writers").toBeGreaterThan(0);
    expect(writers.filter((file) => !callers.includes(file))).toEqual([]);
  });
});
