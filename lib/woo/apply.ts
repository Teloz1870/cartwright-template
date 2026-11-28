import { randomUUID } from "node:crypto";

import type { Prisma } from "@/app/generated/prisma/client";
import { permalinkKey } from "@/lib/urls";
import { decide, intendedOf, type Decision, type ProductCorePayload, type WooSrc, type WooWrite } from "@/lib/woo/decide";
import { groupFp, type GroupBase, type GroupName, type WooBaseEntry, type WooKind } from "@/lib/woo/groups";
import { CAS_BACKOFF_MS, LeaseLost, acquireLease, fenceLease, isRetryableDbError, lockFirst, releaseLease, writeLedger, type WooRun } from "@/lib/woo/ledger";
import { htmlDecoder, mapWooCatalog } from "@/lib/woo/map-catalog";
import { sourceVerdicts, type WooAction } from "@/lib/woo/plan";
import { OWNED_PRODUCT, readCategoryView, readProductView, readViewAndLedger } from "@/lib/woo/read-view";
import { assertApplyKeyed, readImport, type WooImportArgs, type WooImportReport, type WooPreviewDeps } from "@/lib/woo/run-import";
import type { WooStock } from "@/lib/woo/types";
import { ownedCategory, ownedProduct, permalinkVariants, type ViewRow, type WooView } from "@/lib/woo/view";

/**
 * W21-live-2a-4/-5 — `--apply` (spec 2026-10-25, §3F): categories (2a-4),
 * then products (2a-5). The preview says which rows to write; each chunk then takes
 * the write lock first (S1), checks the lease is still this run's (S2), reads
 * the categories again (S3) and decides every row again over what it read (S4),
 * so nothing read before the transaction is trusted. A write is read back and
 * checked (S5), and its baseline goes into the same transaction (S6). The run
 * keeps only what a committed chunk returned (S7). Rows that already agree with
 * the source are recorded in their own transactions, with no catalogue write,
 * also after a stop. A product chunk reads only the rows its products name
 * (`readProductView`); a create copies Woo's stock and policy as decide() says,
 * an update writes its groups and never stock.
 */

export type WooOutcome = "written" | "refreshed" | "refused" | "rolledBack" | "notAttempted";
const OUTCOMES: readonly WooOutcome[] = ["written", "refreshed", "refused", "rolledBack", "notAttempted"];
/**
 * `action`/`reason`: what the decision in the chunk's own transaction said, where it did not write.
 * `refreshed`: the groups whose baseline the chunk recorded, as they agree with the source, on a row whose outcome is not `refreshed`.
 */
export type WooApplyRow = { kind: WooKind; externalId: string; outcome: WooOutcome; action?: WooAction; reason?: string; refreshed?: GroupName[] };
export type WooApplyResult = {
  runId: string;
  rows: WooApplyRow[];
  counts: Record<WooOutcome, number>;
  /** Why a chunk rolled back and the writes after it were not attempted; null when none did. */
  stopped: string | null;
  /** The full read after the run: the tree has no loop, no permalink we wrote has a second holder, each baseline is what its chunk committed. */
  postconditions: { ok: boolean; failures: string[] };
  /**
   * Rows this run wrote that were edited or deleted here after their chunk committed (`<kind> <Woo id>`): kept,
   * and no failure, since the next run reads them as edits made here (spec §3F, "Hvorfor det holder").
   */
  editedAfterCommit: string[];
  /** `unavailable`: no revalidate was given, as in a script outside Next.js. */
  cache: "all" | "partial" | "none" | "unavailable";
  paths: string[];
};

export type WooApplyDeps = WooPreviewDeps & {
  /** Next's `revalidatePath` where there is one. A path that throws is counted, and the run goes on. */
  revalidate?: (path: string) => unknown;
  chunkSize?: number;
  runId?: string;
  /** Test seams: before a chunk's transaction, inside it just before it commits, after it committed. */
  hooks?: { beforeChunk?: (n: number) => Promise<void>; beforeCommit?: (n: number) => Promise<void>; afterCommit?: (n: number) => Promise<void> };
};

/** A write did not read back as decided: the chunk rolls back and the run stops, with no retry. */
export class PostconditionFailed extends Error {
  name = "PostconditionFailed";
}

