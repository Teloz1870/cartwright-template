import "./stand-ins";

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";

import { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { GET as reconcileCronRoute } from "@/app/api/cron/reconcile-stripe/route";
import { POST as stripeWebhookRoute } from "@/app/api/webhook/stripe/route";
import { brand } from "@/brand.config";
import { formatPriceDkk } from "@/lib/format";
import { invalidateDbFxRatesCache } from "@/lib/fx/rates";
import { invalidateStripeKeysCache } from "@/lib/stripe";

import { network, world, type MailSent, type SdkCall } from "./world";

export { network, world };

/**
 * PAY-F1-0, the golden record of the Stripe money path, as it stands before the
 * PaymentProvider seam (PAY-F1) moves it behind an interface. A slice of that seam
 * changes no file in this directory: that is the proof it changed nothing.
 *
 * Each test runs one thing the shop can be asked to do, over the real route
 * handler, server action or tool on a real libSQL file, and holds, as literals,
 * everything that came of it: the response, every row of every table that changed,
 * the Stripe calls with their arguments, the mails, the marketing events, what went
 * to Sentry, what was revalidated and what was logged. `outcome` fills in "nothing"
 * for whatever a literal does not name, so anything new is a difference.
 *
 * It holds behaviour, not code: nothing here names the file a write comes from, and
 * a column the schema gains stays out of the record until a row holds a value in it.
 * A test marked "known" holds a fault the seam must carry over as it is. Fixing one
 * is its own slice, which changes the literal on purpose.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
export const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

export const WEBHOOK_SECRET = "whsec_golden";
export const CRON_SECRET = "cron-golden";
export const SECRET_KEY = "sk_test_golden";
export const PUBLISHABLE_KEY = "pk_test_golden";

/** The clock stands still here, so every timestamp in the record is a literal. */
export const NOW = "2026-10-31T12:00:00.000Z";
export const minutesAgo = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000);

export const BASE_CURRENCY = brand.policies.currency;
export const base = BASE_CURRENCY.toLowerCase();

export const ORDER = "ord_golden";
export const BYSTANDER = "ord_bystander";
export const INTENT = "pi_golden";
export const CODE_ID = "code-ten";

export const BUYER = {
  email: "buyer@shop.example.test",
  shippingName: "Buyer Example",
  shippingAddress: "Example Road 12",
  shippingZip: "1234",
  shippingCity: "Exampleton",
};

/** Two of each line at 10 % off, below the free-shipping threshold. */
export const MONEY = { subtotalDkk: 145800, discountDkk: 14580, shippingDkk: 4900, totalDkk: 136120 };

let dir = "";
let template = "";

