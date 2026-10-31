import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { PrismaClient } from "@/app/generated/prisma/client";
import { anonymizeCustomer } from "@/lib/gdpr/erase";
import { exportUserData } from "@/lib/gdpr/export";
import { PII_MAP, REDACTED } from "@/lib/gdpr/pii-map";
import { exportUserTool } from "@/lib/tools/gdpr";
import { getOrder } from "@/lib/tools/orders";

/**
 * gdpr.erase_user against a real database, on the migration baseline's schema:
 * the real Prisma client runs the real `updateMany`, and what each Order column
 * must become comes from lib/gdpr/pii-map.ts. tests/unit/gdpr-pii-map.test.ts
 * says every column is classified; this says erase.ts does what the map says, so
 * the map cannot drift from the code it documents. Who it reaches is held the same
 * way: one row per link a record can be found by, and one that is someone else's.
 *
 * The same rows go through the two tools that hand an order to their caller
 * whole, gdpr.export_user and orders.get. Their output schemas are strict and the
 * MCP route validates against them, so a real row is the honest fixture, in both
 * of the states a shop has one in: filled in, and bare.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const db = vi.hoisted(() => ({ client: null as unknown as object }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_target, key) => Reflect.get(db.client, key) }),
}));

const EMAIL = "buyer@shop.example.test";
const BARE_EMAIL = "bare@shop.example.test";
const TYPED_EMAIL = "gift@shop.example.test";
const WHEN = new Date("2026-10-01T12:00:00.000Z");
const IP = "192.0.2.1";
const HASHED = /^erased-[0-9a-f]+@anonymized\.invalid$/;

/**
 * A value in every column an order has, and never the column's default: the
 * personal ones so that an erased value means something, the rest so that a kept
 * one does. The erasure test holds this against the bare order below.
 */
const orderRow = (id: string, orderNumber: number, email: string, userId: string | null) => ({
  id,
  userId,
  email,
  status: "paid",
  shippingName: "Ada Buyer",
  shippingAddress: "1 Test Street",
  shippingZip: "1000",
  shippingCity: "Testville",
  billingName: "Ada Buyer Ltd",
  billingAddress: "2 Invoice Road",
  billingZip: "2000",
  billingCity: "Invoiceton",
  billingCountry: "DK",
  phoneNumber: "+4512345678",
  subtotalDkk: 13500,
  shippingDkk: 4900,
  discountDkk: 1000,
  totalDkk: 17400,
  vatOere: 3480,
  invoiceProvider: "uniconta",
  invoiceId: "F-1001",
  invoicePdfUrl: "https://shop.example.test/invoices/f-1001.pdf",
  discountCode: "WELCOME10",
  isAiGenerated: true,
  aiAgentSource: "agent-test",
  carrier: "gls",
  trackingNumber: "TRACK-1",
  trackingUrl: "https://carrier.example.test/TRACK-1",
  estDeliveryFrom: WHEN,
  estDeliveryTo: WHEN,
  createdAt: WHEN,
  stripePaymentIntentId: "pi_test_1",
  paymentMethod: "stripe_card",
  paidAt: WHEN,
  currency: "EUR",
  fxRate: 7.46,
  channel: "acp",
  acpSessionId: "acp_test_1",
  confirmationEmailSentAt: WHEN,
  refundedAt: WHEN,
  disputedAt: WHEN,
  orderNumber,
  termsVersion: "2026-09",
  termsAcceptedAt: WHEN,
  externalId: id,
  source: "woocommerce",
  paymentProvider: "frisbii",
  paymentRef: "ref_test_1",
  cvr: "12345678",
  ean: "5790000000000",
  reference: "Attn Ada Buyer",
});

/**
 * Only what an order cannot leave out, so every other column is null or its
 * default. A column a batch adds is null on every order a shop already has, so
 * this is the state `orders.get` meets first.
 */
const bareOrderRow = (id: string, userId: string | null) => ({
  id,
  userId,
  email: BARE_EMAIL,
  shippingName: "Bea Bare",
  shippingAddress: "3 Plain Street",
  shippingZip: "3000",
  shippingCity: "Plainville",
  subtotalDkk: 9900,
  shippingDkk: 0,
  totalDkk: 9900,
});