const RETRIES = 2;
const TX = { timeout: 20_000, maxWait: 5_000 };
const LINK = { select: { id: true, source: true, externalId: true } } as const;
const READBACK = { id: true, source: true, externalId: true, slug: true, name: true, permalink: true, description: true, parentId: true, parent: LINK } as const;
/** The pages a save of the row shows on (app/[locale]/category, app/[locale]/product): revalidate() arguments, not links. */
const pageOf = (kind: WooKind, slug: string) => (kind === "category" ? `/category/${slug}` : `/product/${slug}`);
const LEDGER = { category: "categories", product: "products" } as const;

type Item = { src: WooSrc };
type Chunk = { kind: WooKind; items: Item[]; write: boolean };
/** `written`: `<kind>:<Woo id>` and its baseline as the chunk committed it, for each group the write wrote or refreshed. */
type ChunkResult = { rows: WooApplyRow[]; paths: string[]; written: [string, WooBaseEntry][] };

const said = (kind: WooKind, externalId: string, outcome: WooOutcome, { action, reason }: Pick<Decision, "action" | "reason">): WooApplyRow =>
  ({ kind, externalId, outcome, action, ...(reason !== undefined && { reason }) });

function slices(kind: WooKind, items: readonly Item[], size: number, write: boolean): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < items.length; i += size) out.push({ kind, items: items.slice(i, i + size), write });
  return out;
}

/** One decided write, as the database took it, read back: `owned` is what its fingerprints are taken of. */
async function save(tx: Prisma.TransactionClient, w: WooWrite): Promise<ViewRow> {
  if (w.kind === "category") {
    const saved = w.op === "create" ? await tx.category.create({ data: w.payload, select: READBACK }) : await tx.category.update({ where: { id: w.id }, data: w.payload, select: READBACK });
    return { kind: "category", id: saved.id, source: saved.source, externalId: saved.externalId, slug: saved.slug, permalink: saved.permalink, parentId: saved.parentId, owned: ownedCategory(saved) };
  }
  const links = (ids: string[]) => ids.map((categoryId) => ({ categoryId }));
  const core = ({ extraCategoryIds, ...rest }: ProductCorePayload) => ({ ...rest, extraCategories: { deleteMany: {}, create: links(extraCategoryIds) } });
  let saved;
  if (w.op === "create") {
    const { extraCategoryIds, ...rest } = w.payload;
    saved = await tx.product.create({ data: { ...rest, images: "[]", extraCategories: { create: links(extraCategoryIds) } }, select: OWNED_PRODUCT });
  } else {
    // A group left out of the payload is not in `data`: the price stays when only core is written, and stock always does.
    saved = await tx.product.update({ where: { id: w.id }, data: { ...(w.payload.core && core(w.payload.core)), ...w.payload.price }, select: OWNED_PRODUCT });
  }
  return { kind: "product", id: saved.id, source: saved.source, externalId: saved.externalId, slug: saved.slug, permalink: saved.permalink, sku: saved.sku, deletedAt: saved.deletedAt, owned: ownedProduct(saved) };
}

/**
 * Again from the top on BUSY, a serialization failure or a lock wait, at most twice, after a pause that grows
 * as the ledger's does: a file answers BUSY at once, so retries with no pause meet the same writer. decide() runs again over what it reads again.
 */
async function retried<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRIES || !isRetryableDbError(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, CAS_BACKOFF_MS * (attempt + 1)));
  }
}

/**
 * S5, in the transaction, over the rows it wrote: each walk to the root repeats no category, and each written
 * permalink has one holder across both tables. A category chunk reads every holder; a product chunk, which never
 * reads all of `Product`, every stored spelling of its own (spec §7.9: another spelling is the audit's after the run).
 */
async function postconditions(tx: Prisma.TransactionClient, kind: WooKind, written: readonly ViewRow[]): Promise<void> {
  const tree = new Map(kind === "category" ? (await tx.category.findMany({ select: { id: true, parentId: true } })).map((c) => [c.id, c.parentId]) : []);
  for (const { id, externalId } of kind === "category" ? written : []) {
    const seen = new Set<string>();
    for (let at: string | null = id; at !== null; at = tree.get(at) ?? null) {
      if (seen.has(at)) throw new PostconditionFailed(`category ${externalId}: its chain of parents loops after the write`);
      seen.add(at);
    }
  }
  const permalinks = written.flatMap((row) => (row.permalink ? [row.permalink] : []));
  // Every holder, compared by key: a filter on spellings would miss one written differently.
  const args = { where: { permalink: kind === "category" ? { not: null } : { in: permalinks.flatMap(permalinkVariants) } }, select: { permalink: true } } as const;
  const held = [...(await tx.category.findMany(args)), ...(await tx.product.findMany(args))].map((h) => h.permalink && permalinkKey(h.permalink));
  for (const key of new Set(permalinks.map(permalinkKey))) {
    if (key !== null && held.filter((k) => k === key).length !== 1) throw new PostconditionFailed(`permalink ${key} has ${held.filter((k) => k === key).length} holders after the write`);
  }
}

