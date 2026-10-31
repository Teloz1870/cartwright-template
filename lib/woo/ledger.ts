import { z } from "zod";

import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import type { GroupName, WooBaseEntry } from "@/lib/woo/groups";

/**
 * W21-live-2 — what an import run keeps in its migration project, and what keeps
 * writers apart (spec 2026-10-25, §3B, §3F). `settings.wooImport` holds the last
 * run's baseline, bound to one shop, and a lease that keeps a second run out; a
 * chunk's transaction takes `lockFirst` before it reads, and `fenceLease` stops
 * it once the lease is no longer its own. No table of its own: the rest of
 * `settings` sits beside it, and every write carries it along. The client, the
 * project and the dialect are injected; this module holds none of them.
 */

export type WooDialect = "sqlite" | "postgres";
/** How long after its last heartbeat a lease still counts as its run's; after that, another run may take it over. */
export const LEASE_STALE_MS = 10 * 60 * 1000;
const CAS_ATTEMPTS = 5;
/** Grows per attempt: a file database answers BUSY within 2 ms (busy_timeout 0, measured), so retries with no pause would all meet the same lock. */
const CAS_BACKOFF_MS = 50;

type ProjectDb = Pick<Prisma.TransactionClient, "migrationProject">;
type RawWrite = Pick<Prisma.TransactionClient, "$executeRaw">;
type RawRead = Pick<Prisma.TransactionClient, "$queryRaw">;

class LedgerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
/** The project is gone, or `settings` holds what this version cannot read, or a write would leave it holding that. */
export class LedgerInvalid extends LedgerError {}
/** Another live run holds the lease. */
export class LeaseHeld extends LedgerError {}
/** The lease was taken over or released: this run stops writing. */
export class LeaseLost extends LedgerError {}
/** The baseline, the project's source and the shop a run read are not one shop. */
export class StoreChanged extends LedgerError {}
/** The database is not the dialect the run was told. */
export class DialectMismatch extends LedgerError {}
/** Others kept moving the project past the bounded retries, or moved it under a transaction's lock. */
export class LedgerBusy extends LedgerError {}

const fingerprint = z.string().regex(/^[0-9a-f]{32}$/);
const groupBase = z.object({ saw: fingerprint.nullable(), wrote: fingerprint }).strict();
// Keyed by GroupName: a new group does not compile until a baseline can hold it.
const groups: Record<GroupName, z.ZodOptional<typeof groupBase>> = { core: groupBase.optional(), price: groupBase.optional() };
const entries = z.record(z.string().regex(/^\d+$/), z.object({ rowId: z.string().min(1), groups: z.object(groups).strict() }).strict());
const leaseSchema = z.object({ runId: z.string().min(1), heartbeatAt: z.iso.datetime() }).strict();
const ledgerSchema = z.object({
  v: z.literal(2),
  store: z.url({ protocol: /^https?$/ }),
  lease: leaseSchema.nullable(),
  categories: entries,
  products: entries,
}).strict();

export type WooLease = { runId: string; heartbeatAt: string };
/** What the last run left per kind, by Woo id: what decide() reads a row's base from. */
export type WooBaseline = Record<"categories" | "products", Readonly<Record<string, WooBaseEntry>>>;
export type WooLedger = WooBaseline & { v: 2; store: string; lease: WooLease | null };
/** A project as a run read it: its shop, the settings a write carries along, the `updatedAt` a compare-and-set compares. */
export type LedgerRead = { projectId: string; store: string; settings: Prisma.JsonObject; updatedAt: Date; ledger: WooLedger };
/** A read `fenceLease` let through: the only one `writeLedger` takes. */
export type FencedRead = LedgerRead & { runId: string };
/** A run: its id, and the shop its snapshot came from. */
export type WooRun = { runId: string; store: string };
export type LedgerDeps = { db: ProjectDb & Pick<PrismaClient, "$transaction">; projectId: string; now?: () => Date };

/**
 * The shop a baseline belongs to: the source's origin, and its path when
 * WordPress sits in a subdirectory, for two shops on one host are two shops
 * (`shopBase` in lib/migration/store.ts, which is server-only). At a root it is the origin.
 */
