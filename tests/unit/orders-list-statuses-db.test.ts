import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";

/**
 * ORD1-a2 — `orders.list_statuses`, on a real libSQL file, through the real
 * registry, REST route and MCP SDK. The SDK is the surface that validates a
 * result against the tool's strict output schema, so that is where an answer the
 * schema does not describe would break for a client.
 *
 * What it says about moves is checked against what `orders.update_status` really
 * does on a real order, not against a second reading of the state machine. What
 * it says about meaning is checked against rows that lie: a status's key or label
 * decides nothing here, and opens or closes no move in that tool.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
// A shop with the agent surface on: the flag and the identity are not this file's.
vi.mock("@/lib/brand", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/brand")>()),
  getFeatureGateState: async () => ({ available: true, features: { mcpPublic: true } }),
  getBrand: async () => ({
    url: "https://shop.example.test",
    storeName: "Example Shop",
    storeSlug: "example-shop",
    ecommerceEnabled: true,
    defaultLocale: "en",
    company: {},
    contact: {},
    metadata: { description: "An example shop." },
  }),
}));

// Module-level so the registry (every tool module) loads at collection, not inside a test.
import { POST as mcpPost } from "@/app/api/mcp/route";
import { GET as catalogueGet } from "@/app/api/v1/tools/route";
import { POST as restPost } from "@/app/api/v1/tools/[name]/route";
import { isAdminTool, isCustomerTool } from "@/lib/ai/client";
import { generateApiKey } from "@/lib/api-auth";
import { authAttemptPerIpLimiter } from "@/lib/auth-attempt-rate-limit";
import { buildOpenApiDocument } from "@/lib/openapi";
import { REFUND_STATUSES, STATUS_COLORS, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { seedOrderStatuses } from "@/lib/orders/status-seed";
import { STATIC_ORDER_STATUS_ROWS, STOCK_EFFECTS } from "@/lib/orders/status-table";
import * as commerceSeam from "@/lib/tools/packs/commerce";
import * as commerceStatic from "@/lib/tools/packs/commerce.static";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { CUSTOMER_CHAT_SCOPES, type Scope } from "@/lib/scopes";
import { PUBLIC_AGENT_TOOL_NAMES, isPublicAgentTool } from "@/lib/tools/public";
import { buildToolManifest, getTool, invokeTool, listTools } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";

// Each test runs real routes on a real database file: a busy runner must not
// turn slow into red.
vi.setConfig({ testTimeout: 30_000 });

const NAME = "orders.list_statuses";
const CTX: ToolCtx = { actor: "system:test" };

/** The answer's keys, written out by hand: an edit that adds one has to change this too. */
const ROW_KEYS = [
  "color",
  "countsAsRevenue",
  "customerVisible",
  "isFinal",
  "isPaid",
  "key",
  "label",
  "moveAllowedFrom",
  "notifyCustomer",
  "stockEffect",
  "usableByUpdateStatus",
];
const MEANING_KEYS = ["isPaid", "isFinal", "countsAsRevenue", "stockEffect", "notifyCustomer", "customerVisible"] as const;

/** The 12 statuses in the order the admin and `orders.update_status` have them today. */
const TODAY = [
  "pending_payment",
  "pending",
  "paid",
  "flagged_review",
  "shipped",
  "cancelled",
  "refunded",
  "partial_refund",
  "disputed",
  "processing",
  "delivered",
  "completed",
];

type Row = {
  key: string;
  label: string;
  color: string | null;
  moveAllowedFrom: string[];
  usableByUpdateStatus: boolean;
  isPaid: boolean;
  isFinal: boolean;
  countsAsRevenue: boolean;
  stockEffect: string;
  notifyCustomer: boolean;
  customerVisible: boolean;
};

let dir = "";
let raw: Client;
let db: PrismaClient;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  authAttemptPerIpLimiter.reset();
  publicAgentPerIpLimiter.reset();
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-order-statuses-tool-"));
  const url = `file:${join(dir, "shop.db")}`;
  raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.prisma = db;
}, 60_000);