/**
 * S5's last read, after the ledger write, as the transaction is about to commit: each row the chunk wrote reads
 * back as the baseline it records, every group of it, the refreshed ones too. A change after a row's own read-back
 * (a later write of the chunk, the ledger's write) stops the chunk here, so the read after the run may take a
 * row that differs from its baseline for an edit made here after the commit.
 */
async function asCommitted(tx: Prisma.TransactionClient, kind: WooKind, written: readonly [string, WooBaseEntry][]): Promise<void> {
  if (written.length === 0) return;
  const where = { id: { in: written.map(([, entry]) => entry.rowId) } };
  // A soft-deleted row reads as gone: the chunk never writes one, so a deletedAt set inside it is not what it committed.
  const owned = new Map<string, Parameters<typeof groupFp>[2] | undefined>(
    kind === "category"
      ? (await tx.category.findMany({ where, select: READBACK })).map((row) => [row.id, ownedCategory(row)])
      : (await tx.product.findMany({ where, select: OWNED_PRODUCT })).map((row) => [row.id, row.deletedAt === null ? ownedProduct(row) : undefined]),
  );
  for (const [key, { rowId, groups }] of written) {
    const row = owned.get(rowId);
    const off = row ? (Object.entries(groups) as [GroupName, GroupBase][]).find(([g, b]) => groupFp(kind, g, row) !== b.wrote) : undefined;
    if (!row || off) throw new PostconditionFailed(`${key.replace(":", " ")}: ${off ? off[0] : "the row"} is not its baseline as the chunk commits`);
  }
}

/**
 * Categories, then products, as far as `args.scope` takes them. Returns the report also when a chunk
 * stopped the run (`apply.stopped`); a failure before the lease (pre-flight, the key, the shop, the
 * lease itself) throws.
 */
