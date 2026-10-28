import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import type { CheckStatus } from "./catalog";
import { migrationFetcher, type MigrationFetcher } from "./fetch";
import { crawlSitemap, sitemapKind, type SitemapCrawl } from "./sitemap";
import { currentBindings, currentMigrationProject, freezeUrlMap, shopBase, type CallMeta, type FreezeOutcome } from "./store";
import type { RunBindings } from "./ready";
import {
  classifyUrl, summarizeUrlParity,
  type UrlExpect, type UrlParityClass, type UrlParityResult, type UrlParityStatus, type UrlParitySummary,
} from "./checks/url";
import {
  checkPage, mergePageSummary, probeNotFound, worstOf,
  type PageCheckId, type PageCheckSummary, type PageRowStatus,
} from "./checks/page";

/**
 * MIGD — what the `migration.*` tools run: the sitemap freeze and, over the
 * frozen map, `url.parity` and the two page checks that build on it
 * (`url.content`, `seo.head` — ./checks/page.ts). All are bounded so one call fits in
 * one request: a fetcher past its deadline answers `inconclusive` without
 * sending (so a slow source makes the crawl incomplete, never a shorter list),
 * and a call checks at most `PARITY_CHUNK` (page checks: `PAGE_CHUNK`) URLs, `RUN_CONCURRENCY` at a
 * time, launching none after `budget − 8 s`. A run that needs more returns
 * `nextCursor` (its run id); passing it back continues the same run. Until the
 * last chunk the run reads `inconclusive` with no `finishedAt` — a run that
 * never finished is never a pass. Every call writes in ONE transaction under ONE
 * audit entry, never one per URL.
 */

/** The checks whose run spans calls: a cursor continues them, and `runCheck` dispatches them. */
export const CURSOR_CHECKS = ["url.parity", "url.content", "seo.head"] as const;
/** What migration.run_checks runs: the cursor checks, and `data.counts` — one call, no cursor (lib/tools/migration-woo.ts). */
export const RUNNABLE_CHECKS = [...CURSOR_CHECKS, "data.counts"] as const;
export const PARITY_CHUNK = 120;
export const RUN_CONCURRENCY = 4;
/** One call's time budget, freeze or run — inside the REST route's and the admin chat's limits. */
export const RUN_BUDGET_MS = 45_000;

/** Past `deadline` the call is not sent: it is `inconclusive`, like a host that does not answer. */
export function withDeadline(fetch: MigrationFetcher, deadline: number): MigrationFetcher {
  return (url, opts) =>
    Date.now() >= deadline
      ? Promise.resolve({ outcome: "inconclusive", url, status: 0, reason: "time budget spent" })
      : fetch(url, opts);
}

/**
 * Crawl the source's sitemap and freeze it. Yoast's `sitemap_index.xml` at the
 * source's base (in its subdirectory, if WordPress has one) unless `sitemapUrl`
 * names another one on the source host. A dry run returns the plan
 * however the crawl went; a real freeze is refused unless every sitemap was read.
 */
export async function freezeFromSitemap(
  actor: AuditActor,
  opts: { sitemapUrl?: string; dryRun: boolean } & CallMeta,
): Promise<{ crawl: SitemapCrawl; outcome: FreezeOutcome }> {
  const { sitemapUrl, dryRun, ...meta } = opts;
  const project = await currentMigrationProject();
  const source = new URL(project.sourceUrl);
  const root = sitemapUrl ?? `${shopBase(project.sourceUrl)}/sitemap_index.xml`;
  if (new URL(root).hostname !== source.hostname) throw new Error(`The sitemap must be on the source site (${source.hostname}).`);
  const fetch = withDeadline(migrationFetcher({ allowHosts: [source.hostname] }), Date.now() + RUN_BUDGET_MS);
  const crawl = await crawlSitemap(root, { fetch });
  if (!dryRun && !crawl.complete) {
    const bad = crawl.sitemaps.find((s) => s.status !== "ok");
    const why = crawl.capped ? `it stopped at the ${crawl.capped} cap` : `${bad?.url}: ${bad?.status}${bad?.detail ? ` (${bad.detail})` : ""}`;
    throw new Error(`The sitemap crawl is incomplete (${why}); nothing was frozen. Run with dryRun: true to see every sitemap.`);
  }
  const entries = crawl.urls.map((u) => ({ oldUrl: u.loc, kind: sitemapKind(u.sitemap), sitemap: u.sitemap, lastmod: u.lastmod ?? null, images: u.images }));
  const outcome = await freezeUrlMap(project.id, entries, actor, { dryRun, snapshot: { sitemap: root, sitemaps: crawl.sitemaps.length }, ...meta });
  return { crawl, outcome };
}