const reviewRow = (id: string, userId: string | null, authorName: string, authorEmail: string) => ({
  id,
  userId,
  authorName,
  authorEmail,
  productId: "p1",
  rating: 5,
  body: "Sturdy.",
});
const keyRow = (id: string, userId: string, revokedAt: Date | null) => ({ id, userId, revokedAt, name: id, keyHash: id, scopes: "[]" });
const auditRow = (id: string, actor: string) => ({ id, actor, tool: "orders.get", argsJson: "{}", ok: true, requestId: id, ip: IP });
const subscriptionRow = (id: string, userId: string) => ({
  id,
  userId,
  stripeCustomerId: `cus_${id}`,
  stripeSubId: `sub_${id}`,
  stripePriceId: "price_test_1",
  status: "active",
  currentPeriodEnd: WHEN,
});

const BATCH_B_UNSET = { paymentProvider: null, paymentRef: null, cvr: null, ean: null, reference: null };
const BARE_LINE = { productId: null, sku: null, variantId: null, variantSku: null, variantAttributes: null, optionSelections: null };

const orderFields = PII_MAP.find((m) => m.model === "Order")?.fields ?? [];

/** The columns PII_MAP says erasure changes on a model, as `toMatchObject` reads them. */
const erasedAsMapSays = (model: string) => {
  const fields = (PII_MAP.find((m) => m.model === model)?.fields ?? []).filter((f) => f.strategy !== "keep");
  expect(fields, model).not.toHaveLength(0);
  const value = (strategy: string): unknown => (strategy === "null" ? null : strategy === "redact" ? REDACTED : expect.stringMatching(HASHED));
  return Object.fromEntries(fields.map((f) => [f.field, value(f.strategy)]));
};

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-erase-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  db.client = prisma;

  await prisma.user.create({
    data: {
      id: "u1",
      email: EMAIL,
      name: "Ada Buyer",
      phoneNumber: "+4512345678",
      shippingName: "Ada Buyer",
      shippingAddress: "1 Test Street",
      shippingZip: "1000",
      shippingCity: "Testville",
      passwordHash: "not-a-real-hash",
    },
  });
  await prisma.user.create({ data: { id: "u2", email: BARE_EMAIL, name: "Bea Bare" } });
  await prisma.category.create({ data: { id: "c1", name: "Fences", slug: "fences" } });
  await prisma.product.create({
    data: { id: "p1", name: "Fence", slug: "fence-1", description: "", priceDkk: 12500, images: "[]", categoryId: "c1" },
  });
  await prisma.productVariant.create({
    data: { id: "v1", productId: "p1", sku: "fence-180", priceDkk: 12500, attributes: { heightCm: 180 } },
  });
  await prisma.order.create({ data: orderRow("o-own", 1001, EMAIL, "u1") });
  await prisma.order.create({ data: orderRow("o-guest", 1002, EMAIL, null) });
  await prisma.order.create({ data: orderRow("o-other", 1003, "other@shop.example.test", null) });
  await prisma.order.create({ data: bareOrderRow("o-bare", "u2") });
  await prisma.order.create({ data: bareOrderRow("o-bare-guest", null) });
  // lib/orders/create.ts and plugins/reviews/api/submit.ts both write the session's
  // user next to the address the form sent, so a logged-in buyer's order and review
  // can name someone else's address. Only the account reaches those two.
  await prisma.order.create({ data: orderRow("o-typed", 1004, TYPED_EMAIL, "u1") });
  await prisma.productReview.createMany({
    data: [
      reviewRow("r-typed", "u1", "Ada Buyer", TYPED_EMAIL),
      reviewRow("r-guest", null, "Ada Buyer", EMAIL),
      reviewRow("r-other", "u2", "Bea Bare", BARE_EMAIL),
    ],
  });
  await prisma.lead.createMany({
    data: [
      { id: "l-own", name: "Ada Buyer", email: EMAIL },
      { id: "l-other", name: "Bea Bare", email: BARE_EMAIL },
    ],
  });
  await prisma.acpCheckoutSession.createMany({
    data: [
      { id: "acp-own", lineItemsJson: "[]", buyerEmail: EMAIL, expiresAt: WHEN },
      { id: "acp-other", lineItemsJson: "[]", buyerEmail: BARE_EMAIL, expiresAt: WHEN },
    ],
  });
  await prisma.apiKey.createMany({ data: [keyRow("k-own", "u1", null), keyRow("k-old", "u1", WHEN), keyRow("k-other", "u2", null)] });
  await prisma.auditLog.createMany({ data: [auditRow("a-own", "user:u1"), auditRow("a-other", "user:u2")] });
  await prisma.subscription.createMany({ data: [subscriptionRow("s-own", "u1"), subscriptionRow("s-other", "u2")] });
  await prisma.cart.createMany({ data: [{ id: "cart-own", userId: "u1" }, { id: "cart-other", userId: "u2" }] });
  await prisma.orderItem.create({
    data: {
      id: "i1",
      orderId: "o-own",
      productId: "p1",
      productName: "Fence",
      sku: "FENCE",
      unitPriceDkk: 13500,
      quantity: 1,
      variantId: "v1",
      variantSku: "fence-180",
      variantAttributes: { heightCm: 180 },
      optionSelections: { heightCm: 180, priceDeltaDkk: 1000 },
    },
  });
  await prisma.orderItem.create({
    data: { id: "i2", orderId: "o-bare", productName: "Old fence", unitPriceDkk: 9900, quantity: 1 },
  });
}, 60_000);

