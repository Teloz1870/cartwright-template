import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";
import {
  DialectMismatch,
  LEASE_STALE_MS,
  LeaseHeld,
  LeaseLost,
  LedgerBusy,
  LedgerInvalid,
  StoreChanged,
  acquireLease,
  fenceLease,
  heartbeatLease,
  isRetryableDbError,
  lockFirst,
  preflightLedger,
  probeDialect,
  readLedger,
  releaseLease,
  storeOf,
  writeLedger,
  type LedgerDeps,
  type WooBaseline,
  type WooRun,
} from "@/lib/woo/ledger";

/**
 * W21-live-2a-3 — the importer's ledger, lease and lock (lib/woo/ledger.ts) on a
 * real libSQL file built from the migration baseline, with a second PrismaClient
 * on the same file as the other writer: `/admin/migration`, or another import run.
 * Only what cannot be measured here is faked: Postgres has no server in CI, so
 * its statement order is read off a fake transaction (spec 2026-10-25, §6).
 *
 * The two clients' statements run on one thread and do not interleave by
 * themselves, so a race is forced with a seam between a compare-and-set's read
 * and its write. A real BUSY comes from a transaction held open on the other client.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const STORE = "https://shop.example.test";
const OTHER_STORE = "https://other.example.test";
const FP_A = "a".repeat(32);
const FP_B = "b".repeat(32);
const ENTRY = { rowId: "cat-12", groups: { core: { saw: FP_A, wrote: FP_B } } };
const PRODUCT_ENTRY = { rowId: "prod-34", groups: { core: { saw: null, wrote: FP_A }, price: { saw: FP_B, wrote: FP_B } } };
const BASELINE = { categories: { "12": ENTRY }, products: { "34": PRODUCT_ENTRY } };
const T = new Date("2026-10-31T10:00:00.500Z");

let dir = "";
let url = "";
let prisma: PrismaClient;
let other: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-woo-ledger-"));
  url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(INIT, "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  other = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await other?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const run = (runId: string, store = STORE): WooRun => ({ runId, store });
const ledger = (over: Record<string, unknown> = {}) => ({ v: 2, store: STORE, lease: null, categories: {}, products: {}, ...over });
const leasedTo = (runId: string, at: Date = new Date()) => ledger({ lease: { runId, heartbeatAt: at.toISOString() } });

async function project(data: { sourceUrl?: string; settings?: Prisma.InputJsonValue; attestations?: Prisma.InputJsonValue; updatedAt?: Date } = {}): Promise<string> {
  return (await prisma.migrationProject.create({ data: { sourceUrl: STORE, ...data } })).id;
}
const stored = (id: string) => other.migrationProject.findUniqueOrThrow({ where: { id } });
const settingsOf = async (id: string) => (await stored(id)).settings as { wooImport?: Record<string, unknown> } & Record<string, unknown>;
const leaseOf = async (id: string) => (await settingsOf(id)).wooImport?.lease;

type ProjectArgs = { where: { id: string }; select: { sourceUrl: true; settings: true; updatedAt: true } };
/** `client`, with a step right after a compare-and-set's read, before its write. */
function afterRead(client: PrismaClient, step: () => Promise<unknown>): LedgerDeps["db"] {
  return {
    migrationProject: {
      findUnique: async (args: ProjectArgs) => {
        const row = await client.migrationProject.findUnique(args);
        await step();
        return row;
      },
    },
    $transaction: (write: Parameters<PrismaClient["$transaction"]>[0]) => client.$transaction(write as never),
  } as unknown as LedgerDeps["db"];
}

/** Resolves for everyone once `count` callers have arrived. */
function meeting(count: number): () => Promise<void> {
  let open = () => {};
  const everyone = new Promise<void>((resolve) => { open = resolve; });
  return () => {
    if (--count <= 0) open();
    return everyone;
  };
}

/**
 * What a write throws while a transaction holds the file's write lock. Run on a
 * client of its own and thrown away: a write refused outside a transaction leaves
 * a libSQL file connection unable to commit (see casLedger), and it would take
 * the rest of this file with it.
 */
async function refused(write: (client: PrismaClient) => Promise<unknown>): Promise<unknown> {
  const bystander = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  try {
    return await write(bystander).then(() => { throw new Error("it landed"); }, (error: unknown) => error);
  } finally {
    await bystander.$disconnect();
  }
}