export type ParityRunSummary = Omit<UrlParitySummary, "status"> & { total: number; target: string };
export type ParityRunOutcome = ParityRunSummary & {
  runId: string; checkId: "url.parity"; status: CheckStatus; finished: boolean; nextCursor: string | null; chunk: number;
};

const ORDER = ["fail", "inconclusive", "warn"] as const;
const asExpect = (e: string): UrlExpect => (e === "301" || e === "gone" ? e : "same");

/** This chunk's results added to the run so far: counts summed, at most 20 non-passes kept, fails first. */
function mergeSummary(prev: ParityRunSummary | null, chunk: readonly UrlParityResult[], base: { total: number; target: string }): ParityRunSummary {
  const add = summarizeUrlParity(chunk);
  const counts = { ...add.counts };
  for (const k of Object.keys(counts) as UrlParityStatus[]) counts[k] += prev?.counts[k] ?? 0;
  const classes = { ...add.classes };
  for (const [k, n] of Object.entries(prev?.classes ?? {})) classes[k as UrlParityClass] = (classes[k as UrlParityClass] ?? 0) + (n ?? 0);
  const errors = [...(prev?.firstErrors ?? []), ...add.firstErrors];
  const firstErrors = ORDER.flatMap((s) => errors.filter((r) => r.status === s)).slice(0, 20);
  return { counts, classes, processed: (prev?.processed ?? 0) + add.processed, firstErrors, total: prev?.total ?? base.total, target: base.target };
}


type Project = Awaited<ReturnType<typeof currentMigrationProject>>;

/** The project, frozen and with a new site to measure, and what a run made now is bound to. */
async function measurableProject(): Promise<{ project: Project; bindings: RunBindings; target: string }> {
  const project = await currentMigrationProject();
  // Snapshot, measuring config (the target) and this deploy's build: a run spans calls only while all three hold.
  const bindings = currentBindings(project);
  if (!project.frozenAt || !bindings.snapshotId) throw new Error("Freeze the old site's sitemap first (migration.freeze_sitemap).");
  if (!project.targetUrl) throw new Error("Set the new site's address first (migration.project_set with targetUrl).");
  return { project, bindings, target: new URL(project.targetUrl).origin };
}

/** A new run, or the one `cursor` names — refused unless it is this check's, unfinished, and measured what a run now would. */
async function resumeRun<S>(project: Project, checkId: string, cursor: string | undefined, bindings: RunBindings) {
  if (!cursor) return { runId: randomUUID() as string, prev: null as S | null, after: null as string | null };
  const run = await prisma.migrationCheckRun.findUnique({ where: { id: cursor } });
  const was = (run?.bindings ?? {}) as RunBindings;
  const why = !run || run.projectId !== project.id || run.checkId !== checkId || run.finishedAt ? "the run is unknown or finished"
    : was.snapshotId !== bindings.snapshotId ? "the URL map was frozen again since it started"
    : was.configHash !== bindings.configHash ? "the new site's address changed since it started"
    : was.buildSha !== bindings.buildSha ? `the site was deployed since it started (build ${was.buildSha ?? "unknown"} → ${bindings.buildSha ?? "unknown"}), so its first results measured another build`
    : null;
  if (why || !run) throw new Error(`That cursor cannot continue: ${why}. Run again without a cursor.`);
  return { runId: run.id, prev: run.summary as S, after: run.cursor };
}

/** `fn` over `batch`, RUN_CONCURRENCY at a time, launching none at or past `stopAt`. Every launched item finishes; the results are the first n, in order. */
async function inPool<T, R>(batch: readonly T[], stopAt: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < batch.length && Date.now() < stopAt) {
      const i = next++;
      results[i] = await fn(batch[i]);
    }
  };
  await Promise.all(Array.from({ length: RUN_CONCURRENCY }, worker));
  return results.slice(0, next);
}

