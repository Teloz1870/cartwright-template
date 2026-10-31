import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * And it takes null exactly where the column can hold null: a nullable column
 * arrives empty on every row a shop already has, so a `z.string()` there is the
 * same break with the key spelled right.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { Prisma } from "@/app/generated/prisma/client";
import { getOrder } from "@/lib/tools/orders";
import { exportUserTool } from "@/lib/tools/gdpr";
import { listSubscriptions } from "@/lib/tools/subscriptions";

type Shaped = { shape: Record<string, unknown> };
type Arrayed = { element: unknown };
const keys = (schema: unknown, ...drop: string[]) =>
  Object.keys((schema as Shaped).shape)
    .filter((k) => !drop.includes(k))
    .sort();
const element = (schema: unknown) => (schema as Arrayed).element;
const fields = (e: Record<string, string>) => Object.keys(e).sort();

const prismaSchema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
/** What prisma/schema.prisma types `T?`. A relation matches too; only a schema's columns are looked up in it. */
function nullable(model: string): Set<string> {
  const body = new RegExp(`^model ${model} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(prismaSchema)?.[1];
  if (!body) throw new Error(`no model ${model} in prisma/schema.prisma`);
  return new Set([...body.matchAll(/^\s+(\w+)\s+\w+\?/gm)].map((m) => m[1]));
}

const ordersGet = getOrder.output as unknown as Shaped;
const exported = (exportUserTool.output as unknown as Shaped).shape;
const exportedOrder = element(exported.orders) as Shaped;
const ROW_OUTPUTS: [string, unknown, string][] = [
  ["orders.get", ordersGet, "Order"],
  ["orders.get lines", element(ordersGet.shape.items), "OrderItem"],
  ["gdpr.export_user subject", exported.subject, "User"],
  ["gdpr.export_user orders", exportedOrder, "Order"],
  ["gdpr.export_user lines", element(exportedOrder.shape.items), "OrderItem"],
  ["gdpr.export_user guest orders", element(exported.guestOrdersSameEmail), "Order"],
  ["gdpr.export_user reviews", element(exported.reviews), "ProductReview"],
  ["gdpr.export_user subscriptions", element(exported.subscriptions), "Subscription"],
  ["gdpr.export_user carts", element(exported.carts), "Cart"],
  ["gdpr.export_user leads", element(exported.leads), "Lead"],
  ["gdpr.export_user ACP sessions", element(exported.acpCheckoutSessions), "AcpCheckoutSession"],
  ["subscriptions.list", element(listSubscriptions.output), "Subscription"],
];

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

  it("subscriptions.list: the subscription, with its user beside it", () => {
    expect(keys(element(listSubscriptions.output), "user")).toEqual(fields(Prisma.SubscriptionScalarFieldEnum));
  });

  it.each(ROW_OUTPUTS)("%s takes null exactly where the column can hold it", (_name, schema, model) => {
    const columns = keys(schema, "items", "user");
    const field = (c: string) => (schema as Shaped).shape[c] as { safeParse: (x: unknown) => { success: boolean } };
    expect(columns.filter((c) => field(c).safeParse(null).success)).toEqual(columns.filter((c) => nullable(model).has(c)));
  });
});