/** Registers the shop's lifecycle: a fresh database and clean stand-ins per test. */
export function openTheShop() {
  // A row is a whole shop read twice, on whatever a loaded CI runner has to spare.
  vi.setConfig({ testTimeout: 60_000 });

  beforeAll(async () => {
    if (!sqlite) return;
    // Everything below writes through this. Were it the real client, it would be
    // writing to the developer's own database.
    const db = (await import("@/lib/db")) as unknown as { standIn?: boolean };
    if (!db.standIn) throw new Error("import ./shop before anything it stands in for");
    // The schema once, a copy per test: these files run hundreds of them.
    template = join(mkdtempSync(join(tmpdir(), "cw-golden-template-")), "template.db");
    const raw = createClient({ url: `file:${template}` });
    await raw.executeMultiple(
      readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
    );
    raw.close();
  }, 60_000);

  beforeEach(async () => {
    if (!sqlite) return;
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
    dir = mkdtempSync(join(tmpdir(), "cw-golden-"));
    copyFileSync(template, join(dir, "shop.db"));
    world.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${join(dir, "shop.db")}` }) });

    world.sdk.length = 0;
    world.clients.length = 0;
    world.network.clear();
    world.mails.length = 0;
    world.mailFaults.clear();
    world.events.length = 0;
    world.sentry.length = 0;
    world.revalidated.length = 0;
    world.before.clear();
    world.cartSession = "sess-1";
    world.signedIn = null;
    world.admin = "admin";
    world.checkoutCurrency = null;
    world.fxAutoUpdate = false;
    world.subscriptionsOn = false;
    world.shippingZonesOn = false;

    vi.stubEnv("STRIPE_SECRET_KEY", SECRET_KEY);
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    invalidateStripeKeysCache();
    invalidateDbFxRatesCache();
    logs.length = 0;
    for (const level of ["error", "warn", "info", "log"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push([level, ...args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : arg))]);
      });
    }

    const db = world.prisma;
    await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
    await db.product.createMany({
      data: [
        { id: "plain", slug: "plain", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 5 },
        { id: "fence", slug: "fence", name: "Fence Panel", description: "", priceDkk: 50000, images: "[]", categoryId: "cat", stock: 5 },
      ],
    });
    await db.productVariant.create({
      data: { id: "fence-2m", productId: "fence", sku: "F-2M", priceDkk: 60000, stock: 3, attributes: { height: "2m" } },
    });
    await db.discountCode.create({ data: { id: CODE_ID, code: "TEN", type: "percent", value: 10, usageCount: 3 } });
    await db.cart.create({ data: { id: "cart-1", sessionId: "sess-1" } });
    await db.user.create({ data: { id: "user-1", email: "customer@shop.example.test" } });
    // Another variant, and someone else's code, cart and profile: a write that loses
    // its `where` shows here.
    await db.productVariant.create({
      data: { id: "fence-3m", productId: "fence", sku: "F-3M", priceDkk: 70000, stock: 9, attributes: { height: "3m" } },
    });
    await db.discountCode.create({ data: { id: "code-other", code: "OTHER", type: "percent", value: 5, usageCount: 7 } });
    await db.user.create({ data: { id: "user-other", email: "other@shop.example.test" } });
    await db.cart.create({ data: { id: "cart-other", sessionId: "sess-other", userId: "user-other" } });
    await db.cartItem.create({ data: { id: "item-other", cartId: "cart-other", quantity: 1, productId: "plain" } });
  }, 60_000);

  afterEach(async () => {
    try {
      // A step nobody reached is a test that did not test what it says.
      expect([...world.before.keys()]).toEqual([]);
    } finally {
      // Torn down even when that check fails, so the next test starts clean.
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.useRealTimers();
      await world.prisma?.$disconnect();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (template) rmSync(join(template, ".."), { recursive: true, force: true });
  });
}

// ── What the shop holds ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;
export type TableDiff = { inserted?: Row[]; updated?: Record<string, Row>; deleted?: string[] };

const logs: unknown[][] = [];

const CUID = /^c[a-z0-9]{20,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A row as the record holds it: the clock's columns out, generated ids out, JSON read. */
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && UUID.test(value)) return "<uuid>";
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [key, field] of Object.entries(value)) {
      if (key === "createdAt" || key === "updatedAt") continue;
      if (key === "id" && typeof field === "string" && CUID.test(field)) continue;
      if (key.endsWith("Json") && typeof field === "string") {
        out[key] = plain(JSON.parse(field));
        continue;
      }
      out[key] = plain(field);
    }
    return out;
  }
  return value;
}

function withoutNulls(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

/** Rows written in one instant have no order of their own: this one is stable. */
function byContent(a: Row, b: Row): number {
  const text = (row: Row) => JSON.stringify(Object.entries(row).sort(([x], [y]) => x.localeCompare(y)));
  return text(a).localeCompare(text(b));
}

const delegateOf = (model: string) => model[0].toLowerCase() + model.slice(1);

/** Every row of every table the schema has. */
async function everyRow(): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const model of Object.values(Prisma.ModelName)) {
    const delegate = (world.prisma as unknown as Record<string, { findMany(): Promise<Row[]> }>)[delegateOf(model)];
    out[model] = await delegate.findMany();
  }
  return out;
}

const keyOf = (row: Row) => (row.id === undefined ? JSON.stringify(row) : String(row.id));
const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ===
  JSON.stringify(b, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

/** What changed between two readings: new rows whole, changed rows their new values. */
function diff(before: Record<string, Row[]>, after: Record<string, Row[]>): Record<string, TableDiff> {
  const out: Record<string, TableDiff> = {};
  for (const model of Object.keys(after)) {
    const was = new Map(before[model].map((row) => [keyOf(row), row]));
    const now = new Map(after[model].map((row) => [keyOf(row), row]));
    const table: TableDiff = {};

    const inserted = [...now].filter(([key]) => !was.has(key)).map(([, row]) => withoutNulls(plain(row) as Row));
    if (inserted.length) table.inserted = inserted.sort(byContent);

    const updated: Record<string, Row> = {};
    for (const [key, row] of now) {
      const previous = was.get(key);
      if (!previous) continue;
      const changed = Object.keys(row).filter((column) => !sameJson(row[column], previous[column]));
      const shown = plain(Object.fromEntries(changed.map((column) => [column, row[column]]))) as Row;
      if (Object.keys(shown).length) updated[key] = shown;
    }
    if (Object.keys(updated).length) table.updated = updated;

    const deleted = [...was.keys()].filter((key) => !now.has(key));
    if (deleted.length) table.deleted = deleted;

    if (Object.keys(table).length) out[model] = table;
  }
  return out;
}

export type Golden = {
  result: unknown;
  rows: Record<string, TableDiff>;
  sdk: SdkCall[];
  mails: MailSent[];
  events: unknown[][];
  sentry: unknown[][];
  revalidated: unknown[][];
  logs: unknown[][];
};

/** Runs one thing the shop is asked to do, and reads back everything that came of it. */
export async function record(act: () => Promise<unknown>): Promise<Golden> {
  const before = await everyRow();
  world.sdk.length = 0;
  world.mails.length = 0;
  world.events.length = 0;
  world.sentry.length = 0;
  world.revalidated.length = 0;
  logs.length = 0;
  const result = await act();
  return {
    result,
    rows: diff(before, await everyRow()),
    sdk: [...world.sdk],
    mails: [...world.mails],
    events: [...world.events],
    sentry: [...world.sentry],
    revalidated: [...world.revalidated],
    logs: [...logs],
  };
}

/** A literal for `record`: whatever it does not name did not happen. */
export function outcome(golden: Partial<Golden>): Golden {
  return {
    result: undefined,
    rows: {},
    sdk: [],
    mails: [],
    events: [],
    sentry: [],
    revalidated: [],
    logs: [],
    ...golden,
  };
}

// ── Getting there ───────────────────────────────────────────────────────────

/**
 * An order as checkout leaves it: stock taken, one use of the code counted. Beside it,
 * written first so an unfiltered read finds it, stands another order in the same status,
 * with no intent of its own. A read or write that loses its `where` shows there.
 */
export async function orderIn(
  status = "pending_payment",
  over: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
  const db = world.prisma;
  await db.order.create({
    data: {
      id: BYSTANDER,
      status,
      email: "other@shop.example.test",
      shippingName: "Other Buyer",
      shippingAddress: "Other Road 1",
      shippingZip: "4321",
      shippingCity: "Otherton",
      subtotalDkk: 12900,
      shippingDkk: 0,
      totalDkk: 12900,
      discountCode: "OTHER",
      currency: BASE_CURRENCY,
      createdAt: minutesAgo(60),
      items: {
        create: [{ id: "line-other", productId: "plain", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 1 }],
      },
    },
  });
  await db.order.create({
    data: {
      id: ORDER,
      status,
      ...BUYER,
      ...MONEY,
      discountCode: "TEN",
      currency: BASE_CURRENCY,
      fxRate: 1,
      stripePaymentIntentId: INTENT,
      createdAt: minutesAgo(10),
      items: {
        create: [
          { id: "line-plain", productId: "plain", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 2 },
          {
            id: "line-fence",
            productId: "fence",
            productName: "Fence Panel",
            unitPriceDkk: 60000,
            quantity: 2,
            variantId: "fence-2m",
            variantSku: "F-2M",
            variantAttributes: { height: "2m" },
          },
        ],
      },
      ...over,
    },
  });
  await db.product.update({ where: { id: "plain" }, data: { stock: 3 } });
  await db.productVariant.update({ where: { id: "fence-2m" }, data: { stock: 1 } });
  await db.discountCode.update({ where: { id: CODE_ID }, data: { usageCount: 4 } });
}

/** A cart holding these, each line two of it. Ids are fixed so a deleted line can be named. */
export type CartLine = { productId: string; variantId: string | null };
export const PLAIN: CartLine = { productId: "plain", variantId: null };
export const VARIANT: CartLine = { productId: "fence", variantId: "fence-2m" };

export async function fillCart(lines: CartLine[] = [PLAIN, VARIANT], cartId = "cart-1") {
  await world.prisma.cartItem.createMany({
    data: lines.map((line, index) => ({ id: `item-${index}`, cartId, quantity: 2, ...line })),
  });
}

/** The rows a cancel of `orderIn`'s order writes: its stock and its code's use back. */
export const GIVEN_BACK: Record<string, TableDiff> = {
  Product: { updated: { plain: { stock: 5 } } },
  ProductVariant: { updated: { "fence-2m": { stock: 3 } } },
  DiscountCode: { updated: { [CODE_ID]: { usageCount: 3 } } },
};

/** What Stripe holds for `orderIn`'s order: charged exactly what it says. */
export const paidIntent = (over: Record<string, unknown> = {}) => ({
  id: INTENT,
  object: "payment_intent",
  status: "succeeded",
  amount: MONEY.totalDkk,
  currency: base,
  payment_method_types: ["card"],
  metadata: { orderId: ORDER },
  ...over,
});

const signer = new Stripe("sk_test_signer").webhooks;

/** A signed delivery, over the real signature check. */
export function deliver(
  id: string,
  type: string,
  object: unknown,
  { secret = WEBHOOK_SECRET, timestamp }: { secret?: string; timestamp?: number } = {},
) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  return postWebhook(payload, {
    "content-type": "application/json",
    "stripe-signature": signer.generateTestHeaderString({ payload, secret, timestamp }),
  });
}

/** What the webhook answers on an event it took in, and the row that remembers it. */
export const RECEIVED = { status: 200, body: { received: true } };
export const remembered = (id: string, type: string): Record<string, TableDiff> => ({
  ProcessedWebhookEvent: { inserted: [{ id, type }] },
});

/** A POST the signature check has not seen: no header, or one of the caller's own. */
export async function postWebhook(body: string, headers: Record<string, string> = {}) {
  const res = await stripeWebhookRoute(
    new Request("https://shop.example.test/api/webhook/stripe", { method: "POST", body, headers }) as never,
  );
  return { status: res.status, body: await res.json() };
}

export async function runCron(authorization: string | null = `Bearer ${CRON_SECRET}`) {
  const res = await reconcileCronRoute(
    new Request("https://shop.example.test/api/cron/reconcile-stripe", {
      headers: authorization ? { authorization } : {},
    }) as never,
  );
  return { status: res.status, body: await res.json() };
}

/**
 * A shop that sends with its own delivery rates (SHIP0-b): the runtime flag on, a zone
 * for the shop's own country with two delivery rates and one for heavy parcels only, and
 * a zone for another country with a rate of its own. Pickup rates are left out: they
 * wait for the pickup-point picker (SHIP0-b part 2b). The ids are fixed so a choice can
 * name them.
 */
export const RATES = {
  home: { id: "rate-home", name: "Home delivery", feeDkk: 3900, carrierCode: "gls", shipmentTemplateId: 101 },
  express: { id: "rate-express", name: "Express", feeDkk: 9900, carrierCode: "postnord", shipmentTemplateId: 202 },
  pallet: { id: "rate-pallet", name: "Pallet", feeDkk: 49900, minWeightGram: 20000 },
  abroad: { id: "rate-abroad", name: "Abroad", feeDkk: 1500, carrierCode: "dao" },
} as const;

export async function withShippingRates({ homeZone = true }: { homeZone?: boolean } = {}) {
  world.shippingZonesOn = true;
  const db = world.prisma;
  if (homeZone) {
    await db.shippingZone.create({
      data: {
        id: "zone-home",
        name: "Home",
        countries: JSON.stringify([brand.policies.country]),
        rates: { create: [RATES.home, RATES.express, RATES.pallet] },
      },
    });
  }
  await db.shippingZone.create({
    data: { id: "zone-abroad", name: "Abroad", countries: JSON.stringify(["ZZ"]), rates: { create: [RATES.abroad] } },
  });
}

/** What a price reads in a note: the shop's own currency, in the shop's own format. */
export const price = (minor: number) => formatPriceDkk(minor);

/** A database call that fails, once. */
export function failing(step: string, message = "db down") {
  world.before.set(step, () => {
    throw new Error(message);
  });
}

/** Stripe with no keys anywhere: what a shop that never set them up runs on. */
export function stripeNotConfigured() {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  invalidateStripeKeysCache();
}