/** The run row (and any per-URL writes) in ONE transaction under ONE audit entry. */
async function saveRun(
  ctx: { actor: AuditActor; meta: CallMeta; project: Project; checkId: string; runId: string; resumed: boolean; urls: number },
  run: { status: CheckStatus; summary: object; bindings: RunBindings; cursor: string | null; finishedAt: Date | null },
  rowWrites: Prisma.PrismaPromise<unknown>[] = [],
) {
  const { actor, meta, project, checkId, runId, resumed, urls } = ctx;
  const data = { ...run, summary: run.summary as Prisma.InputJsonObject, actor };
  await withAudit({ actor, tool: "migration.run_checks", args: { projectId: project.id, checkIds: [checkId], runId, urls }, ...meta }, async () => {
    await prisma.$transaction([
      ...rowWrites,
      resumed
        ? prisma.migrationCheckRun.update({ where: { id: runId }, data })
        : prisma.migrationCheckRun.create({ data: { id: runId, projectId: project.id, checkId, phase: project.switchedAt ? "after" : "before", ...data } }),
    ]);
    return { runId, urls, status: run.status };
  });
}

export async function runUrlParity(actor: AuditActor, opts: { cursor?: string; budgetMs?: number } & CallMeta): Promise<ParityRunOutcome> {
  const started = Date.now();
  const { cursor, budgetMs, ...meta } = opts;
  const { project, bindings, target } = await measurableProject();
  const { runId, prev, after } = await resumeRun<ParityRunSummary>(project, "url.parity", cursor, bindings);
  const total = prev?.total ?? (await prisma.migrationUrlMap.count({ where: { projectId: project.id } }));
  const rows = await prisma.migrationUrlMap.findMany({
    where: { projectId: project.id, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
    take: PARITY_CHUNK + 1,
    select: { id: true, oldUrl: true, expect: true, newPath: true },
  });
  const batch = rows.slice(0, PARITY_CHUNK);
  const budget = budgetMs ?? RUN_BUDGET_MS;
  const allowHosts = [new URL(target).hostname];
  const fetch = withDeadline(migrationFetcher({ allowHosts, timeoutMs: 8_000, maxBytes: 16 * 1024 }), started + budget);
  const results = await inPool(batch, started + budget - 8_000, (row) =>
    classifyUrl({ oldUrl: row.oldUrl, expect: asExpect(row.expect), newPath: row.newPath }, { targetOrigin: target, fetch }));

  const done = batch.slice(0, results.length);
  const finished = results.length === batch.length && rows.length <= PARITY_CHUNK;
  const summary = mergeSummary(prev, results, { total, target });
  const status: CheckStatus = !finished ? "inconclusive" : summary.processed === 0 ? "skip" : (ORDER.find((k) => summary.counts[k] > 0) ?? "pass");
  const now = new Date();
  const rowWrites = done.map((row, i) => {
    const { status: s, http, class: cls, finalUrl, hops, detail } = results[i];
    return prisma.migrationUrlMap.update({
      where: { id: row.id },
      data: { lastStatus: s, lastHttp: http, lastCheckedAt: now, lastDetail: { class: cls, finalUrl, hops, ...(detail ? { detail } : {}) } },
    });
  });
  await saveRun(
    { actor, meta, project, checkId: "url.parity", runId, resumed: !!cursor, urls: done.length },
    { status, summary, bindings, cursor: finished ? null : (done.at(-1)?.id ?? after), finishedAt: finished ? now : null },
    rowWrites,
  );
  return { runId, checkId: "url.parity", status, finished, nextCursor: finished ? null : runId, chunk: done.length, ...summary };
}

/** Rows per page-check call: each is two pages of up to 1 MB. */
export const PAGE_CHUNK = 60;
export type PageRunSummary = PageCheckSummary & { total: number; target: string };
export type PageRunOutcome = PageRunSummary & {
  runId: string; checkId: PageCheckId; status: CheckStatus; finished: boolean; nextCursor: string | null; chunk: number;
};

/** The host the new pages' canonicals must name: `settings.expectedHost`, else the source's — the domain that moves. */
export function expectedHostOf(project: { sourceUrl: string; settings: unknown }): string {
  const set = (project.settings as { expectedHost?: unknown } | null)?.expectedHost;
  return typeof set === "string" && set.trim() ? set.trim().toLowerCase() : new URL(project.sourceUrl).hostname.toLowerCase();
}

const finalUrlOf = (detail: unknown) => {
  const u = (detail as { finalUrl?: unknown } | null)?.finalUrl;
  return typeof u === "string" && u ? u : null;
};
/** The source host and its www twin: the freeze accepts both (store.ts `bareHost`). */
const withTwin = (host: string) => [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];

/**
 * `url.content` or `seo.head` over the frozen URLs a 301-or-same row expects
 * (an expected `gone` is not a page). Each reads the old page live, so neither
 * runs after the DNS switch. Writes only the run: a URL's `last*` columns stay
 * url.parity's, which these checks read to find the new page.
 */
export async function runPageCheck(
  checkId: PageCheckId,
  actor: AuditActor,
  opts: { cursor?: string; budgetMs?: number } & CallMeta,
): Promise<PageRunOutcome> {
  const started = Date.now();
  const { cursor, budgetMs, ...meta } = opts;
  const { project, bindings, target } = await measurableProject();
  if (project.switchedAt) throw new Error(`${checkId} compares each page with the live old site, which is gone since the DNS switch; it runs before the switch only.`);
  const { runId, prev, after } = await resumeRun<PageRunSummary>(project, checkId, cursor, bindings);
  const where = { projectId: project.id, expect: { not: "gone" } };
  const total = prev?.total ?? (await prisma.migrationUrlMap.count({ where }));
  const rows = await prisma.migrationUrlMap.findMany({
    where: { ...where, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
    take: PAGE_CHUNK + 1,
    select: { id: true, oldUrl: true, lastStatus: true, lastDetail: true },
  });
  const batch = rows.slice(0, PAGE_CHUNK);
  const deadline = started + (budgetMs ?? RUN_BUDGET_MS);
  const source = withDeadline(migrationFetcher({ allowHosts: withTwin(new URL(project.sourceUrl).hostname), timeoutMs: 8_000 }), deadline);
  const targetFetch = withDeadline(migrationFetcher({ allowHosts: [new URL(target).hostname], timeoutMs: 8_000 }), deadline);
  const notFound = checkId === "url.content" ? await probeNotFound(targetFetch, target, randomUUID().slice(0, 8)) : null;
  const ctx = { targetOrigin: target, expectedHost: expectedHostOf(project), source, target: targetFetch, notFound };
  const results = await inPool(batch, deadline - 8_000, (row) =>
    checkPage(checkId, { oldUrl: row.oldUrl, parityStatus: row.lastStatus, finalUrl: finalUrlOf(row.lastDetail) }, ctx));

  const done = batch.slice(0, results.length);
  const finished = results.length === batch.length && rows.length <= PAGE_CHUNK;
  const summary: PageRunSummary = { ...mergePageSummary(prev, results), total, target };
  const status: CheckStatus = !finished ? "inconclusive" : summary.processed === 0 ? "skip"
    : worstOf((Object.keys(summary.counts) as PageRowStatus[]).filter((k) => summary.counts[k] > 0));
  await saveRun(
    { actor, meta, project, checkId, runId, resumed: !!cursor, urls: done.length },
    { status, summary, bindings, cursor: finished ? null : (done.at(-1)?.id ?? after), finishedAt: finished ? new Date() : null },
  );
  return { runId, checkId, status, finished, nextCursor: finished ? null : runId, chunk: done.length, ...summary };
}

export type RunnableCheck = (typeof RUNNABLE_CHECKS)[number];
export type CursorCheck = (typeof CURSOR_CHECKS)[number];

/**
 * One check per call, of the cursor checks (`data.counts` is dispatched before
 * this). With only a cursor, the check is the one that run measures; a cursor
 * naming any other run falls to url.parity, whose resume refuses it.
 */
export async function runCheck(checkId: CursorCheck | undefined, actor: AuditActor, opts: { cursor?: string; budgetMs?: number } & CallMeta) {
  const resumed = !checkId && opts.cursor
    ? (await prisma.migrationCheckRun.findUnique({ where: { id: opts.cursor }, select: { checkId: true } }))?.checkId
    : undefined;
  const id = checkId ?? CURSOR_CHECKS.find((c) => c === resumed) ?? "url.parity";
  return id === "url.parity" ? runUrlParity(actor, opts) : runPageCheck(id, actor, opts);
}
