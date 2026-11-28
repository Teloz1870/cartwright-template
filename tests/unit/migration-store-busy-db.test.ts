import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import type { WooPlanSummary } from "@/lib/migration/woo-plan-summary";

/**
 * FILE-DB-BUSY-TRAP — lib/migration/store.ts's writes on a real libSQL file
 * that a second client (another process: `next dev` beside `pnpm woo:import`)
 * holds the write lock of. Measured on @libsql/client 0.17.4 (lib/woo/ledger.ts
 * `casLedger`): a write refused BUSY outside a transaction leaves its connection
 * unable to commit, and the next write on that client reports success — count 1
 * — commits nothing and keeps the write lock. So every write here is its own
 * transaction, and a BUSY is waited out. What "saved" means is read back by a
 * client that did not write it.
 */

const mocks = vi.hoisted(() => ({
  prisma: null as unknown,
  withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/db", () => ({
  get prisma() {
    return mocks.prisma;
  },
  isPostgresDriver: () => false,
}));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

import { retryingTransaction } from "@/lib/db-retry";
import { attestCheck, freezeUrlMap, recordFinishedRun, saveWooPlanSummary, setMailSender, setMigrationProject } from "@/lib/migration/store";

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const SHOP = "https://shop.example.test";
const META = { requestId: "test-busy" };

let dir = "";
let url = "";
/** The module's client: the process that writes. */
let app: PrismaClient;
/** The other process: it holds the write lock. */
let other: PrismaClient;
/** Every error a transaction of the module's client was refused with. */
let refused: unknown[] = [];
/** How many transactions the module's client was asked to run. */
let transactions = 0;
let onRefused = () => {};

const client = () => new PrismaClient({ adapter: new PrismaLibSql({ url }) });

