import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Hul C (KILDE = session) — createOrderFromAcpSession (lib/orders/create-acp.ts).
 *
 * Denne funktion oprettes en Order fra en AcpCheckoutSession (server-til-server,
 * ingen cookie-kurv) EFTER at SPT allerede er opkrævet i lib/acp/complete.ts. Den
 * er en penge-sti-flade: den skriver en betalt ordre, dekrementerer lager atomisk
 * (anti-oversell), claimer sessionen atomisk (højst én ordre pr. session), og
 * håndterer race-taberen idempotent. complete.ts MOCKER den (spy) i sin egen test,
 * så dens ægte logik var upinnet — denne suite låser den.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    order: { create: vi.fn() },
    product: { updateMany: vi.fn() },
    productVariant: { updateMany: vi.fn() },
    discountCode: { updateMany: vi.fn() },
    acpCheckoutSession: { updateMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      acpCheckoutSession: { findUnique: vi.fn() },
      order: { update: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
    sendOrderConfirmation: vi.fn(),
  };
});

// AcpError stand-in (det ægte @/lib/acp er server-only + trækker brand.config +
// prisma/pricing/discount ind — vi genskaber kun fejl-typen create-acp.ts kaster,
// så vi kan assertere code + status uden at loade hele modulet).
vi.mock("@/lib/acp", () => {
  class AcpError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
      this.name = "AcpError";
    }
  }
  return { AcpError };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));

import { createOrderFromAcpSession } from "@/lib/orders/create-acp";
import { prisma } from "@/lib/db";
import { mailer } from "@/lib/mailer";

const findUniqueMock = prisma.acpCheckoutSession.findUnique as unknown as Mock;
const orderUpdateMock = prisma.order.update as unknown as Mock;
const transactionMock = prisma.$transaction as unknown as Mock;
const txOrderCreateMock = mocks.tx.order.create as unknown as Mock;
const txProductUpdateManyMock = mocks.tx.product.updateMany as unknown as Mock;
const txVariantUpdateManyMock =
  mocks.tx.productVariant.updateMany as unknown as Mock;
const txDiscountUpdateManyMock =
  mocks.tx.discountCode.updateMany as unknown as Mock;
const txSessionClaimMock =
  mocks.tx.acpCheckoutSession.updateMany as unknown as Mock;
const sendMailMock = mailer.sendOrderConfirmation as unknown as Mock;

/** En line-snapshot som createSession skriver til lineItemsJson. */
function line(overrides: Record<string, unknown> = {}) {
  return {
    id: "li-1",
    productId: "prod-1",
    variantId: null,
    slug: "solir-classic",
    sku: "SKU-1",
    name: "Solir Classic",
    quantity: 2,
    unitPriceDkk: 19900,
    ...overrides,
  };
}

/** En ready-for-payment AcpCheckoutSession-række (kilden). */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    status: "ready_for_payment",
    orderId: null,
    buyerEmail: "buyer@example.com",
    buyerPhone: "+4512345678",
    shippingName: "Kunde Jensen",
    shippingAddress: "Testvej 12",
    shippingZip: "1234",
    shippingCity: "Testby",
    subtotalDkk: 39800,
    shippingDkk: 4900,
    discountDkk: 0,
    totalDkk: 44700,
    currency: "dkk",
    discountCode: null,
    lineItemsJson: JSON.stringify([line()]),
    ...overrides,
  };
}

/** Fanger en AcpError-lignende kastet fejl og returnerer {code,status}. */
async function errOf(
  promise: Promise<unknown>,
): Promise<{ code?: string; status?: number; message: string } | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { code?: string; status?: number; message: string };
    return { code: err.code, status: err.status, message: err.message };
  }
}

const ARGS = { sessionId: "sess-1", paymentIntentId: "pi_123" };