export async function applyWooImport(args: WooImportArgs, deps: WooApplyDeps): Promise<WooImportReport> {
  if (!args.apply) throw new Error("An apply needs --apply. Nothing was read or written.");
  assertApplyKeyed(args, deps.client.auth);
  const { db, dialect, revalidate, hooks = {} } = deps;
  const chunkSize = Number.isFinite(deps.chunkSize) ? Math.max(1, Math.floor(deps.chunkSize as number)) : 25;
  const { report, snapshot, projectId, stock } = await readImport(args, deps);
  const run: WooRun = { runId: deps.runId ?? randomUUID(), store: report.store };
  const mapped = mapWooCatalog(snapshot, await htmlDecoder());
  const verdicts = sourceVerdicts(snapshot, mapped, { ...deps.policy, sourcePricesIncludeVat: args.sourcePricesIncludeVat });
  const types = new Map(snapshot.products.map((p) => [String(p.id), p.type]));
  const categories = new Map(mapped.categories.map((row) => [row.externalId, { kind: "category" as const, row, verdict: verdicts.categories.get(row.externalId) }]));
  const products = new Map(mapped.products.map((row) => [row.externalId, { kind: "product" as const, row, type: types.get(row.externalId) ?? "", verdict: verdicts.products.get(row.externalId) }]));
  const planned = (kind: WooKind) => (kind === "category" ? report.plan.categories : report.plan.products).flatMap((item) => {
    const src = (kind === "category" ? categories : products).get(item.externalId);
    return src ? [{ item, src }] : [];
  });
  const writes = (kind: WooKind) => planned(kind).filter(({ item }) => item.action === "create" || item.action === "update");
  const refreshes = (kind: WooKind) => planned(kind).filter(({ item }) => item.refresh && item.action !== "create" && item.action !== "update");
  // Parents first, as the preview ordered them, then the products filed under them; the refreshes last, so a stop still records what already agrees.
  const chunks = [
    ...slices("category", writes("category"), chunkSize, true), ...slices("product", writes("product"), chunkSize, true),
    ...slices("category", refreshes("category"), chunkSize, false), ...slices("product", refreshes("product"), chunkSize, false),
  ];

  const runChunk = async (tx: Prisma.TransactionClient, { kind, items, write }: Chunk, n: number): Promise<ChunkResult> => {
    await lockFirst(tx, dialect, projectId);
    const fenced = await fenceLease(tx, projectId, run);
    const view: WooView = kind === "category" ? await readCategoryView(tx) : await readProductView(tx, items.flatMap(({ src }) => (src.kind === "product" ? [src.row] : [])));
    const baseline = fenced.ledger[LEDGER[kind]];
    const entries: Record<string, WooBaseEntry> = { ...baseline };
    const out: ChunkResult = { rows: [], paths: [], written: [] };
    const wrote: ViewRow[] = [];
    for (const { src } of items) {
      const ext = src.row.externalId;
      // Before the write, as decide() reads it: a secondary category that is not here yet is not what the source says here.
      const intended = intendedOf(src, view);
      const decision = decide(src, view, baseline[ext], kind === "product" ? (stock ?? new Map<string, WooStock>()) : null);
      const { dbId, refresh } = decision;
      const fresh = Object.fromEntries(refresh.map((g) => [g, { saw: groupFp(kind, g, intended), wrote: groupFp(kind, g, intended) }]));
      const recorded = dbId !== undefined && refresh.length > 0;
      if (dbId && recorded) entries[ext] = { rowId: dbId, groups: { ...entries[ext]?.groups, ...fresh } };
      // A row that is not reported `refreshed` still says which groups' baseline this chunk recorded.
      const alsoRefreshed = recorded ? { refreshed: refresh } : {};
      const w = decision.write;
      if (!w) {
        out.rows.push(said(kind, ext, refresh.length > 0 ? "refreshed" : "refused", decision));
        continue;
      }
      if (!write) {
        const reason = stopped === null ? "the row changed after the preview and needs a write now; run the import again" : "the row needs a write, and after a stop this run only records rows that agree";
        out.rows.push({ ...said(kind, ext, "notAttempted", { action: decision.action, reason }), ...alsoRefreshed });
        continue;
      }
      const before = view.own(kind, ext);
      const after = await save(tx, w);
      view.record(before, after);
      const groups = Object.fromEntries(w.groups.map((g) => {
        const [fp, back] = [groupFp(kind, g, intended), after.owned && groupFp(kind, g, after.owned)];
        if (back !== fp) throw new PostconditionFailed(`${kind} ${ext}: ${g} reads back other than it was written`);
        return [g, { saw: fp, wrote: back }];
      }));
      entries[ext] = { rowId: after.id, groups: { ...entries[ext]?.groups, ...groups } };
      wrote.push(after);
      out.rows.push({ kind, externalId: ext, outcome: "written", action: decision.action, ...alsoRefreshed });
      out.written.push([`${kind}:${ext}`, { rowId: after.id, groups: { ...(recorded && fresh), ...groups } }]);
      out.paths.push(...(before ? [pageOf(kind, before.slug)] : []), pageOf(kind, after.slug), ...(kind === "product" ? ["/produkter"] : []));
    }
    if (wrote.length > 0) await postconditions(tx, kind, wrote);
    const { categories: c, products: p } = fenced.ledger;
    await writeLedger(tx, fenced, kind === "category" ? { categories: entries, products: p } : { categories: c, products: entries });
    await hooks.beforeCommit?.(n);
    await asCommitted(tx, kind, out.written);
    return out;
  };

  const rows: WooApplyRow[] = [];
  const paths = new Set<string>();
  const written = new Map<string, WooBaseEntry>();
  const failures: string[] = [];
  const editedAfterCommit: string[] = [];
  let stopped: string | null = null;
  let leaseLost = false;
  const lease = { db, projectId };
  await acquireLease(lease, run);
  try {
    for (const [n, chunk] of chunks.entries()) {
      // After a stop the refreshes still run, unless the lease is gone: then nothing more is this run's to write.
      if (stopped !== null && (chunk.write || leaseLost)) {
        rows.push(...chunk.items.map(({ src }) => ({ kind: chunk.kind, externalId: src.row.externalId, outcome: "notAttempted" as const })));
        continue;
      }
      let result: ChunkResult;
      try {
        await hooks.beforeChunk?.(n);
        result = await retried(() => db.$transaction((tx) => runChunk(tx, chunk, n), TX));
      } catch (error) {
        stopped ??= error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        leaseLost ||= error instanceof LeaseLost;
        rows.push(...chunk.items.map(({ src }) => ({ kind: chunk.kind, externalId: src.row.externalId, outcome: "rolledBack" as const })));
        continue;
      }
      // Committed: only now does the run take what the chunk did.
      rows.push(...result.rows);
      result.paths.forEach((path) => paths.add(path));
      result.written.forEach(([key, entry]) => written.set(key, entry));
      await hooks.afterCommit?.(n);
    }
    // The read after the run, while the lease is still this run's: another run that starts after it may move a baseline legitimately.
    await readAfterRun();
  } finally {
    await releaseLease(lease, run.runId);
  }

  // Each row written now still has the baseline its chunk committed, and no row of ours, written now or before, loops or shares a key.
  async function readAfterRun(): Promise<void> {
    try {
      const { view, baseline } = await readViewAndLedger(db, dialect, projectId, run.store);
      for (const [key, committed] of written) {
        const [kind, ext] = key.split(":") as [WooKind, string];
        const entry = baseline[LEDGER[kind]][ext];
        const groups = Object.entries(committed.groups) as [GroupName, GroupBase][];
        if (entry?.rowId !== committed.rowId || groups.some(([g, b]) => entry.groups[g]?.saw !== b.saw || entry.groups[g]?.wrote !== b.wrote)) {
          failures.push(`${kind} ${ext}: its baseline is not what its chunk committed`);
          continue;
        }
        // The chunk read every recorded group back last in its own transaction (asCommitted), so a row that differs now, or is deleted (soft-deleted too), was changed here after the commit: an edit, which the next run keeps.
        const own = view.own(kind, ext);
        const owned = own?.owned;
        if (!owned || own.id !== committed.rowId || own.deletedAt || groups.some(([g, b]) => groupFp(kind, g, owned) !== b.wrote)) editedAfterCommit.push(`${kind} ${ext}`);
      }
      for (const own of [...view.ownRows("category"), ...view.ownRows("product")]) {
        const held = view.holder(own.kind, own, own.id);
        if (own.kind === "category" && view.loops(own.id, own.parentId ?? null)) failures.push(`category ${own.externalId}: its chain of parents never reaches a root`);
        if (held) failures.push(`${own.kind} ${own.externalId}: ${held.label} is also held by ${held.by.kind} ${held.by.id}`);
      }
    } catch (error) {
      failures.push(`the read after the run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let revalidated = 0;
  for (const path of paths) {
    try {
      await revalidate?.(path);
      revalidated++;
    } catch {
      // A page that stays stale until its next save never undoes the import.
    }
  }
  const cache = !revalidate ? "unavailable" : revalidated === paths.size ? "all" : revalidated === 0 ? "none" : "partial";
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, rows.filter((r) => r.outcome === o).length])) as Record<WooOutcome, number>;
  const apply: WooApplyResult = { runId: run.runId, rows, counts, stopped, postconditions: { ok: failures.length === 0, failures }, editedAfterCommit, cache, paths: [...paths] };
  return { ...report, mode: "apply", apply };
}

/** The two failures `auditedWooImport` throws itself, so that only those are recorded and swallowed. */
class RunNotOk extends Error {}

/** `withAudit`'s shape: lib/audit is server-only, so the script passes it in. */
export type WooAuditWrap = <T>(meta: { actor: `system:${string}`; tool: string; args: Record<string, unknown>; strict: true }, handler: () => Promise<T>) => Promise<T>;

/**
 * One audit row per apply, with what was asked and the counts, never a catalogue
 * row. A stopped run or a failed postcondition is recorded `ok: false`, and its
 * report, with what the committed chunks did, is still returned.
 */
export async function auditedWooImport(audit: WooAuditWrap, args: WooImportArgs, run: () => Promise<WooImportReport>): Promise<WooImportReport> {
  const out: { report?: WooImportReport } = {};
  try {
    await audit({ actor: "system:woo-import", tool: "woo.import", args: { apply: args.apply, scope: args.scope, only: args.only && [...args.only] }, strict: true }, async () => {
      const report = (out.report = await run());
      const summary = { store: report.store, counts: report.apply?.counts, cache: report.apply?.cache };
      if (report.apply?.stopped) throw new RunNotOk(`stopped: ${report.apply.stopped} (${JSON.stringify(summary.counts)})`);
      if (report.apply && !report.apply.postconditions.ok) throw new RunNotOk(`postconditions failed: ${report.apply.postconditions.failures.join("; ")}`);
      return summary;
    });
  } catch (error) {
    // Anything else, a failed audit write among them, is not this run's report to hide.
    if (!(error instanceof RunNotOk)) throw error;
  }
  if (!out.report) throw new Error("The import returned no report.");
  return out.report;
}