export function storeOf(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function parseLedger(value: unknown): WooLedger {
  const parsed = ledgerSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(top level)"}: ${i.message}`).join("; ");
  throw new LedgerInvalid(`settings.wooImport must be a baseline this version can read, and this is not (${issues}). The run stops here, and nothing was written.`);
}

async function readProject(db: ProjectDb, projectId: string): Promise<LedgerRead> {
  const project = await db.migrationProject.findUnique({ where: { id: projectId }, select: { sourceUrl: true, settings: true, updatedAt: true } });
  if (!project) throw new LedgerInvalid(`Migration project ${projectId} does not exist.`);
  const stored = project.settings ?? {};
  if (typeof stored !== "object" || Array.isArray(stored)) throw new LedgerInvalid("The migration project's settings are not an object, so a baseline cannot be kept beside them. The run stops here, and nothing was written.");
  const store = storeOf(project.sourceUrl);
  const ledger: WooLedger = stored.wooImport === undefined ? { v: 2, store, lease: null, categories: {}, products: {} } : parseLedger(stored.wooImport);
  return { projectId, store, settings: stored, updatedAt: project.updatedAt, ledger };
}

function assertOneStore({ store, ledger }: LedgerRead, runStore: string = store): void {
  if (ledger.store !== store) throw new StoreChanged(`This migration project's baseline belongs to ${ledger.store}, but its source is ${store}. Another shop's baseline is never used.`);
  if (runStore !== store) throw new StoreChanged(`This run read ${runStore}, but the migration project's source is now ${store}. Nothing more is written; run it again.`);
}

function assertLeaseFree(lease: WooLease | null, runId: string | null, now: Date): void {
  if (!lease || lease.runId === runId || now.getTime() - Date.parse(lease.heartbeatAt) > LEASE_STALE_MS) return;
  throw new LeaseHeld(`Import run ${lease.runId} holds this migration project; its last heartbeat was ${lease.heartbeatAt}. Wait for it, or run again once that is ${LEASE_STALE_MS / 60_000} minutes old.`);
}

function assertLeaseOurs({ ledger: { lease } }: LedgerRead, runId: string): void {
  if (lease?.runId !== runId) throw new LeaseLost(`Import run ${runId} no longer holds this migration project (${lease ? `run ${lease.runId} does` : "nobody does"}), so it stops writing.`);
}

/** The baseline a run may use: valid and this shop's. Another shop's is refused here, before any request to the shop. */
export async function readLedger(db: ProjectDb, projectId: string): Promise<LedgerRead> {
  const read = await readProject(db, projectId);
  assertOneStore(read);
  return read;
}

/** Spec §3C's database half, no network: the dialect, then the baseline, then no other live run. */
export async function preflightLedger(db: ProjectDb & RawRead, projectId: string, dialect: WooDialect, now: Date = new Date()): Promise<LedgerRead> {
  await probeDialect(db, dialect);
  const read = await readLedger(db, projectId);
  assertLeaseFree(read.ledger.lease, null, now);
  return read;
}

/**
 * The one way the ledger reaches the database: `settings` as read plus the
 * ledger, on a compare-and-set that moves `updatedAt` strictly forward, so the
 * same compare-and-set in /admin/migration (lib/migration/store.ts) never
 * matches a change made in the millisecond it read. What the next read would
 * refuse is refused here, from every writer: once stored it stops every later
 * run and every release, and no call of this module can clear it.
 */
async function casWrite(db: ProjectDb, read: LedgerRead, ledger: WooLedger, now: Date): Promise<boolean> {
  const settings = { ...read.settings, wooImport: parseLedger(ledger) as unknown as Prisma.InputJsonObject };
  const updatedAt = new Date(Math.max(now.getTime(), read.updatedAt.getTime() + 1));
  const { count } = await db.migrationProject.updateMany({ where: { id: read.projectId, updatedAt: read.updatedAt }, data: { settings, updatedAt } });
  return count === 1;
}

/**
 * A change outside a chunk: on a lost compare-and-set or a BUSY it reads again,
 * so what landed meanwhile is kept. `change` returning null writes nothing. Even
 * this one statement is its own transaction: on a libSQL file, a write refused
 * BUSY outside a transaction leaves its connection unable to commit, and the
 * retry reports success, commits nothing and keeps the write lock (measured on
 * @libsql/client 0.17.4). A transaction's connection goes with its rollback.
 */
async function casLedger<T extends WooLedger | null>({ db, projectId, now }: LedgerDeps, change: (read: LedgerRead, now: Date) => T): Promise<T> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, CAS_BACKOFF_MS * attempt));
    try {
      const read = await readProject(db, projectId);
      const at = now?.() ?? new Date();
      const next = change(read, at);
      if (next === null || (await db.$transaction((tx) => casWrite(tx, read, next, at)))) return next;
    } catch (error) {
      if (!isRetryableDbError(error)) throw error;
    }
  }
  throw new LedgerBusy(`Other writers kept moving migration project ${projectId}, so its lease did not change. Try again.`);
}

const leasedTo = (ledger: WooLedger, runId: string, now: Date): WooLedger => ({ ...ledger, lease: { runId, heartbeatAt: now.toISOString() } });

/** Takes the lease when it is free, stale or already this run's (a retry after a lost answer); otherwise LeaseHeld. */
export function acquireLease(deps: LedgerDeps, run: WooRun): Promise<WooLedger> {
  return casLedger(deps, (read, now) => {
    assertOneStore(read, run.store);
    assertLeaseFree(read.ledger.lease, run.runId, now);
    return leasedTo(read.ledger, run.runId, now);
  });
}