describe("createOrderFromAcpSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(row());
    txOrderCreateMock.mockResolvedValue({ id: "order-abc" });
    txProductUpdateManyMock.mockResolvedValue({ count: 1 });
    txVariantUpdateManyMock.mockResolvedValue({ count: 1 });
    txDiscountUpdateManyMock.mockResolvedValue({ count: 1 });
    txSessionClaimMock.mockResolvedValue({ count: 1 });
    sendMailMock.mockResolvedValue(undefined);
    orderUpdateMock.mockResolvedValue({});
  });

  // ---- Guards (før nogen transaktion) ----

  it("kaster acp_session_not_found (404) når sessionen ikke findes", async () => {
    findUniqueMock.mockResolvedValue(null);
    const e = await errOf(createOrderFromAcpSession(ARGS));
    expect(e).toMatchObject({ code: "acp_session_not_found", status: 404 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("er idempotent: en session der allerede har en orderId returnerer den uden at oprette en dublet", async () => {
    findUniqueMock.mockResolvedValue(row({ orderId: "order-existing" }));
    const result = await createOrderFromAcpSession(ARGS);
    expect(result).toBe("order-existing");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(txOrderCreateMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("kaster acp_buyer_email_required (422) uden buyerEmail", async () => {
    findUniqueMock.mockResolvedValue(row({ buyerEmail: null }));
    const e = await errOf(createOrderFromAcpSession(ARGS));
    expect(e).toMatchObject({ code: "acp_buyer_email_required", status: 422 });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["shippingName", { shippingName: null }],
    ["shippingAddress", { shippingAddress: null }],
    ["shippingZip", { shippingZip: null }],
    ["shippingCity", { shippingCity: null }],
  ])(
    "kaster acp_fulfillment_address_required (422) når %s mangler",
    async (_field, patch) => {
      findUniqueMock.mockResolvedValue(row(patch));
      const e = await errOf(createOrderFromAcpSession(ARGS));
      expect(e).toMatchObject({
        code: "acp_fulfillment_address_required",
        status: 422,
      });
      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["tomt array", "[]"],
    ["ugyldig JSON", "{ not json"],
    ["ikke-array", '{"a":1}'],
    ["kun ugyldige entries", JSON.stringify([{ name: "x" }])],
  ])(
    "kaster acp_session_empty (422) når lineItemsJson er %s",
    async (_desc, raw) => {
      findUniqueMock.mockResolvedValue(row({ lineItemsJson: raw }));
      const e = await errOf(createOrderFromAcpSession(ARGS));
      expect(e).toMatchObject({ code: "acp_session_empty", status: 422 });
      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  // ---- Glad sti (produkt-linje) ----

  it("opretter en betalt ACP-ordre med korrekt snapshot + defaults", async () => {
    const result = await createOrderFromAcpSession(ARGS);

    expect(result).toBe("order-abc");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txOrderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "paid",
        paymentMethod: "acp_spt", // default når ikke angivet
        stripePaymentIntentId: "pi_123",
        email: "buyer@example.com",
        shippingName: "Kunde Jensen",
        shippingAddress: "Testvej 12",
        shippingZip: "1234",
        shippingCity: "Testby",
        phoneNumber: "+4512345678",
        subtotalDkk: 39800,
        shippingDkk: 4900,
        discountDkk: 0,
        totalDkk: 44700,
        currency: "DKK", // uppercased
        fxRate: 1,
        channel: "acp",
        acpSessionId: "sess-1",
        isAiGenerated: true,
        aiAgentSource: "acp",
        items: {
          create: [
            {
              productId: "prod-1",
              productName: "Solir Classic",
              unitPriceDkk: 19900,
              quantity: 2,
              variantId: null,
              variantSku: "SKU-1",
            },
          ],
        },
      }),
    });
  });

  it("dekrementerer produkt-lager atomisk med conditional stock>=qty WHERE", async () => {
    await createOrderFromAcpSession(ARGS);
    expect(txProductUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "prod-1", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(txVariantUpdateManyMock).not.toHaveBeenCalled();
  });

  it("claimer sessionen atomisk (ready_for_payment+orderId:null → completed)", async () => {
    await createOrderFromAcpSession(ARGS);
    expect(txSessionClaimMock).toHaveBeenCalledWith({
      where: { id: "sess-1", status: "ready_for_payment", orderId: null },
      data: { status: "completed", orderId: "order-abc" },
    });
  });

  it("sender ordrebekræftelse + stempler confirmationEmailSentAt post-commit", async () => {
    await createOrderFromAcpSession(ARGS);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-abc",
        email: "buyer@example.com",
        currency: "DKK",
        fxRate: 1,
        totalDkk: 44700,
      }),
    );
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: "order-abc" },
      data: { confirmationEmailSentAt: expect.any(Date) },
    });
  });

  it("bruger den angivne paymentMethod frem for default", async () => {
    await createOrderFromAcpSession({ ...ARGS, paymentMethod: "acp_wallet" });
    expect(txOrderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentMethod: "acp_wallet" }),
    });
  });

  it("filtrerer ugyldige line-entries fra før ordren skrives", async () => {
    findUniqueMock.mockResolvedValue(
      row({
        lineItemsJson: JSON.stringify([
          line(),
          { name: "mangler-productId" }, // filtreres bort af parseLines
        ]),
      }),
    );
    await createOrderFromAcpSession(ARGS);
    const created = txOrderCreateMock.mock.calls[0][0].data.items.create;
    expect(created).toHaveLength(1);
    expect(created[0].productId).toBe("prod-1");
  });

  // ---- Variant-linje ----

  it("dekrementerer variant-lager (ikke produkt) for en variant-linje", async () => {
    findUniqueMock.mockResolvedValue(
      row({
        lineItemsJson: JSON.stringify([
          line({ variantId: "var-9", sku: "SKU-9", quantity: 1 }),
        ]),
      }),
    );
    await createOrderFromAcpSession(ARGS);
    expect(txVariantUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "var-9", stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
    expect(txOrderCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject(
      { variantId: "var-9", variantSku: "SKU-9" },
    );
  });

  // ---- Anti-oversell ----

  it("afviser (OUT_OF_STOCK) når produkt-lageret er utilstrækkeligt", async () => {
    txProductUpdateManyMock.mockResolvedValue({ count: 0 });
    const e = await errOf(createOrderFromAcpSession(ARGS));
    expect(e?.message).toContain("OUT_OF_STOCK");
    // ordren claimede aldrig sessionen, og ingen mail blev sendt
    expect(txSessionClaimMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("afviser (OUT_OF_STOCK) når variant-lageret er utilstrækkeligt", async () => {
    findUniqueMock.mockResolvedValue(
      row({
        lineItemsJson: JSON.stringify([line({ variantId: "var-9", quantity: 5 })]),
      }),
    );
    txVariantUpdateManyMock.mockResolvedValue({ count: 0 });
    const e = await errOf(createOrderFromAcpSession(ARGS));
    expect(e?.message).toContain("OUT_OF_STOCK");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  // ---- Rabatkode ----

  it("øger usageCount når sessionen bærer en rabatkode", async () => {
    findUniqueMock.mockResolvedValue(row({ discountCode: "SOMMER10" }));
    await createOrderFromAcpSession(ARGS);
    expect(txDiscountUpdateManyMock).toHaveBeenCalledWith({
      where: { code: "SOMMER10" },
      data: { usageCount: { increment: 1 } },
    });
  });

  it("rører ikke discountCode når sessionen ingen kode har", async () => {
    await createOrderFromAcpSession(ARGS);
    expect(txDiscountUpdateManyMock).not.toHaveBeenCalled();
  });

  // ---- Race (samtidig /complete) ----

  it("returnerer vinderens orderId når claim-racet tabes (ACP_ALREADY_COMPLETED)", async () => {
    txSessionClaimMock.mockResolvedValue({ count: 0 }); // en anden vandt flippet
    // recovery-læsningen (2. findUnique) ser vinderens ordre
    findUniqueMock
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ orderId: "order-winner" });
    const result = await createOrderFromAcpSession(ARGS);
    expect(result).toBe("order-winner");
    // vi returnerer FØR mail-blokken → taberen sender ikke en dobbelt-mail
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("re-kaster når claim-racet tabes men recovery-læsningen ikke finder en orderId", async () => {
    txSessionClaimMock.mockResolvedValue({ count: 0 });
    findUniqueMock
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ orderId: null });
    const e = await errOf(createOrderFromAcpSession(ARGS));
    expect(e?.message).toBe("ACP_ALREADY_COMPLETED");
  });

  // ---- Mail-robusthed ----

  it("swallower mail-fejl efter commit og returnerer stadig orderId", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sendMailMock.mockRejectedValue(new Error("SMTP nede"));

    const result = await createOrderFromAcpSession(ARGS);

    expect(result).toBe("order-abc");
    // order.update (confirmationEmailSentAt) nås aldrig når mail kaster
    expect(orderUpdateMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