afterEach(async () => {
  warn.mockRestore();
  if (!sqlite) return;
  await db.$disconnect();
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function theTool() {
  const tool = getTool(NAME);
  if (!tool) throw new Error(`${NAME} is not in the registry`);
  return tool;
}

/** What a caller with the scope gets. */
async function list(): Promise<Row[]> {
  const result = await invokeTool(NAME, {}, CTX, ["orders:read"]);
  if (!result.ok) throw new Error(`${NAME} refused: ${result.error}`);
  return result.result as Row[];
}

const rowOf = (rows: readonly Row[], key: string): Row => {
  const found = rows.find((row) => row.key === key);
  if (!found) throw new Error(`no row for "${key}"`);
  return found;
};
const moves = (rows: readonly Row[]) =>
  Object.fromEntries(rows.map((row) => [row.key, [...row.moveAllowedFrom].sort()]));
const meaning = (row: Row) => Object.fromEntries(MEANING_KEYS.map((key) => [key, row[key]]));

const ORDER = "order-1";

function addOrder() {
  return db.order.create({
    data: {
      id: ORDER,
      email: "buyer@shop.example.test",
      shippingName: "Buyer Example",
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 12900,
      shippingDkk: 0,
      totalDkk: 12900,
      status: "pending",
    },
  });
}

/** `orders.update_status`'s arguments for a target: what its refund guard asks of a refund status. */
function updateArgs(status: string) {
  return {
    orderId: ORDER,
    status,
    ...(REFUND_STATUSES.has(status) ? { manual: true, confirm: true } : {}),
    ...(status === "partial_refund" ? { refundDkk: 100 } : {}),
  };
}

/** Each move `orders.update_status` really makes on a real order: target → the statuses it went from. */
async function movesTheUpdateToolMakes() {
  await addOrder();
  const made: Record<string, string[]> = {};
  for (const to of TODAY) {
    made[to] = [];
    for (const from of TODAY) {
      await db.order.update({ where: { id: ORDER }, data: { status: from } });
      const result = await invokeTool("orders.update_status", updateArgs(to), CTX, ["orders:write"]);
      if (result.ok) made[to].push(from);
    }
    made[to].sort();
  }
  return made;
}

/**
 * Rows whose words say the opposite of what they declare, and of what the machine
 * does. No field may follow the key or the label.
 */
const LIARS: Prisma.OrderStatusCreateManyInput[] = [
  // The real `paid`, under a label that says so, declaring the opposite.
  { key: "paid", label: "Paid in full", color: "bg-pink-100 text-pink-800", sortOrder: 100, isPaid: false, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: false, customerVisible: false },
  // The real `cancelled`, labelled and declared as if it were paid.
  { key: "cancelled", label: "Paid", color: "bg-green-100 text-green-800", sortOrder: 110, isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: true, customerVisible: false },
  // `pending`, which no move leads to, labelled as the status most moves lead to.
  { key: "pending", label: "Refunded", color: null, sortOrder: 120, isPaid: true, isFinal: true, countsAsRevenue: false, stockEffect: "reserve", notifyCustomer: true, customerVisible: false },
  // Statuses of the shop's own, under names that invite a meaning or a move.
  { key: "paid_in_full", label: "Paid", color: "x", sortOrder: 130, isPaid: false, isFinal: false, countsAsRevenue: false, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  { key: "PAID", label: "paid", color: "x", sortOrder: 140, isPaid: false, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: false, customerVisible: true },
  { key: "paid ", label: "paid", color: "x", sortOrder: 150, isPaid: false, isFinal: false, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: false, customerVisible: true },
  { key: "betalt", label: "Betalt", color: "x", sortOrder: 160, isPaid: false, isFinal: true, countsAsRevenue: true, stockEffect: "none", notifyCustomer: true, customerVisible: false },
  { key: "refunded_by_bank", label: "Refunded", color: "x", sortOrder: 170, isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: false, customerVisible: true },
  // A name that says nothing, declaring all of it: the words do not take it away.
  { key: "x7", label: "x7", color: "x", sortOrder: 180, isPaid: true, isFinal: true, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: true, customerVisible: true },
];
const OWN_LIARS = LIARS.filter((row) => !TODAY.includes(row.key));

describe.skipIf(!sqlite)("on an empty table", () => {
  it("lists the 12 statuses in today's order, with today's label and colour", async () => {
    const rows = await list();

    expect(rows.map((row) => row.key)).toEqual(TODAY);
    for (const row of rows) {
      expect(row.label, row.key).toBe(STATUS_LABELS[row.key as OrderStatus]);
      expect(row.color, row.key).toBe(STATUS_COLORS[row.key as OrderStatus]);
    }
  });

  it("each with the meaning the static table declares", async () => {
    const rows = await list();
    for (const fixed of STATIC_ORDER_STATUS_ROWS) {
      expect(meaning(rowOf(rows, fixed.key)), fixed.key).toEqual(
        Object.fromEntries(MEANING_KEYS.map((key) => [key, fixed[key]])),
      );
    }
  });

  it("whole rows, written out: one each way through the machine", async () => {
    const rows = await list();
    expect(rowOf(rows, "paid")).toEqual({
      key: "paid",
      label: "Paid",
      color: "bg-green-100 text-green-800",
      moveAllowedFrom: ["pending_payment", "pending", "flagged_review"],
      usableByUpdateStatus: true,
      isPaid: true,
      isFinal: false,
      countsAsRevenue: true,
      stockEffect: "none",
      notifyCustomer: true,
      customerVisible: true,
    });
    expect(rowOf(rows, "cancelled")).toEqual({
      key: "cancelled",
      label: "Cancelled",
      color: "bg-red-100 text-red-800",
      moveAllowedFrom: ["pending_payment", "pending", "paid", "flagged_review", "disputed", "processing"],
      usableByUpdateStatus: true,
      isPaid: false,
      isFinal: true,
      countsAsRevenue: false,
      stockEffect: "release",
      notifyCustomer: false,
      customerVisible: true,
    });
    // Only a payment or a checkout puts an order here, so no operator move leads to it.
    expect(rowOf(rows, "pending_payment").moveAllowedFrom).toEqual([]);
  });

  it("moveAllowedFrom says exactly which moves orders.update_status really makes", async () => {
    const rows = await list();
    expect(moves(rows)).toEqual(await movesTheUpdateToolMakes());
  });

  it("every status is usable by orders.update_status", async () => {
    for (const row of await list()) expect(row.usableByUpdateStatus, row.key).toBe(true);
  });

  it("writes nothing: the table stays empty, no audit row is left, and an empty table is no reason to warn", async () => {
    await list();
    expect(await db.orderStatus.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe.skipIf(!sqlite)("on a table seeded 1:1", () => {
  it("gives the empty table's answer, byte for byte", async () => {
    const empty = JSON.stringify(await list());
    await seedOrderStatuses(db);
    expect(await db.orderStatus.count()).toBe(TODAY.length);
    expect(JSON.stringify(await list())).toBe(empty);
  });
});

describe.skipIf(!sqlite)("on a shop's own rows", () => {
  it("shows a built-in status with the shop's label, colour, place and declared meaning, and the machine's moves", async () => {
    await db.orderStatus.create({
      data: { key: "shipped", label: "On its way", color: "bg-pink-100 text-pink-800", sortOrder: -5, isPaid: false, notifyCustomer: true, stockEffect: "reserve" },
    });

    const rows = await list();

    expect(rows[0]).toEqual({
      key: "shipped",
      label: "On its way",
      color: "bg-pink-100 text-pink-800",
      moveAllowedFrom: ["paid", "processing"],
      usableByUpdateStatus: true,
      isPaid: false,
      isFinal: false,
      countsAsRevenue: false,
      stockEffect: "reserve",
      notifyCustomer: true,
      customerVisible: true,
    });
    expect(rows).toHaveLength(TODAY.length);
  });

  it("marks a key of the shop's own as not usable by orders.update_status, with its declared meaning and no moves", async () => {
    await db.orderStatus.create({
      data: { key: "tilbud", label: "Quote", color: "bg-sky-100 text-sky-800", sortOrder: 15, isPaid: true, countsAsRevenue: true, stockEffect: "reserve", customerVisible: false, translations: { en: "Quote" } },
    });

    const rows = await list();

    expect(rows.map((row) => row.key).slice(0, 4)).toEqual(["pending_payment", "pending", "tilbud", "paid"]);
    expect(rows).toHaveLength(TODAY.length + 1);
    expect(rowOf(rows, "tilbud")).toEqual({
      key: "tilbud",
      label: "Quote",
      color: "bg-sky-100 text-sky-800",
      moveAllowedFrom: [],
      usableByUpdateStatus: false,
      isPaid: true,
      isFinal: false,
      countsAsRevenue: true,
      stockEffect: "reserve",
      notifyCustomer: false,
      customerVisible: false,
    });
  });

  it("no status's moves name a key of the shop's own: the machine does not know it", async () => {
    await db.orderStatus.create({ data: { key: "tilbud", label: "Quote", sortOrder: 15 } });
    for (const row of await list()) expect(row.moveAllowedFrom, row.key).not.toContain("tilbud");
  });

  it("lists the moves in the shop's order, as it lists the statuses", async () => {
    await db.orderStatus.create({ data: { key: "flagged_review", label: "Needs review", sortOrder: -5 } });
    expect(rowOf(await list(), "paid").moveAllowedFrom).toEqual(["flagged_review", "pending_payment", "pending"]);
  });

  it("orders.update_status agrees with the mark, for every key of every kind", async () => {
    await db.orderStatus.createMany({ data: LIARS });
    const accepts = (status: string) =>
      getTool("orders.update_status")?.input.safeParse(updateArgs(status)).success;

    const rows = await list();

    expect(rows.filter((row) => row.usableByUpdateStatus).map((row) => row.key).sort()).toEqual([...TODAY].sort());
    for (const row of rows) expect(accepts(row.key), row.key).toBe(row.usableByUpdateStatus);
  });

  it("orders.update_status refuses the unusable key at its schema, whatever the row declares", async () => {
    await db.orderStatus.createMany({ data: LIARS });
    await addOrder();
    for (const { key } of OWN_LIARS) {
      const result = await invokeTool("orders.update_status", updateArgs(key), CTX, ["orders:write"]);
      expect(result, key).toMatchObject({ ok: false, status: 422 });
    }
    expect(await db.order.findUniqueOrThrow({ where: { id: ORDER } })).toMatchObject({ status: "pending" });
  });

  it("a move OUT of a status the machine does not know is not checked, as moveAllowedFrom's description says", async () => {
    await db.orderStatus.create({ data: { key: "tilbud", label: "Quote", sortOrder: 15 } });
    await addOrder();
    await db.order.update({ where: { id: ORDER }, data: { status: "tilbud" } });

    expect(rowOf(await list(), "shipped").moveAllowedFrom).not.toContain("tilbud");
    const result = await invokeTool("orders.update_status", updateArgs("shipped"), CTX, ["orders:write"]);

    expect(result).toMatchObject({ ok: true });
    expect(await db.order.findUniqueOrThrow({ where: { id: ORDER } })).toMatchObject({ status: "shipped" });
  });

  it("a key of the shop's own with no colour reads null, and a stock effect it does not know reads none", async () => {
    await db.orderStatus.create({ data: { key: "tilbud", label: "Quote", stockEffect: "whatever" } });
    const row = rowOf(await list(), "tilbud");
    expect(row.color).toBeNull();
    expect(row.stockEffect).toBe("none");
    expect(() => theTool().output.parse([row])).not.toThrow();
  });

  it("a missing table still gives the 12: it reads through getOrderStatuses, which never throws", async () => {
    await raw.execute('DROP TABLE "OrderStatus"');
    expect((await list()).map((row) => row.key)).toEqual(TODAY);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!sqlite)("a status's name decides nothing", () => {
  beforeEach(async () => {
    await db.orderStatus.createMany({ data: LIARS });
  });

  it.each(LIARS.map((row) => [JSON.stringify(row.key), row] as const))(
    "%s reads exactly what its row declares, whatever its key and label say",
    async (_key, declared) => {
      const row = rowOf(await list(), declared.key);
      expect(row.label).toBe(declared.label);
      expect(meaning(row)).toEqual(Object.fromEntries(MEANING_KEYS.map((key) => [key, declared[key]])));
    },
  );

  it("the built-in keys keep the machine's moves, under any label and any declared meaning", async () => {
    const rows = await list();
    expect(rowOf(rows, "paid").moveAllowedFrom.sort()).toEqual(["flagged_review", "pending", "pending_payment"]);
    expect(rowOf(rows, "cancelled").moveAllowedFrom.sort()).toEqual([
      "disputed",
      "flagged_review",
      "paid",
      "pending",
      "pending_payment",
      "processing",
    ]);
    expect(rowOf(rows, "pending").moveAllowedFrom).toEqual([]);
    for (const row of rows.filter((r) => TODAY.includes(r.key))) expect(row.usableByUpdateStatus, row.key).toBe(true);
  });

  it("a key that only looks like a built-in one has no moves and is not usable", async () => {
    const rows = await list();
    for (const { key } of OWN_LIARS) {
      const row = rowOf(rows, key);
      expect(row.moveAllowedFrom, JSON.stringify(key)).toEqual([]);
      expect(row.usableByUpdateStatus, JSON.stringify(key)).toBe(false);
    }
  });

  // Whether a move is accepted, no more: what a move does to money under rows like
  // these is in order-status-name-no-money-db.test.ts.
  it("orders.update_status makes the same moves as on an empty table: no row opens or closes one", async () => {
    const rows = await list();
    const made = await movesTheUpdateToolMakes();
    expect(moves(rows.filter((row) => TODAY.includes(row.key)))).toEqual(made);
  });

  it("the same declared meaning reads the same under any name", async () => {
    await db.orderStatus.deleteMany();
    const declared = { isPaid: true, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: true, customerVisible: false };
    const names = ["cancelled", "refunded", "pending", "tilbud", "CANCELLED", "paid_by_invoice", "x"];
    await db.orderStatus.createMany({
      data: names.map((key, sortOrder) => ({ key, label: `label ${sortOrder}`, sortOrder: sortOrder - 100, ...declared })),
    });
    const rows = await list();
    for (const key of names) expect(meaning(rowOf(rows, key)), key).toEqual(declared);
  });
});

describe.skipIf(!sqlite)("its output schema is the answer's", () => {
  beforeEach(async () => {
    await db.orderStatus.createMany({ data: LIARS });
  });

  it("every row has exactly the keys it lists, and the strict schema parses them", async () => {
    const rows = await list();
    for (const row of rows) expect(Object.keys(row).sort(), row.key).toEqual(ROW_KEYS);
    expect(theTool().output.parse(rows)).toEqual(rows);
  });

  it("and refuses a key it does not list, as the MCP route would", async () => {
    const [row] = await list();
    expect(theTool().output.safeParse([{ ...row, translations: null }]).success).toBe(false);
    expect(theTool().output.safeParse([{ ...row, sortOrder: 0 }]).success).toBe(false);
  });

  it("every stock effect the table knows is one it can say", async () => {
    await db.orderStatus.deleteMany();
    await db.orderStatus.createMany({
      data: STOCK_EFFECTS.map((stockEffect) => ({ key: `own_${stockEffect}`, label: stockEffect, stockEffect })),
    });
    expect(theTool().output.safeParse(await list()).success).toBe(true);
  });
});

/** A database that must not be touched: the refusal has to come before the handler. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error("the handler ran");
  },
});

describe("a caller without orders:read", () => {
  it.each<[string, readonly Scope[]]>([
    ["no scope at all", []],
    ["orders:write alone", ["orders:write"]],
    ["every other read", ["catalog:read", "customer:read", "settings:read", "analytics:read"]],
    ["the storefront chat's scopes", CUSTOMER_CHAT_SCOPES],
  ])("%s is refused before it reads anything", async (_name, granted) => {
    const real = state.prisma;
    state.prisma = untouchable;
    try {
      expect(await invokeTool(NAME, {}, CTX, granted)).toEqual({
        ok: false,
        status: 403,
        error: `Tool '${NAME}' requires scope: orders:read`,
      });
    } finally {
      state.prisma = real;
    }
  });

  it("orders:read alone is enough", async () => {
    const real = state.prisma;
    state.prisma = { orderStatus: { findMany: async () => [] } };
    try {
      await expect(invokeTool(NAME, {}, CTX, ["orders:read"])).resolves.toMatchObject({ ok: true });
    } finally {
      state.prisma = real;
    }
  });
});

describe.skipIf(!sqlite)("over REST and MCP, with a real key", () => {
  async function keyWith(...scopes: Scope[]) {
    const user = await db.user.upsert({
      where: { email: "owner@shop.example.test" },
      update: {},
      create: { email: "owner@shop.example.test", role: "admin" },
    });
    const { plaintext, hash } = generateApiKey();
    await db.apiKey.create({
      data: { userId: user.id, name: "test", keyHash: hash, scopes: JSON.stringify(scopes) },
    });
    return plaintext;
  }

  const rest = (key?: string) =>
    restPost(
      new NextRequest(`http://localhost:3000/api/v1/tools/${NAME}`, {
        method: "POST",
        body: "{}",
        headers: key ? { authorization: `Bearer ${key}` } : {},
      }),
      { params: Promise.resolve({ name: NAME }) },
    );

  type RpcBody = {
    error?: { code: number; message: string };
    result?: {
      tools?: { name: string }[];
      isError?: boolean;
      content?: { type: string; text: string }[];
      structuredContent?: { result?: Row[] };
    };
  };

  async function mcp(method: string, params: unknown, key?: string): Promise<RpcBody> {
    const res = await mcpPost(
      new NextRequest("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as RpcBody;
  }

  const listed = async (key?: string) =>
    ((await mcp("tools/list", {}, key)).result?.tools ?? []).map((tool) => tool.name);
  const called = (key?: string) => mcp("tools/call", { name: NAME, arguments: {} }, key);

  it("REST: no key is 401, a key without the scope is 403, and neither reads the table", async () => {
    // A missing table is worth one warning when it is read, so no warning means no read.
    await raw.execute('DROP TABLE "OrderStatus"');
    const tableReads = () =>
      warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith("[order-statuses]")).length;
    const without = await keyWith("orders:write", "catalog:read");

    expect((await rest()).status).toBe(401);
    expect((await rest(without)).status).toBe(403);
    expect(tableReads()).toBe(0);

    expect((await rest(await keyWith("orders:read"))).status).toBe(200);
    expect(tableReads()).toBe(1);
  });

  it("REST: a key with orders:read gets the rows, a shop's own status included, and leaves no audit row", async () => {
    await db.orderStatus.create({ data: { key: "tilbud", label: "Quote", sortOrder: 15 } });
    const res = await rest(await keyWith("orders:read"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: Row[] };
    expect(body.ok).toBe(true);
    expect(body.result.map((row) => row.key).slice(0, 3)).toEqual(["pending_payment", "pending", "tilbud"]);
    expect(rowOf(body.result, "tilbud").usableByUpdateStatus).toBe(false);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("MCP: the real SDK validates the answer against the strict schema, and lets it through", async () => {
    await db.orderStatus.createMany({ data: LIARS });
    const key = await keyWith("orders:read");

    expect(await listed(key)).toContain(NAME);
    const body = await called(key);

    expect(body.error).toBeUndefined();
    expect(body.result?.isError).toBeFalsy();
    const rows = body.result?.structuredContent?.result ?? [];
    expect(rows).toEqual(await list());
    expect(rows.map((row) => row.key)).toEqual(expect.arrayContaining([...TODAY, ...OWN_LIARS.map((row) => row.key)]));
  });

  it("MCP: a key without the scope neither sees it nor gets an answer", async () => {
    const key = await keyWith("orders:write", "catalog:read");

    expect(await listed(key)).not.toContain(NAME);
    const body = await called(key);

    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.result).toBeUndefined();
  });

  it("MCP: an anonymous client neither sees it nor gets an answer", async () => {
    expect(await listed()).not.toContain(NAME);
    const body = await called();

    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.result).toBeUndefined();
  });
});

describe("where it is listed, and where it is not", () => {
  it("in the registry beside its siblings: a read scoped orders:read, no audit, nothing to revert", () => {
    expect(listTools().map((tool) => tool.name)).toContain(NAME);
    expect(theTool().scope).toBe(getTool("orders.list")?.scope);
    expect(theTool().scope).toBe("orders:read");
    expect(theTool().skipAudit).toBe(true);
    expect(theTool().revertible).toBeFalsy();
  });

  it("through the commerce seam, whose static variant empties it along with the other packs", () => {
    expect(commerceSeam.ordersStatusesTools.map((tool) => tool.name)).toEqual([NAME]);
    expect(commerceStatic.ordersStatusesTools).toEqual([]);
  });

  it("in the catalogue, as a call that needs a key", async () => {
    const res = await catalogueGet(new NextRequest("http://localhost:3000/api/v1/tools?scope=orders:read"));
    const { tools } = (await res.json()) as { tools: { name: string }[] };
    expect(tools.find((tool) => tool.name === NAME)).toEqual({
      name: NAME,
      description: theTool().description,
      scope: "orders:read",
      revertible: false,
      anonymous: false,
      security: "bearer",
    });
  });

  it("the catalogue's schema says what each row holds, and that nothing else comes along", () => {
    const entry = buildToolManifest().find((tool) => tool.name === NAME);
    const items = (entry?.outputJsonSchema as { type?: string; items?: Record<string, unknown> } | undefined)?.items;

    expect(entry?.outputJsonSchema.type).toBe("array");
    expect(Object.keys((items?.properties ?? {}) as object).sort()).toEqual(ROW_KEYS);
    expect(items?.additionalProperties).toBe(false);
    expect((items?.properties as Record<string, unknown>).stockEffect).toMatchObject({ enum: [...STOCK_EFFECTS] });
    expect(entry?.inputJsonSchema).toMatchObject({ type: "object" });
    expect(entry?.description).toMatch(/never from its key or label/);
    expect(entry?.description).toMatch(/usableByUpdateStatus: false/);
    expect((items?.properties as Record<string, unknown>).moveAllowedFrom).toMatchObject({
      description: expect.stringMatching(/does not check a move out of/),
    });
  });

  it("in the OpenAPI document, behind a key", async () => {
    const document = (await buildOpenApiDocument()) as unknown as {
      paths: Record<string, { post: Record<string, unknown> }>;
    };
    expect(document.paths[`/api/v1/tools/${NAME}`].post).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-cartwright-required-scope": "orders:read",
      "x-cartwright-anonymous-read": false,
    });
  });

  it("in the orders row of docs/scopes-and-tools.md", () => {
    const doc = readFileSync(join(ROOT, "docs", "scopes-and-tools.md"), "utf8");
    const row = doc.split("\n").find((line) => line.startsWith("| orders |"));
    expect(row).toContain(`\`${NAME}\``);
  });

  it("not on the public allowlist", () => {
    expect(PUBLIC_AGENT_TOOL_NAMES as readonly string[]).not.toContain(NAME);
    expect(isPublicAgentTool(NAME)).toBe(false);
  });

  it("not in the storefront chat: not on its allowlist, and outside its scopes", () => {
    expect(isCustomerTool(NAME)).toBe(false);
    expect(CUSTOMER_CHAT_SCOPES).not.toContain("orders:read");
  });

  it("not offered to the operator chat, so /admin/integrations keeps the counts it shows", () => {
    expect(isAdminTool(NAME)).toBe(false);
  });
});