export async function heartbeatLease(deps: LedgerDeps, run: WooRun): Promise<void> {
  await casLedger(deps, (read, now) => {
    assertOneStore(read, run.store);
    assertLeaseOurs(read, run.runId);
    return leasedTo(read.ledger, run.runId, now);
  });
}

/**
 * Gives the lease back; true if this call did. Never throws: it runs in the
 * caller's `finally` and must not hide why a run stopped. One it could not give
 * back (false) goes stale by itself. The baseline stays, also of another shop.
 */
export async function releaseLease(deps: LedgerDeps, runId: string): Promise<boolean> {
  try {
    return (await casLedger(deps, (read) => (read.ledger.lease?.runId === runId ? { ...read.ledger, lease: null } : null))) !== null;
  } catch {
    return false;
  }
}

/**
 * S1, a chunk transaction's first statements. Postgres: the three catalogue
 * tables locked before any snapshot, waiting 5 s at most (it holds up checkout's
 * stock writes for the chunk: spec §7.6). Both: a no-op UPDATE of the project,
 * which on libSQL makes the deferred transaction take the write lock before any
 * read, and on Postgres holds off the project's other writers. It moves no
 * `updatedAt`: Prisma sets that, not the database.
 */
export async function lockFirst(tx: RawWrite, dialect: WooDialect, projectId: string): Promise<void> {
  if (dialect === "postgres") {
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    await tx.$executeRaw`LOCK TABLE "Category","Product","ProductCategory" IN SHARE ROW EXCLUSIVE MODE`;
  }
  const rows = await tx.$executeRaw`UPDATE "MigrationProject" SET "sourceKind"="sourceKind" WHERE id=${projectId}`;
  if (rows !== 1) throw new LedgerInvalid(`Locking migration project ${projectId} touched ${rows} rows, not 1.`);
}

/** S2, inside the transaction, after `lockFirst`: another shop first (StoreChanged), then a lease that is not this run's (LeaseLost). */
export async function fenceLease(tx: ProjectDb, projectId: string, run: WooRun): Promise<FencedRead> {
  const read = await readProject(tx, projectId);
  assertOneStore(read, run.store);
  assertLeaseOurs(read, run.runId);
  return { ...read, runId: run.runId };
}

/**
 * S6, in the same transaction: the baseline and a fresh heartbeat. `baseline`
 * replaces the stored one, so a chunk passes all of it, not only its own rows,
 * and an entry left out is gone. A bad value rolls back the chunk (`casWrite`). A
 * lost compare-and-set cannot happen under `lockFirst`; if it does, the
 * transaction must not commit.
 */
export async function writeLedger(tx: ProjectDb, read: FencedRead, baseline: WooBaseline, now: Date = new Date()): Promise<void> {
  const ledger = leasedTo({ ...read.ledger, categories: baseline.categories, products: baseline.products }, read.runId, now);
  if (!(await casWrite(tx, read, ledger, now))) throw new LedgerBusy(`Migration project ${read.projectId} changed under this transaction's lock, so the chunk rolls back.`);
}

/** Whether the database is the dialect the run was told, asked in that dialect's own words; only that dialect can answer. */
export async function probeDialect(db: RawRead, dialect: WooDialect): Promise<void> {
  try {
    await (dialect === "sqlite" ? db.$queryRaw`select sqlite_version()` : db.$queryRaw`show server_version`);
  } catch (cause) {
    throw new DialectMismatch(`The database did not answer as ${dialect}, the dialect this run was told. The run stops here.`, { cause });
  }
}

const RETRYABLE = /^(?:P2034|SQLITE_BUSY\w*|40001|40P01|55P03)\b/;

/**
 * Whether a transaction may run again from the top: BUSY, a serialization
 * failure or deadlock, a lock wait that timed out. Prisma hides the driver's
 * code: a libSQL BUSY arrives as P1008 on a model call, P2010 on a raw one and a
 * bare driver error from COMMIT (measured on Prisma 7.10.1). So it is read where
 * the driver put it, and never from a Prisma message, which can quote shop data.
 * Everything else stops, also P2028: a chunk too slow for its timeout stays so.
 */
export function isRetryableDbError(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 4) return false;
  const { code, originalCode, originalMessage, cause, meta } = error as { code?: unknown; originalCode?: unknown; originalMessage?: unknown; cause?: unknown; meta?: { driverAdapterError?: unknown } };
  return [code, originalCode, originalMessage].some((v) => typeof v === "string" && RETRYABLE.test(v)) || isRetryableDbError(meta?.driverAdapterError, depth + 1) || isRetryableDbError(cause, depth + 1);
}