describe.skipIf(!sqlite)("ledger", () => {
  // ── settings.wooImport v2 ─────────────────────────────────────────────────────────────────

  it("a baseline reads back as written, and a project without one starts empty, bound to its shop", async () => {
    const written = ledger({
      lease: { runId: "a", heartbeatAt: T.toISOString() },
      categories: { "12": ENTRY },
      // Any group may be absent, and a Woo id has no fixed length.
      products: { "34": PRODUCT_ENTRY, "56": { rowId: "prod-56", groups: { price: { saw: null, wrote: FP_A } } }, "1234567890": { rowId: "prod-78", groups: {} } },
    });
    const id = await project({ settings: { wooImport: written, wooPlan: { kept: true } } });
    await expect(readLedger(prisma, id)).resolves.toMatchObject({ store: STORE, ledger: written, settings: { wooPlan: { kept: true } } });
    await expect(readLedger(prisma, await project())).resolves.toMatchObject({ ledger: ledger() });
    await expect(readLedger(prisma, "no-such-project")).rejects.toBeInstanceOf(LedgerInvalid);
  });

  const without = (key: string) => Object.fromEntries(Object.entries(ledger()).filter(([name]) => name !== key));
  const heartbeat = (heartbeatAt: string) => ledger({ lease: { runId: "a", heartbeatAt } });
  const withKey = (key: string) => ledger({ categories: { [key]: ENTRY } });
  const withCore = (core: unknown) => ledger({ categories: { "12": { rowId: "c", groups: { core } } } });
  const withPrice = (price: unknown) => ledger({ products: { "34": { rowId: "p", groups: { price } } } });
  const wrote = (fingerprint: unknown) => withCore({ saw: null, wrote: fingerprint });
  const WROTE = "categories.12.groups.core.wrote:";
  it.each<[string, unknown, string]>([
    ["an older version", ledger({ v: 1 }), "v:"],
    ["a newer version", ledger({ v: 3 }), "v:"],
    ["no version", without("v"), "v:"],
    ["no store", without("store"), "store:"],
    ["a store that is no address", ledger({ store: "shop" }), "store:"],
    ["a store on another scheme", ledger({ store: "ftp://shop.example.test" }), "store:"],
    ["a store on a scheme that only starts like http", ledger({ store: "httpsx://shop.example.test" }), "store:"],
    ["a store on a scheme that only ends like http", ledger({ store: "xhttp://shop.example.test" }), "store:"],
    ["a key nobody wrote", ledger({ cursor: 1 }), "cursor"],
    ["no categories", without("categories"), "categories:"],
    ["no products", without("products"), "products:"],
    ["no lease", without("lease"), "lease:"],
    ["a lease with no heartbeat", ledger({ lease: { runId: "a" } }), "lease.heartbeatAt:"],
    ["a lease with a heartbeat that is no time", heartbeat("yesterday"), "lease.heartbeatAt:"],
    // Date.parse says NaN for this one, and a NaN heartbeat never goes stale: the lease would be held for good.
    ["a lease with a heartbeat on no real date", heartbeat("2026-13-45T10:00:00Z"), "lease.heartbeatAt:"],
    // With no zone, Date.parse reads it in the server's.
    ["a lease with a heartbeat in no zone", heartbeat("2026-10-31T10:00:00"), "lease.heartbeatAt:"],
    ["a lease with a heartbeat at an offset", heartbeat("2026-10-31T10:00:00+01:00"), "lease.heartbeatAt:"],
    ["a lease with a heartbeat that is a date", heartbeat("2026-10-31"), "lease.heartbeatAt:"],
    ["a lease with no run", ledger({ lease: { heartbeatAt: T.toISOString() } }), "lease.runId:"],
    ["a lease with an empty run", ledger({ lease: { runId: "", heartbeatAt: T.toISOString() } }), "lease.runId:"],
    ["a lease with a key nobody wrote", ledger({ lease: { runId: "a", heartbeatAt: T.toISOString(), host: "x" } }), "lease"],
    ["a key that is no Woo id", withKey("abc"), "categories.abc:"],
    ["a key with letters after its digits", withKey("12a"), "categories.12a:"],
    ["a key with letters before its digits", withKey("a12"), "categories.a12:"],
    ["an empty key", withKey(""), "categories.:"],
    ["a key with a line after it", withKey("12\n"), "categories.12\n:"],
    ["a negative key", withKey("-1"), "categories.-1:"],
    ["a decimal key", withKey("1.5"), "categories.1.5:"],
    ["a key that is no Woo id, among products", ledger({ products: { abc: ENTRY } }), "products.abc:"],
    ["an entry with no row", ledger({ categories: { "12": { groups: {} } } }), "categories.12.rowId:"],
    ["an entry with an empty row", ledger({ categories: { "12": { rowId: "", groups: {} } } }), "categories.12.rowId:"],
    ["an entry with a key nobody wrote", ledger({ categories: { "12": { ...ENTRY, hash: "x" } } }), "categories.12"],
    ["an entry with no groups", ledger({ categories: { "12": { rowId: "c" } } }), "categories.12.groups:"],
    ["a group that does not exist", ledger({ products: { "34": { rowId: "p", groups: { seo: { saw: null, wrote: FP_A } } } } }), "products.34.groups"],
    ["a group that is null", withCore(null), "categories.12.groups.core:"],
    ["a price group that is null", withPrice(null), "products.34.groups.price:"],
    ["a price group with a fingerprint that is none", withPrice({ saw: null, wrote: "not-hex" }), "products.34.groups.price.wrote:"],
    // groupFp writes exactly 32 lowercase hex. Read as a base, anything else never equals a row's fingerprint, so an update from the shop would read as an edit here or a conflict.
    ["a fingerprint that is none", wrote("not-hex"), WROTE],
    ["a fingerprint one character short", wrote(FP_A.slice(1)), WROTE],
    ["a fingerprint one character long", wrote(`${FP_A}a`), WROTE],
    ["a whole sha256 as a fingerprint", wrote("a".repeat(64)), WROTE],
    ["a fingerprint with junk after it", wrote(`${FP_A}x`), WROTE],
    ["a fingerprint with junk before it", wrote(`x${FP_A}`), WROTE],
    ["a fingerprint with a line after it", wrote(`${FP_A}\n`), WROTE],
    ["an uppercase fingerprint", wrote(FP_A.toUpperCase()), WROTE],
    ["a fingerprint of the right length that is no hex", wrote("g".repeat(32)), WROTE],
    ["a saw that is no fingerprint", withCore({ saw: "not-hex", wrote: FP_A }), "categories.12.groups.core.saw:"],
    ["a group with no saw", withCore({ wrote: FP_A }), "categories.12.groups.core.saw:"],
    ["a group with no wrote", withCore({ saw: null }), WROTE],
    ["a group that wrote null", wrote(null), WROTE],
    ["a group with a key nobody wrote", withCore({ saw: null, wrote: FP_A, at: 1 }), "categories.12.groups.core"],
    ["null", null, "(top level):"],
  ])("a read that fails validation stops the run and writes nothing: %s", async (_name, wooImport, where) => {
    const id = await project({ settings: { wooImport: wooImport as Prisma.InputJsonValue, wooPlan: { kept: true } } });
    const before = await stored(id);
    const read = readLedger(prisma, id);
    await expect(read).rejects.toBeInstanceOf(LedgerInvalid);
    await expect(read).rejects.toThrow("settings.wooImport");
    await expect(read).rejects.toThrow(where);
    await expect(acquireLease({ db: prisma, projectId: id }, run("a"))).rejects.toBeInstanceOf(LedgerInvalid);
    expect(await stored(id)).toEqual(before);
  });

  it("a read that fails names the first three problems, not every row of a broken baseline", async () => {
    const id = await project({ settings: { wooImport: ledger({ categories: Object.fromEntries([1, 2, 3, 4].map((woo) => [woo, { groups: {} }])) }) } });
    const message = await readLedger(prisma, id).catch((error: Error) => error.message);
    for (const woo of [1, 2, 3]) expect(message).toContain(`categories.${woo}.rowId:`);
    expect(message).not.toContain("categories.4");
  });

  it.each<[string, Prisma.InputJsonValue]>([["a list", [1, 2]], ["a string", "text"], ["a number", 7]])("settings that are %s stop the run rather than being replaced", async (_name, settings) => {
    const id = await project({ settings });
    await expect(readLedger(prisma, id)).rejects.toBeInstanceOf(LedgerInvalid);
    await expect(acquireLease({ db: prisma, projectId: id }, run("a"))).rejects.toBeInstanceOf(LedgerInvalid);
    expect((await stored(id)).settings).toEqual(settings);
  });

  // ── Store binding ─────────────────────────────────────────────────────────────────────────

  it("other store refused with 0 requests", async () => {
    const transport = vi.fn(async (url: string) => new Response(url));
    const importRun = async (projectId: string) => {
      const { store } = await preflightLedger(prisma, projectId, "sqlite");
      await transport(`${store}/wp-json/wc/store/v1/products`);
    };
    // The same steps do reach the network with this shop's own baseline.
    await importRun(await project({ settings: { wooImport: ledger() } }));
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockClear();

    const foreign = await importRun(await project({ settings: { wooImport: ledger({ store: OTHER_STORE }) } })).catch((error: unknown) => error);
    expect(foreign).toBeInstanceOf(StoreChanged);
    expect(String(foreign)).toContain(OTHER_STORE);
    expect(transport).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["https://shop.example.test", "https://shop.example.test"],
    ["https://shop.example.test/", "https://shop.example.test"],
    ["https://SHOP.example.test/da/", "https://shop.example.test/da"],
    ["https://shop.example.test/da", "https://shop.example.test/da"],
    ["https://shop.example.test/da//", "https://shop.example.test/da"],
  ])("the store of %s is %s", (sourceUrl, store) => {
    expect(storeOf(sourceUrl)).toBe(store);
  });

  it("a shop is its origin and path: no query, no fragment, no credentials, no trailing slash", () => {
    expect(storeOf("https://s.test")).toBe("https://s.test");
    expect(storeOf("https://s.test/")).toBe("https://s.test");
    expect(storeOf("https://s.test/da/")).toBe("https://s.test/da");
    expect(storeOf("https://u:p@s.test/da?x=1#y")).toBe("https://s.test/da");
    expect(storeOf("https://s.test/da?x=1")).toBe(storeOf("https://s.test/da"));
  });

  it("a shop on plain http keeps its baseline, for migration.project_set takes one as a source", async () => {
    const store = "http://shop.example.test";
    const id = await project({ sourceUrl: store, settings: { wooImport: ledger({ store }) } });
    await expect(readLedger(prisma, id)).resolves.toMatchObject({ store, ledger: { store } });
  });

  it("two shops on one host are two stores", async () => {
    const elsewhere = await project({ sourceUrl: `${STORE}/de`, settings: { wooImport: ledger({ store: `${STORE}/da` }) } });
    await expect(readLedger(prisma, elsewhere)).rejects.toBeInstanceOf(StoreChanged);
    const own = await project({ sourceUrl: `${STORE}/da/`, settings: { wooImport: ledger({ store: `${STORE}/da` }) } });
    await expect(readLedger(prisma, own)).resolves.toMatchObject({ store: `${STORE}/da` });
  });

  it("a lease is refused to a run that read another shop than the project now names, and binds the baseline to the shop", async () => {
    const id = await project();
    await expect(acquireLease({ db: prisma, projectId: id }, run("a", OTHER_STORE))).rejects.toBeInstanceOf(StoreChanged);
    expect((await stored(id)).settings).toBeNull();
    await acquireLease({ db: prisma, projectId: id }, run("a"));
    expect((await settingsOf(id)).wooImport?.store).toBe(STORE);
  });

  // ── Lease ─────────────────────────────────────────────────────────────────────────────────

  it("second run refused", async () => {
    const id = await project();
    await acquireLease({ db: prisma, projectId: id }, run("first"));
    const before = await stored(id);
    const second = acquireLease({ db: other, projectId: id }, run("second"));
    await expect(second).rejects.toBeInstanceOf(LeaseHeld);
    await expect(second).rejects.toThrow("first");
    await expect(preflightLedger(other, id, "sqlite")).rejects.toBeInstanceOf(LeaseHeld);
    expect(await stored(id)).toEqual(before);
  });

  it("two runs acquiring at once: both read a free lease, both try to write it, exactly one gets it", async () => {
    const id = await project();
    const bothRead = meeting(2);
    const results = await Promise.allSettled([
      acquireLease({ db: afterRead(prisma, bothRead), projectId: id }, run("a")),
      acquireLease({ db: afterRead(other, bothRead), projectId: id }, run("b")),
    ]);
    const lost = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    const won = results.flatMap((r, i) => (r.status === "fulfilled" ? [["a", "b"][i]] : []));
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toBeInstanceOf(LeaseHeld);
    expect(await leaseOf(id)).toMatchObject({ runId: won[0] });
  });

  it("a stale lease is taken over; one exactly 10 minutes old is not stale yet", async () => {
    expect(LEASE_STALE_MS).toBe(10 * 60 * 1000);
    const id = await project({ settings: { wooImport: ledger({ lease: { runId: "dead", heartbeatAt: T.toISOString() }, ...BASELINE }) } });
    const at = (ms: number) => () => new Date(T.getTime() + ms);
    await expect(acquireLease({ db: other, projectId: id, now: at(LEASE_STALE_MS) }, run("next"))).rejects.toBeInstanceOf(LeaseHeld);
    await expect(preflightLedger(other, id, "sqlite", at(LEASE_STALE_MS)())).rejects.toBeInstanceOf(LeaseHeld);
    await expect(preflightLedger(other, id, "sqlite", at(LEASE_STALE_MS + 1)())).resolves.toMatchObject({ store: STORE });
    const taken = await acquireLease({ db: other, projectId: id, now: at(LEASE_STALE_MS + 1) }, run("next"));
    expect(taken).toEqual(ledger({ lease: { runId: "next", heartbeatAt: at(LEASE_STALE_MS + 1)().toISOString() }, ...BASELINE }));
    expect((await settingsOf(id)).wooImport).toEqual(taken);
  });

  it("a run taking its own lease again keeps it: a retry after a lost answer does not lock the run out of itself", async () => {
    const id = await project();
    await acquireLease({ db: prisma, projectId: id, now: () => T }, run("a"));
    const later = new Date(T.getTime() + 1000);
    await acquireLease({ db: prisma, projectId: id, now: () => later }, run("a"));
    expect(await leaseOf(id)).toEqual({ runId: "a", heartbeatAt: later.toISOString() });
  });

  it("a heartbeat moves the lease forward and nothing else; a run that lost the lease is told", async () => {
    const id = await project({ settings: { wooImport: { ...leasedTo("a", T), ...BASELINE }, wooPlan: { kept: true } } });
    const later = new Date(T.getTime() + 60_000);
    await heartbeatLease({ db: prisma, projectId: id, now: () => later }, run("a"));
    expect(await settingsOf(id)).toEqual({ wooImport: { ...leasedTo("a", later), ...BASELINE }, wooPlan: { kept: true } });

    await expect(heartbeatLease({ db: prisma, projectId: id }, run("b"))).rejects.toBeInstanceOf(LeaseLost);
    await expect(heartbeatLease({ db: prisma, projectId: id }, run("a", OTHER_STORE))).rejects.toBeInstanceOf(StoreChanged);
    await expect(heartbeatLease({ db: prisma, projectId: await project() }, run("a"))).rejects.toBeInstanceOf(LeaseLost);
  });

  it("release gives back only this run's lease, keeps the baseline, and never throws", async () => {
    const id = await project({ settings: { wooImport: { ...leasedTo("a"), ...BASELINE }, wooPlan: { kept: true } } });
    const deps = { db: prisma, projectId: id };
    const before = await stored(id);
    await expect(releaseLease(deps, "b")).resolves.toBe(false);
    expect(await stored(id)).toEqual(before);

    await expect(releaseLease(deps, "a")).resolves.toBe(true);
    expect(await settingsOf(id)).toEqual({ wooImport: ledger(BASELINE), wooPlan: { kept: true } });
    await expect(acquireLease({ db: other, projectId: id }, run("b"))).resolves.toMatchObject({ lease: { runId: "b" } });

    // In a `finally`, whatever stopped the run stays the error: a gone project, a broken baseline, a database that fails.
    await expect(releaseLease({ db: prisma, projectId: "no-such-project" }, "a")).resolves.toBe(false);
    await expect(releaseLease({ db: prisma, projectId: await project({ settings: { wooImport: ledger({ v: 1 }) } }) }, "a")).resolves.toBe(false);
    const failing = { migrationProject: { findUnique: async () => { throw new Error("connection lost"); } } } as unknown as LedgerDeps["db"];
    await expect(releaseLease({ db: failing, projectId: id }, "b")).resolves.toBe(false);
  });

  it("a release after the project's source changed still gives the lease back, and the baseline stays bound to its shop", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a") } });
    await other.migrationProject.update({ where: { id }, data: { sourceUrl: OTHER_STORE } });
    await expect(releaseLease({ db: prisma, projectId: id }, "a")).resolves.toBe(true);
    expect((await settingsOf(id)).wooImport).toEqual(ledger());
  });

  it("what lands between a compare-and-set's read and its write is read again and kept", async () => {
    const id = await project({ settings: { wooPlan: { plan: 1 } }, attestations: { signed: true } });
    let moved = false;
    const db = afterRead(prisma, async () => {
      if (moved) return;
      moved = true;
      // saveWooPlanSummary, in the very window: lib/migration/store.ts's own compare-and-set.
      const row = await stored(id);
      await other.migrationProject.updateMany({ where: { id, updatedAt: row.updatedAt }, data: { settings: { wooPlan: { plan: 2 } }, updatedAt: new Date(row.updatedAt.getTime() + 1) } });
    });
    await acquireLease({ db, projectId: id }, run("a"));
    const after = await stored(id);
    expect(after.settings).toMatchObject({ wooPlan: { plan: 2 }, wooImport: { lease: { runId: "a" } } });
    expect(after.attestations).toEqual({ signed: true });
  });

  it("a BUSY from a write lock held elsewhere is waited out; a lease write that keeps losing gives up, bounded", async () => {
    const id = await project();
    let locked = () => {};
    let release = () => {};
    const isLocked = new Promise<void>((resolve) => { locked = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const holder = other.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      locked();
      await held;
    });
    await isLocked;
    const busy: unknown[] = [];
    const db = {
      migrationProject: prisma.migrationProject,
      $transaction: (write: never) =>
        prisma.$transaction(write).catch((error: unknown) => {
          busy.push(error);
          release();
          throw error;
        }),
    } as unknown as LedgerDeps["db"];
    await expect(acquireLease({ db, projectId: id }, run("a"))).resolves.toMatchObject({ lease: { runId: "a" } });
    await holder;
    expect(busy.length).toBeGreaterThan(0);
    for (const error of busy) expect(isRetryableDbError(error), String(error)).toBe(true);

    // It really committed: another client reads the lease, and can write after it.
    expect(await leaseOf(id)).toMatchObject({ runId: "a" });
    await expect(other.$transaction((tx) => tx.migrationProject.update({ where: { id }, data: { attestations: { signed: true } } }))).resolves.toMatchObject({ attestations: { signed: true } });

    const lost = vi.fn(async () => false);
    const losing = { migrationProject: prisma.migrationProject, $transaction: lost } as unknown as LedgerDeps["db"];
    await expect(acquireLease({ db: losing, projectId: await project() }, run("a"))).rejects.toBeInstanceOf(LedgerBusy);
    expect(lost.mock.calls.length).toBeGreaterThan(1);
    expect(lost.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("a write lock held for a real moment is waited out: the retries pause, for a BUSY comes back within milliseconds", async () => {
    const id = await project();
    let locked = () => {};
    const isLocked = new Promise<void>((resolve) => { locked = resolve; });
    const holder = other.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      locked();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    await isLocked;
    await expect(acquireLease({ db: prisma, projectId: id }, run("a"))).resolves.toMatchObject({ lease: { runId: "a" } });
    await holder;
    expect(await leaseOf(id)).toMatchObject({ runId: "a" });
  });

  const FAR_FUTURE = () => new Date("+010000-01-01T00:00:00.000Z");
  it.each<[string, { sourceUrl?: string; settings?: Prisma.InputJsonValue }, (deps: LedgerDeps) => Promise<unknown>, string]>([
    ["a lease for an empty run", {}, (deps) => acquireLease(deps, run("")), "lease.runId:"],
    ["a baseline bound to a source on another scheme", { sourceUrl: "ftp://shop.example.test" }, (deps) => acquireLease(deps, run("a", "ftp://shop.example.test")), "store:"],
    ["a baseline bound to a source with no origin", { sourceUrl: "file:///srv/shop" }, (deps) => acquireLease(deps, run("a", storeOf("file:///srv/shop"))), "store:"],
    ["a lease dated past year 9999", {}, (deps) => acquireLease({ ...deps, now: FAR_FUTURE }, run("a")), "lease.heartbeatAt:"],
    ["a heartbeat dated past year 9999", { settings: { wooImport: leasedTo("a") } }, (deps) => heartbeatLease({ ...deps, now: FAR_FUTURE }, run("a")), "lease.heartbeatAt:"],
  ])("a lease write the next read would refuse is not written, for no call could undo it: %s", async (_name, data, write, where) => {
    const id = await project(data);
    const deps = { db: prisma, projectId: id };
    const before = await stored(id);
    const attempt = write(deps);
    await expect(attempt).rejects.toBeInstanceOf(LedgerInvalid);
    await expect(attempt).rejects.toThrow(where);
    expect(await stored(id)).toEqual(before);

    // The project is as it was: once its source is an address a baseline can name, the next run just starts.
    await other.migrationProject.update({ where: { id }, data: { sourceUrl: STORE } });
    await expect(acquireLease(deps, run("a"))).resolves.toMatchObject({ store: STORE, lease: { runId: "a" } });
    await expect(readLedger(other, id)).resolves.toMatchObject({ ledger: { store: STORE, lease: { runId: "a" } } });
  });

  // ── S1: lockFirst ─────────────────────────────────────────────────────────────────────────

  /** A transaction that records its statements, in the order sent, with Prisma's Postgres placeholders. */
  function recordingTx(rows = 1) {
    const statements: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.reduce((text, part, i) => `${text}$${i}${part}`);
        statements.push({ sql, values });
        return sql.startsWith("UPDATE") ? rows : 0;
      },
    } as unknown as Prisma.TransactionClient;
    return { tx, statements };
  }

  it("postgres statement order", async () => {
    const { tx, statements } = recordingTx();
    await lockFirst(tx, "postgres", "p1");
    expect(statements).toEqual([
      { sql: "SET LOCAL lock_timeout='5s'", values: [] },
      { sql: 'LOCK TABLE "Category","Product","ProductCategory" IN SHARE ROW EXCLUSIVE MODE', values: [] },
      { sql: 'UPDATE "MigrationProject" SET "sourceKind"="sourceKind" WHERE id=$1', values: ["p1"] },
    ]);
    // No Prisma-side rename: the names it locks are the tables the schema creates.
    const init = readFileSync(INIT, "utf8");
    for (const table of ["Category", "Product", "ProductCategory", "MigrationProject"]) expect(init).toContain(`CREATE TABLE "${table}"`);
  });

  it("on libSQL it sends only the no-op update: a Postgres statement would be a syntax error", async () => {
    const { tx, statements } = recordingTx();
    await lockFirst(tx, "sqlite", "p1");
    expect(statements).toEqual([{ sql: 'UPDATE "MigrationProject" SET "sourceKind"="sourceKind" WHERE id=$1', values: ["p1"] }]);
  });

  it.each([0, 2])("rowsAffected %i throws", async (rows) => {
    await expect(lockFirst(recordingTx(rows).tx, "postgres", "p1")).rejects.toBeInstanceOf(LedgerInvalid);
  });

  it("an unknown project throws on a real database, so the transaction rolls back", async () => {
    await expect(prisma.$transaction((tx) => lockFirst(tx, "sqlite", "no-such-project"))).rejects.toBeInstanceOf(LedgerInvalid);
  });

  it("on libSQL it takes the write lock with its first statement: another client's write does not land until the transaction ends", async () => {
    const id = await project();
    const before = await stored(id);
    const slug = `locked-${id}`;
    const write = (client: PrismaClient) => client.category.create({ data: { id: slug, slug, name: "Late" } });
    let refusal: unknown;
    await prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      refusal = await refused(write);
    });
    expect(isRetryableDbError(refusal)).toBe(true);
    expect(await other.category.findUnique({ where: { id: slug } })).toBeNull();
    await write(other);
    expect(await other.category.findUnique({ where: { id: slug } })).not.toBeNull();
    // The lock itself moves nothing /admin/migration compares.
    expect(await stored(id)).toEqual(before);
  });

  it("a chunk refused BUSY and run again from the top commits, on the same client: the retry a transaction can make and a bare write cannot", async () => {
    const id = await project();
    let refusal: unknown;
    await prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      refusal = await other.$transaction((inner) => lockFirst(inner, "sqlite", id)).catch((error: unknown) => error);
    });
    expect(isRetryableDbError(refusal)).toBe(true);
    await other.$transaction(async (inner) => {
      await lockFirst(inner, "sqlite", id);
      await inner.migrationProject.update({ where: { id }, data: { targetUrl: "https://new.example.test" } });
    });
    expect((await prisma.migrationProject.findUniqueOrThrow({ where: { id } })).targetUrl).toBe("https://new.example.test");
    await prisma.$transaction((tx) => lockFirst(tx, "sqlite", id)); // and nobody is locked out after it
  });

  // ── S2: fencing ───────────────────────────────────────────────────────────────────────────

  it("a lost lease stops the chunk inside its transaction, and what it wrote rolls back", async () => {
    const id = await project();
    const longAgo = new Date(Date.now() - LEASE_STALE_MS - 1000);
    await acquireLease({ db: prisma, projectId: id, now: () => longAgo }, run("old"));
    await acquireLease({ db: other, projectId: id }, run("new"));
    const slug = `lost-${id}`;
    const chunk = prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      await tx.category.create({ data: { id: slug, slug, name: "Too late" } });
      await fenceLease(tx, id, run("old"));
    });
    await expect(chunk).rejects.toBeInstanceOf(LeaseLost);
    await expect(chunk).rejects.toThrow("new");
    expect(await other.category.findUnique({ where: { id: slug } })).toBeNull();

    // The old run cannot take it back by heartbeat or release it from under the new one.
    await expect(heartbeatLease({ db: prisma, projectId: id }, run("old"))).rejects.toBeInstanceOf(LeaseLost);
    await expect(releaseLease({ db: prisma, projectId: id }, "old")).resolves.toBe(false);
    expect(await leaseOf(id)).toMatchObject({ runId: "new" });
  });

  it("a released lease is a lost lease; the run still holding it passes, with the baseline", async () => {
    const id = await project({ settings: { wooImport: { ...leasedTo("a"), ...BASELINE } } });
    const inChunk = await prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      return fenceLease(tx, id, run("a"));
    });
    expect(inChunk).toMatchObject({ projectId: id, runId: "a", store: STORE, ledger: BASELINE });
    await releaseLease({ db: prisma, projectId: id }, "a");
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("a")))).rejects.toBeInstanceOf(LeaseLost);
  });

  it("a baseline removed under a running run is a lost lease", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a") } });
    await other.migrationProject.update({ where: { id }, data: { settings: { wooPlan: { plan: 1 } } } });
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("a")))).rejects.toBeInstanceOf(LeaseLost);
  });

  it("store differs throws StoreChanged, whether the project moved or the run read another shop, even with the lease gone too", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a") } });
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("a", OTHER_STORE)))).rejects.toBeInstanceOf(StoreChanged);
    await other.migrationProject.update({ where: { id }, data: { sourceUrl: OTHER_STORE } });
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("a")))).rejects.toBeInstanceOf(StoreChanged);
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("a", OTHER_STORE)))).rejects.toBeInstanceOf(StoreChanged);
    await expect(prisma.$transaction((tx) => fenceLease(tx, id, run("b")))).rejects.toBeInstanceOf(StoreChanged);
  });

  // ── S6: the write ─────────────────────────────────────────────────────────────────────────

  it.each([
    ["the clock in the previous write's millisecond", 0, 1],
    ["the clock behind the previous write", -5000, 1],
    ["the clock one millisecond ahead", 1, 1],
    ["the clock well ahead", 5000, 5000],
  ])("same-millisecond rule, with %s: /admin/migration's compare-and-set never matches a change made after its read", async (_name, offset, moved) => {
    const id = await project({ updatedAt: T, settings: { wooImport: leasedTo("a", T) } });
    await prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      await writeLedger(tx, await fenceLease(tx, id, run("a")), BASELINE, new Date(T.getTime() + offset));
    });
    expect((await stored(id)).updatedAt.getTime()).toBe(T.getTime() + moved);
    // attestCheck, having read the row just before our write:
    const { count } = await other.migrationProject.updateMany({ where: { id, updatedAt: T }, data: { attestations: { signed: true } } });
    expect(count).toBe(0);
  });

  it("same-millisecond rule, for the lease's own writes", async () => {
    const id = await project({ updatedAt: T });
    const frozen = { db: prisma, projectId: id, now: () => T };
    const steps = [() => acquireLease(frozen, run("a")), () => heartbeatLease(frozen, run("a")), () => releaseLease(frozen, "a")];
    for (const [i, step] of steps.entries()) {
      const before = (await stored(id)).updatedAt;
      await step();
      expect((await stored(id)).updatedAt.getTime()).toBe(T.getTime() + i + 1);
      const { count } = await other.migrationProject.updateMany({ where: { id, updatedAt: before }, data: { attestations: { signed: true } } });
      expect(count).toBe(0);
    }
  });

  it("the baseline lands in the chunk's transaction with a fresh heartbeat, and goes when the chunk rolls back", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a", T), wooPlan: { kept: true } }, attestations: { signed: true } });
    const later = new Date(T.getTime() + 1000);
    const chunk = async (fail: boolean) =>
      prisma.$transaction(async (tx) => {
        await lockFirst(tx, "sqlite", id);
        await writeLedger(tx, await fenceLease(tx, id, run("a")), BASELINE, later);
        if (fail) throw new Error("a later statement failed");
      });
    const before = await stored(id);
    await expect(chunk(true)).rejects.toThrow("a later statement failed");
    expect(await stored(id)).toEqual(before);
    await chunk(false);
    const after = await stored(id);
    expect(after.settings).toEqual({ wooImport: { ...leasedTo("a", later), ...BASELINE }, wooPlan: { kept: true } });
    expect(after.attestations).toEqual({ signed: true });
  });

  it("a baseline replaces the stored one: an entry left out is gone, so a chunk passes all of it, not only its own rows", async () => {
    const old = { rowId: "old", groups: {} };
    const id = await project({ settings: { wooImport: { ...leasedTo("a", T), categories: { "1": old, "12": old }, products: { "2": old, "34": old } } } });
    const write = (baseline: WooBaseline) =>
      prisma.$transaction(async (tx) => {
        await lockFirst(tx, "sqlite", id);
        await writeLedger(tx, await fenceLease(tx, id, run("a")), baseline);
      });
    const storedBaseline = async () => {
      const { categories, products } = (await readLedger(other, id)).ledger;
      return { categories, products };
    };
    await write(BASELINE);
    expect(await storedBaseline()).toEqual(BASELINE);
    // Spec §7.3: importing a row deleted here again takes removing its entry, the last one too.
    await write({ categories: {}, products: {} });
    expect(await storedBaseline()).toEqual({ categories: {}, products: {} });
  });

  it("the rest of settings is never touched or dropped, by any write", async () => {
    const rest = { wooPlan: { counts: { categories: 3 } }, note: "kept", nested: { list: [1, { a: null }] } };
    const id = await project({ settings: rest });
    const deps = { db: prisma, projectId: id };
    const expectRest = async () => {
      const { wooImport: _ledger, ...others } = await settingsOf(id);
      expect(others).toEqual(rest);
    };
    await acquireLease(deps, run("a"));
    await expectRest();
    await heartbeatLease(deps, run("a"));
    await expectRest();
    await prisma.$transaction(async (tx) => writeLedger(tx, await fenceLease(tx, id, run("a")), BASELINE));
    await expectRest();
    await releaseLease(deps, "a");
    await expectRest();
    expect((await settingsOf(id)).wooImport).toEqual({ ...ledger(), ...BASELINE });
  });

  it("a baseline the next read would refuse is not written", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a") } });
    const before = await stored(id);
    const bad = { categories: { "12": { rowId: "c", groups: { core: { saw: null, wrote: "not-hex" } } } }, products: {} };
    await expect(prisma.$transaction(async (tx) => writeLedger(tx, await fenceLease(tx, id, run("a")), bad))).rejects.toBeInstanceOf(LedgerInvalid);
    expect(await stored(id)).toEqual(before);
    // Refused before the statement, not by the rollback: with no transaction around it, nothing lands either.
    await expect(writeLedger(prisma, await fenceLease(prisma, id, run("a")), bad)).rejects.toBeInstanceOf(LedgerInvalid);
    expect(await stored(id)).toEqual(before);
  });

  it("a row that moved after the fence's read is not overwritten", async () => {
    const id = await project({ settings: { wooImport: leasedTo("a"), wooPlan: { plan: 1 } } });
    const read = await fenceLease(prisma, id, run("a"));
    const moved = await other.migrationProject.update({ where: { id }, data: { settings: { wooImport: leasedTo("a"), wooPlan: { plan: 2 } }, updatedAt: new Date(read.updatedAt.getTime() + 1) } });
    await expect(writeLedger(prisma, read, BASELINE)).rejects.toBeInstanceOf(LedgerBusy);
    expect(await stored(id)).toEqual(moved);
  });

  // ── The dialect probe ─────────────────────────────────────────────────────────────────────

  /** A Postgres that answers only what Postgres answers, and records what it was asked. */
  function fakePostgres() {
    const asked: string[] = [];
    const db = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join("?");
        asked.push(sql);
        if (sql === "show server_version") return [{ server_version: "16.2" }];
        throw new Error("function sqlite_version() does not exist");
      },
    } as unknown as Prisma.TransactionClient;
    return { db, asked };
  }

  it("dialect probe mismatch stops", async () => {
    await expect(probeDialect(prisma, "sqlite")).resolves.toBeUndefined();
    await expect(probeDialect(prisma, "postgres")).rejects.toBeInstanceOf(DialectMismatch);

    const postgres = fakePostgres();
    await expect(probeDialect(postgres.db, "postgres")).resolves.toBeUndefined();
    const mismatch: unknown = await probeDialect(postgres.db, "sqlite").catch((error: unknown) => error);
    expect(mismatch).toBeInstanceOf(DialectMismatch);
    expect(String((mismatch as Error).cause)).toContain("sqlite_version"); // what the database said is kept
    expect(postgres.asked).toEqual(["show server_version", "select sqlite_version()"]);

    // Before the project is read, and before anything else a run does.
    await expect(preflightLedger(prisma, "no-such-project", "postgres")).rejects.toBeInstanceOf(DialectMismatch);
    await expect(preflightLedger(prisma, "no-such-project", "sqlite")).rejects.toBeInstanceOf(LedgerInvalid);
  });

  // ── Retry classification ──────────────────────────────────────────────────────────────────

  it("a real BUSY is retryable: a model call, a raw statement, either in a transaction", async () => {
    const id = await project();
    const refusals: unknown[] = [];
    await prisma.$transaction(async (tx) => {
      await lockFirst(tx, "sqlite", id);
      refusals.push(await refused((client) => client.migrationProject.updateMany({ where: { id }, data: { targetUrl: null } })));
      refusals.push(await refused((client) => client.$executeRaw`UPDATE "MigrationProject" SET "sourceKind"="sourceKind" WHERE id=${id}`));
      refusals.push(await refused((client) => client.$transaction((inner) => inner.migrationProject.updateMany({ where: { id }, data: { targetUrl: null } }))));
      refusals.push(await refused((client) => client.$transaction((inner) => lockFirst(inner, "sqlite", id))));
    });
    expect(refusals).toHaveLength(4);
    for (const error of refusals) expect(isRetryableDbError(error), String(error)).toBe(true);
  });

  it("a real unique violation, syntax error or transaction past its timeout is not", async () => {
    const slug = `twice-${await project()}`;
    await prisma.category.create({ data: { slug, name: "Once" } });
    const unique = await refused((client) => client.category.create({ data: { slug, name: "Twice" } }));
    const syntax = await refused((client) => client.$executeRawUnsafe("this is not a statement"));
    const expired = await refused((client) =>
      client.$transaction(async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        await tx.category.count();
      }, { timeout: 20 }),
    );
    expect(expired).toMatchObject({ code: "P2028" });
    for (const error of [unique, syntax, expired]) expect(isRetryableDbError(error), String(error)).toBe(false);
  });

  const driver = (code: string, cause: Record<string, unknown>) => ({ code, meta: { driverAdapterError: { name: "DriverAdapterError", cause } } });

  it.each<[string, unknown]>([
    ["P2034, a model call's write conflict", { code: "P2034" }],
    ["COMMIT's bare driver error, as measured", { name: "LibsqlError", code: "SQLITE_BUSY", rawCode: 5, cause: { code: "SQLITE_BUSY", rawCode: 5 } }],
    ["SQLITE_BUSY_SNAPSHOT from a driver", { code: "SQLITE_BUSY_SNAPSHOT", rawCode: 517 }],
    ["SQLITE_BUSY_SNAPSHOT through Prisma", driver("P1008", { originalCode: "517", originalMessage: "SQLITE_BUSY_SNAPSHOT: database is locked", kind: "SocketTimeout" })],
    ["a serialization failure, raw", driver("P2010", { originalCode: "40001", originalMessage: "could not serialize access due to concurrent update", kind: "TransactionWriteConflict" })],
    ["a deadlock, raw", driver("P2010", { originalCode: "40P01", originalMessage: "deadlock detected", kind: "TransactionWriteConflict" })],
    ["a lock wait past lock_timeout, raw", driver("P2010", { originalCode: "55P03", originalMessage: "canceling statement due to lock timeout", kind: "postgres", code: "55P03" })],
    ["a lock wait past lock_timeout, on a model call", driver("P2039", { originalCode: "55P03", originalMessage: "canceling statement due to lock timeout", kind: "postgres", code: "55P03" })],
    ["one wrapped in another", new Error("the chunk failed", { cause: driver("P2010", { originalCode: "40001" }) })],
  ])("retryable: %s", (_name, error) => {
    expect(isRetryableDbError(error)).toBe(true);
  });

  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  it.each<[string, unknown]>([
    ["a unique violation", { code: "P2002" }],
    ["a code that only starts like a retryable one", { code: "P20345" }],
    ["a transaction past its timeout", { code: "P2028" }],
    ["a timeout on the socket, not on a lock", driver("P1008", { originalCode: "ETIMEDOUT", originalMessage: "connect ETIMEDOUT", kind: "SocketTimeout" })],
    ["a unique violation on Postgres, raw", driver("P2010", { originalCode: "23505", kind: "UniqueConstraintViolation" })],
    ["a SQLSTATE no retry clears", driver("P2039", { originalCode: "22021", originalMessage: "invalid byte sequence", kind: "postgres", code: "22021" })],
    ["a constraint that merely names a code", driver("P2002", { originalCode: "2067", originalMessage: "SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: 40001.SQLITE_BUSY", kind: "UniqueConstraintViolation" })],
    ["a message quoting a sku", new Error("sku 40001 is taken")],
    ["a message quoting a name", new Error("SQLITE_BUSY: not from any driver")],
    ["a lost lease", new LeaseLost("lost")],
    ["another shop", new StoreChanged("changed")],
    ["a busy ledger: its own retries are spent", new LedgerBusy("busy")],
    ["null", null],
    ["undefined", undefined],
    ["a bare code", "SQLITE_BUSY"],
    ["a number where a code goes", { code: 40001 }],
    ["a cause that points at itself", cyclic],
  ])("not retryable: %s", (_name, error) => {
    expect(isRetryableDbError(error)).toBe(false);
  });
});
