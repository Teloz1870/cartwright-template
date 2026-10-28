import { describe, expect, it, vi } from "vitest";

/**
 * Some tools hand a Prisma row to their caller as it comes — `orders.get`
 * returns `findUnique({ include: { items: true } })`, `gdpr.export_user`
 * returns whole orders, leads and reviews. Their output schemas are STRICT,
 * and the MCP route validates every result against them, so a column the
 * schema does not list rejects the whole answer: an unknown key fails even
 * when its value is null.
 *
 * That made every schema change a silent break of these tools. Schema batch A
 * added five Order columns and `OrderItem.sku`, and `orders.get` would have
 * failed for every order; `Lead.source`/`data` (v0.58.0) had already done the
 * same to `gdpr.export_user` for any customer with an inquiry. tsc cannot see
 * it (`output` is a ZodType) and the REST path does not validate output.
 *
 * So pin it: each whole-row schema lists exactly the model's scalar fields.
 * Add a column, and this fails until the schema says what the tool returns.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { Prisma } from "@/app/generated/prisma/client";
import { getOrder } from "@/lib/tools/orders";
import { exportUserTool } from "@/lib/tools/gdpr";

type Shaped = { shape: Record<string, unknown> };
type Arrayed = { element: unknown };
const keys = (schema: unknown, ...drop: string[]) =>
  Object.keys((schema as Shaped).shape)
    .filter((k) => !drop.includes(k))
    .sort();
const element = (schema: unknown) => (schema as Arrayed).element;
const fields = (e: Record<string, string>) => Object.keys(e).sort();

describe("whole-row tool outputs list exactly the model's columns", () => {
  it("orders.get: the order and its lines", () => {
    const order = getOrder.output as unknown as Shaped;
    expect(keys(order, "items")).toEqual(fields(Prisma.OrderScalarFieldEnum));
    expect(keys(element(order.shape.items))).toEqual(fields(Prisma.OrderItemScalarFieldEnum));
  });

  it("gdpr.export_user: orders, lines, guest orders, reviews, subscriptions, carts, leads, ACP sessions", () => {
    const out = (exportUserTool.output as unknown as Shaped).shape;
    const orders = element(out.orders) as Shaped;
    expect(keys(orders, "items")).toEqual(fields(Prisma.OrderScalarFieldEnum));
    expect(keys(element(orders.shape.items))).toEqual(fields(Prisma.OrderItemScalarFieldEnum));
    expect(keys(element(out.guestOrdersSameEmail))).toEqual(fields(Prisma.OrderScalarFieldEnum));
    expect(keys(element(out.reviews))).toEqual(fields(Prisma.ProductReviewScalarFieldEnum));
    expect(keys(element(out.subscriptions))).toEqual(fields(Prisma.SubscriptionScalarFieldEnum));
    expect(keys(element(out.carts))).toEqual(fields(Prisma.CartScalarFieldEnum));
    expect(keys(element(out.leads))).toEqual(fields(Prisma.LeadScalarFieldEnum));
    expect(keys(element(out.acpCheckoutSessions))).toEqual(
      fields(Prisma.AcpCheckoutSessionScalarFieldEnum),
    );
  });

  it("the nullable product key on an order line is nullable in both schemas", () => {
    const line = { productId: null, sku: null };
    const ordersLine = element((getOrder.output as unknown as Shaped).shape.items) as Shaped;
    const gdprLine = element(
      (element((exportUserTool.output as unknown as Shaped).shape.orders) as Shaped).shape.items,
    ) as Shaped;
    for (const s of [ordersLine, gdprLine]) {
      for (const [k, v] of Object.entries(line)) {
        expect((s.shape[k] as { safeParse: (x: unknown) => { success: boolean } }).safeParse(v).success).toBe(true);
      }
    }
  });
});