afterAll(async () => {
  if (!sqlite) return;
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

/** What the MCP route does with a tool's answer: serialise it, then hold it against the strict output. */
const expectOutput = (tool: { output: ZodType }, answer: unknown) => {
  const parsed = tool.output.safeParse(JSON.parse(JSON.stringify(answer)) as unknown);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
};
const getOrderAnswer = (orderId: string) => getOrder.handler({ orderId }, { actor: "system:test" });

describe.skipIf(!sqlite)("an order through the tools that return it whole, then through erasure", () => {
  it("gdpr.export_user gives the customer every column, and its strict schema takes the real row", async () => {
    const data = await exportUserData("u1");
    expect(data?.orders[0]).toMatchObject({ cvr: "12345678", ean: "5790000000000", reference: "Attn Ada Buyer", billingName: "Ada Buyer Ltd" });
    expectOutput(exportUserTool, data);
  });

  it("orders.get's strict schema takes the real row and its line, a value in every column", async () => {
    const order = await getOrderAnswer("o-own");
    expect(order).toMatchObject({ paymentRef: "ref_test_1", items: [{ optionSelections: { heightCm: 180, priceDeltaDkk: 1000 } }] });
    expect(Object.values(order), "the order").not.toContain(null);
    expect(Object.values(order.items[0]), "the line").not.toContain(null);
    expectOutput(getOrder, order);
  });

  it("orders.get's strict schema takes a bare order and a bare line", async () => {
    const order = await getOrderAnswer("o-bare");
    expect(order).toMatchObject({ ...BATCH_B_UNSET, items: [BARE_LINE] });
    expectOutput(getOrder, order);
    expectOutput(getOrder, await getOrderAnswer("o-bare-guest")); // and without a customer behind it
  });

  it("gdpr.export_user's strict schema takes them too, as a customer's order and as a guest order", async () => {
    const data = await exportUserData("u2");
    expect(data?.orders).toMatchObject([{ id: "o-bare", ...BATCH_B_UNSET, items: [BARE_LINE] }]);
    expect(data?.guestOrdersSameEmail).toMatchObject([{ id: "o-bare-guest", userId: null, ...BATCH_B_UNSET }]);
    expectOutput(exportUserTool, data);
  });

  it("gdpr.export_user finds each record by the link it carries, and hands over nobody else's", async () => {
    const data = await exportUserData("u1");
    const ids = (rows: unknown[] = []) => rows.map((r) => (r as { id: string }).id).sort();
    expect(ids(data?.orders)).toEqual(["o-own", "o-typed"]);
    expect(ids(data?.guestOrdersSameEmail)).toEqual(["o-guest"]);
    expect(ids(data?.subscriptions)).toEqual(["s-own"]);
    expect(ids(data?.carts)).toEqual(["cart-own"]);
    expect(ids(data?.leads)).toEqual(["l-own"]);
    expect(ids(data?.acpCheckoutSessions)).toEqual(["acp-own"]);
    // Not an exact list: r-guest, which erasure reaches by its address, is not exported today.
    expect(ids(data?.reviews)).toContain("r-typed");
    expect(ids(data?.reviews)).not.toContain("r-other");
    expectOutput(exportUserTool, data);
  });

  it("every Order column ends up as PII_MAP says, on the customer's orders and only theirs", async () => {
    const before = await prisma.order.findMany({ orderBy: { id: "asc" } });
    const row = (rows: typeof before, id: string) => rows.find((o) => o.id === id) as unknown as Record<string, unknown>;
    for (const f of orderFields) {
      // Seeded, and not with what a bare order gets anyway, so that what happens to it below means something.
      const seeded = row(before, "o-own")[f.field];
      expect(seeded, f.field).not.toBeNull();
      expect(seeded, f.field).not.toEqual(row(before, "o-bare")[f.field]);
    }

    const result = await anonymizeCustomer("u1", "user:admin");
    expect(result).toMatchObject({
      ok: true,
      summary: { ordersAnonymized: 3, reviewsAnonymized: 2, leadsDeleted: 1, acpSessionsDeleted: 1, apiKeysRevoked: 1, auditIpsCleared: 1, userAnonymized: 1 },
    });

    const after = await prisma.order.findMany({ orderBy: { id: "asc" } });
    for (const id of ["o-own", "o-typed", "o-guest"]) {
      const was = row(before, id);
      const now = row(after, id);
      for (const f of orderFields) {
        const label = `${id}.${f.field} (${f.strategy})`;
        if (f.strategy === "keep") expect(now[f.field], label).toEqual(was[f.field]);
        else if (f.strategy === "null") expect(now[f.field], label).toBeNull();
        else if (f.strategy === "redact") expect(now[f.field], label).toBe(REDACTED);
        else expect(String(now[f.field]), label).toMatch(HASHED);
      }
    }
    for (const id of ["o-other", "o-bare", "o-bare-guest"]) {
      expect(row(after, id), `another customer's order ${id}`).toEqual(row(before, id));
    }
  });

  it("everything else the customer left behind is reached by its own link, and nobody else's is touched", async () => {
    const erased = { ...erasedAsMapSays("ProductReview"), rating: 5, body: "Sturdy." };
    expect(await prisma.productReview.findMany({ orderBy: { id: "asc" } })).toMatchObject([
      { id: "r-guest", ...erased },
      { id: "r-other", authorName: "Bea Bare", authorEmail: BARE_EMAIL },
      { id: "r-typed", ...erased },
    ]);
    expect(await prisma.lead.findMany({ select: { id: true } })).toEqual([{ id: "l-other" }]);
    expect(await prisma.acpCheckoutSession.findMany({ select: { id: true } })).toEqual([{ id: "acp-other" }]);
    expect(await prisma.apiKey.findMany({ orderBy: { id: "asc" } })).toMatchObject([
      { id: "k-old", revokedAt: WHEN }, // keeps the time it really stopped working
      { id: "k-other", revokedAt: null },
      { id: "k-own", revokedAt: expect.any(Date) },
    ]);
    expect(await prisma.auditLog.findMany({ where: { id: { in: ["a-other", "a-own"] } }, orderBy: { id: "asc" } })).toMatchObject([
      { id: "a-other", ip: IP },
      { id: "a-own", ip: null },
    ]);
    expect(await prisma.user.findMany({ orderBy: { id: "asc" } })).toMatchObject([
      { id: "u1", ...erasedAsMapSays("User") },
      { id: "u2", name: "Bea Bare", email: BARE_EMAIL },
    ]);
  });

  it("no personal value is left anywhere on the row, and both tools still answer for it", async () => {
    const rows = await prisma.order.findMany({ where: { id: { in: ["o-own", "o-typed"] } } });
    expect(rows).toHaveLength(2);
    const text = JSON.stringify(rows);
    for (const value of [EMAIL, TYPED_EMAIL, "Ada", "Test Street", "Invoice Road", "Testville", "Invoiceton", "12345678", "5790000000000", "+4512345678"]) {
      expect(text, value).not.toContain(value);
    }
    for (const row of rows) {
      expect(row).toMatchObject({ totalDkk: 17400, stripePaymentIntentId: "pi_test_1", paymentRef: "ref_test_1", invoiceId: "F-1001" });
    }
    expectOutput(getOrder, await getOrderAnswer("o-own"));
    expectOutput(exportUserTool, await exportUserData("u1"));
  });
});
