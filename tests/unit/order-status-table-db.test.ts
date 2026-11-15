import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { STATUS_COLORS } from "@/lib/orders/status";
import { STATIC_ORDER_STATUS_ROWS } from "@/lib/orders/status-table";
import { stripComments } from "../helpers/claims";

/**
 * ORD1-a1 — the reader and the seed, on a real libSQL file. Every live database
 * has this table empty, and a fork may not have it at all, so the fallback is the
 * normal case here, not an edge.
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

import { getOrderStatuses } from "@/lib/orders/status-reader";
import { seedOrderStatuses } from "@/lib/orders/status-seed";

// Each test runs real routes or renders real pages on a real database file: a
// busy runner must not turn slow into red.
vi.setConfig({ testTimeout: 30_000 });

let dir = "";
let raw: Client;
let db: PrismaClient;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-order-status-"));
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

/** The row as the seed writes it: Prisma leaves `translations` NULL. */
const seededRows = () => db.orderStatus.findMany({ orderBy: { sortOrder: "asc" } });

describe.skipIf(!sqlite)("getOrderStatuses on a real database", () => {
  it("an empty table reads as the static table, and that is not worth a warning", async () => {
    expect(await db.orderStatus.count()).toBe(0);
    expect(await getOrderStatuses()).toEqual(STATIC_ORDER_STATUS_ROWS);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a table seeded 1:1 reads as the static table", async () => {
    await seedOrderStatuses(db);
    expect(await db.orderStatus.count()).toBe(STATIC_ORDER_STATUS_ROWS.length);
    expect(await getOrderStatuses()).toEqual(STATIC_ORDER_STATUS_ROWS);
  });

  it("a missing table reads as the static table, and says so once", async () => {
    await raw.execute('DROP TABLE "OrderStatus"');
    await expect(db.orderStatus.findMany()).rejects.toThrow();

    expect(await getOrderStatuses()).toEqual(STATIC_ORDER_STATUS_ROWS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a shop's rows overlay it: its label, colour, order and declared meaning, and a status of its own", async () => {
    await db.orderStatus.createMany({
      data: [
        { key: "paid", label: "Betalt", color: "bg-pink-100 text-pink-800", sortOrder: 95, isPaid: false, countsAsRevenue: false },
        { key: "mine", label: "Mine", sortOrder: 15, isPaid: true, stockEffect: "reserve", translations: { en: "Mine" } },
      ],
    });

    const rows = await getOrderStatuses();

    expect(rows).toHaveLength(STATIC_ORDER_STATUS_ROWS.length + 1);
    expect(rows.find((r) => r.key === "paid")).toMatchObject({
      label: "Betalt",
      color: "bg-pink-100 text-pink-800",
      sortOrder: 95,
      isPaid: false,
      countsAsRevenue: false,
    });
    expect(rows.find((r) => r.key === "mine")).toMatchObject({
      label: "Mine",
      sortOrder: 15,
      isPaid: true,
      stockEffect: "reserve",
      translations: { en: "Mine" },
    });
    expect(rows.map((r) => r.key).slice(0, 3)).toEqual(["pending_payment", "pending", "mine"]);
    expect(rows.map((r) => r.key).indexOf("paid")).toBeGreaterThan(rows.map((r) => r.key).indexOf("processing"));
  });

  it("two rows on the same sortOrder come back in the same order every time", async () => {
    await db.orderStatus.createMany({
      data: [
        { key: "zed", label: "Zed", sortOrder: 5 },
        { key: "abe", label: "Abe", sortOrder: 5 },
      ],
    });
    const keys = (await getOrderStatuses()).map((r) => r.key);
    expect(keys.slice(1, 3)).toEqual(["abe", "zed"]);
  });
});

describe("getOrderStatuses never throws", () => {
  const CASES: [string, unknown][] = [
    ["the query rejects", { orderStatus: { findMany: () => Promise.reject(new Error("connection refused")) } }],
    ["the query throws where it stands", { orderStatus: { findMany: () => { throw new Error("adapter gone"); } } }],
    ["the client predates the model", {}],
    ["a rejection that is not an Error", { orderStatus: { findMany: () => Promise.reject("nope") } }],
    ["a row that is not a row", { orderStatus: { findMany: async () => [{ key: "x" }] } }],
    ["what comes back is not a list", { orderStatus: { findMany: async () => ({ rows: [] }) } }],
  ];

  it.each(CASES)("%s: the static table", async (_name, client) => {
    const real = state.prisma;
    state.prisma = client;
    try {
      await expect(getOrderStatuses()).resolves.toEqual(STATIC_ORDER_STATUS_ROWS);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      state.prisma = real;
    }
  });
});

describe("getOrderStatuses is one query per request", () => {
  it("goes through React's request cache", async () => {
    // Outside a render React's `cache` passes straight through, so this stands in
    // for the request scope it gives inside one: remembered until the scope ends.
    vi.resetModules();
    vi.doMock("react", async (importOriginal) => ({
      ...(await importOriginal<typeof import("react")>()),
      cache: <T,>(fn: () => T) => {
        let first: { value: T } | undefined;
        return () => (first ??= { value: fn() }).value;
      },
    }));
    const findMany = vi.fn(async () => []);
    const real = state.prisma;
    state.prisma = { orderStatus: { findMany } };
    try {
      const { getOrderStatuses: memoised } = await import("@/lib/orders/status-reader");
      await memoised();
      await memoised();
      expect(findMany).toHaveBeenCalledTimes(1);
    } finally {
      state.prisma = real;
      vi.doUnmock("react");
      vi.resetModules();
    }
  });
});

describe.skipIf(!sqlite)("seedOrderStatuses", () => {
  it("writes the static table 1:1", async () => {
    await seedOrderStatuses(db);
    const rows = await seededRows();
    expect(rows.map(({ createdAt: _createdAt, ...row }) => row)).toEqual(STATIC_ORDER_STATUS_ROWS);
  });

  it("a second run changes nothing, not even a timestamp", async () => {
    await seedOrderStatuses(db);
    const first = await seededRows();
    await seedOrderStatuses(db);
    expect(await seededRows()).toEqual(first);
  });

  it("never overwrites a row a shop changed, and leaves a status of its own alone", async () => {
    await seedOrderStatuses(db);
    const changed = {
      label: "Betalt",
      color: "bg-pink-100 text-pink-800",
      sortOrder: 999,
      isPaid: false,
      isFinal: true,
      countsAsRevenue: false,
      stockEffect: "release",
      notifyCustomer: false,
      customerVisible: false,
      translations: { en: "Paid up" },
    };
    await db.orderStatus.update({ where: { key: "paid" }, data: changed });
    await db.orderStatus.create({ data: { key: "mine", label: "Mine", sortOrder: 15 } });

    await seedOrderStatuses(db);

    expect(await db.orderStatus.findUniqueOrThrow({ where: { key: "paid" } })).toMatchObject(changed);
    expect(await db.orderStatus.findUniqueOrThrow({ where: { key: "mine" } })).toMatchObject({ label: "Mine", sortOrder: 15 });
    expect(await db.orderStatus.count()).toBe(STATIC_ORDER_STATUS_ROWS.length + 1);
  });

  it("on a table a shop filled first, it only adds what is missing", async () => {
    await db.orderStatus.create({ data: { key: "shipped", label: "On its way", color: STATUS_COLORS.paid } });

    await seedOrderStatuses(db);

    expect(await db.orderStatus.count()).toBe(STATIC_ORDER_STATUS_ROWS.length);
    expect(await db.orderStatus.findUniqueOrThrow({ where: { key: "shipped" } })).toMatchObject({
      label: "On its way",
      color: STATUS_COLORS.paid,
      sortOrder: 0,
    });
  });
});

describe("prisma/seed.ts runs it", () => {
  const seed = stripComments(readFileSync(join(ROOT, "prisma", "seed.ts"), "utf8"));

  it("on a fresh database, past the guard", () => {
    const guard = seed.indexOf("evaluateSeedSafety(");
    const call = seed.indexOf("seedOrderStatuses(prisma)");
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });

  it("without being able to fail the seed: with no rows the admin reads the same statuses from code", () => {
    expect(seed).toMatch(/seedOrderStatuses\(prisma\)\.catch\(/);
  });

  it("and the wipe above it leaves the table alone, so an operator's re-seed keeps a shop's rows", () => {
    expect(seed).not.toMatch(/orderStatus\.deleteMany/);
  });
});
