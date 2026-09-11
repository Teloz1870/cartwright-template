import { describe, it, expect, vi } from "vitest";
import { restockLines, type RestockLine } from "@/lib/orders/restock";

/**
 * Ordrestyring — tests for den delte variant-aware restock-helper. Den er
 * bevidst IKKE selv idempotent (kalderen ankrer idempotens: createOrder via
 * pending_payment-guarden, retur-flowet via Return.restocked inde i samme
 * $transaction). Her verificeres KUN den korrekte variant-vs-produkt-routing
 * og increment-mængder — det som begge kaldere afhænger af.
 */
function makeTx() {
  return {
    productVariant: { update: vi.fn().mockResolvedValue({}) },
    product: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe("restockLines", () => {
  it("routes variant lines to productVariant.stock", async () => {
    const tx = makeTx();
    const lines: RestockLine[] = [
      { productId: "p1", variantId: "v1", quantity: 3 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await restockLines(tx as any, lines);

    expect(tx.productVariant.update).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { stock: { increment: 3 } },
    });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("routes non-variant lines to product.stock", async () => {
    const tx = makeTx();
    const lines: RestockLine[] = [
      { productId: "p1", variantId: null, quantity: 2 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await restockLines(tx as any, lines);

    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stock: { increment: 2 } },
    });
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it("handles mixed lines, one update per line", async () => {
    const tx = makeTx();
    const lines: RestockLine[] = [
      { productId: "p1", variantId: "v1", quantity: 1 },
      { productId: "p2", variantId: null, quantity: 5 },
      { productId: "p3", variantId: "v3", quantity: 2 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await restockLines(tx as any, lines);

    expect(tx.productVariant.update).toHaveBeenCalledTimes(2);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for an empty line list", async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await restockLines(tx as any, []);
    expect(tx.productVariant.update).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