/** The module's client, with each refused transaction reported before it is thrown on. */
function watched(target: PrismaClient): PrismaClient {
  return new Proxy(target, {
    get(t, key) {
      if (key === "$transaction") {
        return (...args: unknown[]) => {
          transactions++;
          return (t.$transaction as (...a: unknown[]) => Promise<unknown>)(...args).catch((error: unknown) => {
            refused.push(error);
            onRefused();
            throw error;
          });
        };
      }
      const value = Reflect.get(t, key, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
  });
}

/** What a client that wrote none of it reads. */
async function readBack<T>(read: (db: PrismaClient) => Promise<T>): Promise<T> {
  const reader = client();
  try {
    return await read(reader);
  } finally {
    await reader.$disconnect();
  }
}

/**
 * `other` takes the file's write lock and keeps it until the module's client is
 * refused, or `write` settles — or, given `forMs`, for that long whatever happens.
 */
async function underLock<T>(write: () => Promise<T>, forMs?: number): Promise<T | { refusedWith: unknown }> {
  let locked = () => {};
  let release = () => {};
  const isLocked = new Promise<void>((resolve) => { locked = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const holder = other.$transaction(async (tx) => {
    // Any write statement takes the lock, also one that matches no row.
    await tx.$executeRaw`UPDATE "MigrationProject" SET "sourceKind"="sourceKind"`;
    locked();
    await (forMs === undefined ? held : new Promise((resolve) => setTimeout(resolve, forMs)));
  });
  await isLocked;
  if (forMs === undefined) onRefused = release;
  try {
    return await write().catch((error: unknown) => ({ refusedWith: error }));
  } finally {
    release();
    onRefused = () => {};
    await holder;
  }
}

const isRefusal = (outcome: unknown): outcome is { refusedWith: unknown } => !!outcome && typeof outcome === "object" && "refusedWith" in outcome;

/** Another process can still write after it: the module's client keeps no lock. */
async function othersCanWrite(): Promise<void> {
  const writer = client();
  try {
    await writer.$transaction((tx) => tx.$executeRaw`UPDATE "MigrationProject" SET "sourceKind"="sourceKind"`);
  } finally {
    await writer.$disconnect();
  }
}

function plan(n: number): WooPlanSummary {
  const tally = { create: 0, update: 0, unchanged: 0, skip: 0, conflict: 0, orphan: 0, blocked: 0 };
  const all = { complete: true, total: 0, fetched: 0 };
  return {
    version: 1, plannedAt: new Date(Date.UTC(2026, 10, 27, 10, 0, n)).toISOString(), durationMs: n, storeUrl: `${SHOP}/`,
    fetchedAt: "2026-11-27T10:00:00.000Z", mappingVersion: 1, currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true,
    collections: { categories: all, products: all, variations: all, wpProducts: all }, counts: { categories: tally, products: tally }, variations: { attached: 0, orphans: 0 },
    missingInSource: { count: 0, first: [] }, warnings: { byCode: {}, first: [] }, snapshotWarnings: [], issues: { count: 0, first: [] },
  };
}

const firstProject = (db: PrismaClient) => db.migrationProject.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
async function seedProject(): Promise<string> {
  return readBack(async (db) => (await db.migrationProject.create({ data: { sourceUrl: SHOP } })).id);
}

type Case = {
  name: string;
  /** What exists before the first write; returns the project id, if one exists. */
  setup: () => Promise<string | null>;
  /** The n-th write, through lib/migration/store.ts. */
  write: (n: number, id: string | null) => Promise<unknown>;
  /** Whether the n-th write is in the file, as another client reads it. */
  landed: (n: number, db: PrismaClient) => Promise<boolean>;
};

const CASES: Case[] = [
  {
    name: "saveWooPlanSummary (the compare-and-set on settings.wooPlan)",
    setup: seedProject,
    write: (n, id) => saveWooPlanSummary(id!, plan(n), "apikey:test", META),
    landed: async (n, db) => ((await firstProject(db)).settings as { wooPlan?: { durationMs?: number } } | null)?.wooPlan?.durationMs === n,
  },
  {
    name: "setMigrationProject creating the project",
    setup: async () => null,
    write: async (n) => {
      // Each write is a create: the project the one before made is removed by another client.
      if (n > 1) await readBack((db) => db.$transaction((tx) => tx.migrationProject.deleteMany()));
      return setMigrationProject({ sourceUrl: `https://shop${n}.example.test` }, "apikey:test", META);
    },
    landed: async (n, db) => (await db.migrationProject.findMany()).some((p) => p.sourceUrl === `https://shop${n}.example.test`),
  },
  {
    name: "setMigrationProject changing the target",
    setup: seedProject,
    write: (n) => setMigrationProject({ targetUrl: `https://new${n}.example.test` }, "apikey:test", META),
    landed: async (n, db) => (await firstProject(db)).targetUrl === `https://new${n}.example.test`,
  },
  {
    name: "setMigrationProject changing the source (the URL map reset with it)",
    setup: seedProject,
    write: (n) => setMigrationProject({ sourceUrl: `https://shop${n}.example.test` }, "apikey:test", META),
    landed: async (n, db) => (await firstProject(db)).sourceUrl === `https://shop${n}.example.test`,
  },
  {
    name: "recordFinishedRun",
    setup: seedProject,
    write: (n, id) => recordFinishedRun({ id: id!, switchedAt: null }, { checkId: `check.${n}`, status: "pass", summary: {}, bindings: {}, startedAt: new Date() }, "apikey:test", META),
    landed: async (n, db) => (await db.migrationCheckRun.count({ where: { checkId: `check.${n}` } })) === 1,
  },
  {
    name: "freezeUrlMap (the URL map replaced in one batch)",
    setup: seedProject,
    write: (n, id) => freezeUrlMap(id!, [{ oldUrl: `${SHOP}/page-${n}`, kind: "page" }], "apikey:test", { dryRun: false, ...META }),
    landed: async (n, db) => (await db.migrationUrlMap.count({ where: { oldUrl: `${SHOP}/page-${n}` } })) === 1,
  },
  {
    name: "attestCheck (the compare-and-set on attestations, its run with it)",
    setup: seedProject,
    write: (n) => attestCheck({ checkId: "pay.test-order", status: "pass", note: `note ${n}` }, "apikey:test", META),
    landed: async (n, db) => ((await firstProject(db)).attestations as Record<string, { note?: string }> | null)?.["pay.test-order"]?.note === `note ${n}`,
  },
  {
    name: "setMailSender (the compare-and-set on the sender settings)",
    setup: seedProject,
    write: (n) => setMailSender({ spfInclude: `spf${n}.example.test` }, "apikey:test", META),
    landed: async (n, db) => ((await firstProject(db)).settings as { spfInclude?: string } | null)?.spfInclude === `spf${n}.example.test`,
  },
];

/** Each test writes to a fresh copy of one file built from the migration baseline. */
let template = "";
// A loaded machine (the gate runs beside others) stretches the pauses a BUSY is waited out with.
const SLOW = 30_000;

describe.skipIf(!sqlite)("lib/migration/store.ts on a libSQL file another process writes to", () => {
  beforeAll(async () => {
    template = mkdtempSync(join(tmpdir(), "cw-migration-busy-template-"));
    const raw = createClient({ url: `file:${join(template, "site.db")}` });
    await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
    raw.close();
  }, 60_000);
  afterAll(() => {
    if (template) rmSync(template, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "cw-migration-busy-"));
    copyFileSync(join(template, "site.db"), join(dir, "site.db"));
    url = `file:${join(dir, "site.db")}`;
    app = client();
    other = client();
    mocks.prisma = watched(app);
    refused = [];
    transactions = 0;
  });

  afterEach(async () => {
    await app?.$disconnect();
    await other?.$disconnect();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it.each(CASES)("$name: after a write meets the lock, the next write on the same client is really committed", async ({ setup, write, landed }) => {
    const id = await setup();
    const first = await underLock(() => write(1, id));
    // Waited out or refused, the first write says which; said saved, it is saved.
    if (!isRefusal(first)) expect(await readBack((db) => landed(1, db))).toBe(true);

    // The trap: this write answers count 1 and commits nothing, holding the lock.
    await write(2, id);
    expect(await readBack((db) => landed(2, db))).toBe(true);
    await expect(othersCanWrite()).resolves.toBeUndefined();
  }, SLOW);

  it.each(CASES)("$name: a write lock held elsewhere is waited out, and what it saved is in the file", async ({ setup, write, landed }) => {
    const id = await setup();
    const first = await underLock(() => write(1, id));
    expect(isRefusal(first) ? first.refusedWith : "saved").toBe("saved");
    expect(refused.length).toBeGreaterThan(0);
    expect(await readBack((db) => landed(1, db))).toBe(true);
    await expect(othersCanWrite()).resolves.toBeUndefined();
  }, SLOW);

  it.each(CASES)("$name: a lock held for a real moment is waited out too: the retries pause, for a BUSY comes back within milliseconds", async ({ setup, write, landed }) => {
    const id = await setup();
    const first = await underLock(() => write(1, id), 120);
    expect(isRefusal(first) ? first.refusedWith : "saved").toBe("saved");
    expect(refused.length).toBeGreaterThan(0);
    expect(await readBack((db) => landed(1, db))).toBe(true);
  }, SLOW);

  it("a refusal that is no BUSY is thrown on the first attempt: a unique-constraint failure runs one transaction, never a second", async () => {
    const projectId = await seedProject();
    const row = { projectId, oldUrl: `${SHOP}/twice`, oldPath: "/twice", kind: "page", images: [] };
    const outcome = await retryingTransaction(mocks.prisma as PrismaClient, (tx) => tx.migrationUrlMap.createMany({ data: [row, row] })).catch((error: unknown) => ({ refusedWith: error }));
    expect(isRefusal(outcome) ? (outcome.refusedWith as { code?: unknown }).code : outcome).toBe("P2002");
    expect(transactions).toBe(1);
    expect(refused).toHaveLength(1);
  }, SLOW);
});
