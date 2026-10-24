import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import type { CheckStatus } from "./catalog";
import { migrationFetcher, type MigrationFetcher } from "./fetch";
import { crawlSitemap, sitemapKind, type SitemapCrawl } from "./sitemap";
import { currentBindings, currentMigrationProject, freezeUrlMap, type CallMeta, type FreezeOutcome } from "./store";
import type { RunBindings } from "./ready";
import {
  classifyUrl, summarizeUrlParity,
  type UrlExpect, type UrlParityClass, type UrlParityResult, type UrlParityStatus, type UrlParitySummary,
} from "./checks/url";

/**
 * MIGD — what the `migration.*` tools run: the sitemap freeze and the
 * `url.parity` check over the frozen map. Both are bounded so one call fits in
 * one request: a fetcher past its deadline answers `inconclusive` without
 * sending (so a slow source makes the crawl incomplete, never a shorter list),
 * and a parity call checks at most `PARITY_CHUNK` URLs, `RUN_CONCURRENCY` at a
 * time, launching none after `budget − 8 s`. A run that needs more returns
 * `nextCursor` (its run id); passing it back continues the same run. Until the
 * last chunk the run reads `inconclusive` with no `finishedAt` — a run that
 * never finished is never a pass. Every call writes in ONE transaction under ONE
 * audit entry, never one per URL.
 */

export const RUNNABLE_CHECKS = ["url.parity"] as const;
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
 * Crawl the source's sitemap and freeze it. Yoast's `/sitemap_index.xml` unless
 * `sitemapUrl` names another one on the source host. A dry run returns the plan
 * however the crawl went; a real freeze is refused unless every sitemap was read.
 */
export async function freezeFromSitemap(
  actor: AuditActor,
  opts: { sitemapUrl?: string; dryRun: boolean } & CallMeta,
): Promise<{ crawl: SitemapCrawl; outcome: FreezeOutcome }> {
  const { sitemapUrl, dryRun, ...meta } = opts;
  const project = await currentMigrationProject();
  const source = new URL(project.sourceUrl);
  const root = sitemapUrl ?? `${source.origin}/sitemap_index.xml`;
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

export async function runUrlParity(actor: AuditActor, opts: { cursor?: string; budgetMs?: number } & CallMeta): Promise<ParityRunOutcome> {
  const started = Date.now();
  const { cursor, budgetMs, ...meta } = opts;
  const project = await currentMigrationProject();
  // Snapshot, measuring config (the target) and this deploy's build: a run spans calls only while all three hold.
  const bindings = currentBindings(project);
  if (!project.frozenAt || !bindings.snapshotId) throw new Error("Freeze the old site's sitemap first (migration.freeze_sitemap).");
  if (!project.targetUrl) throw new Error("Set the new site's address first (migration.project_set with targetUrl).");
  const target = new URL(project.targetUrl).origin;

  let runId: string = randomUUID();
  let prev: ParityRunSummary | null = null;
  let after: string | null = null;
  if (cursor) {
    const run = await prisma.migrationCheckRun.findUnique({ where: { id: cursor } });
    const was = (run?.bindings ?? {}) as RunBindings;
    const why = !run || run.projectId !== project.id || run.checkId !== "url.parity" || run.finishedAt ? "the run is unknown or finished"
      : was.snapshotId !== bindings.snapshotId ? "the URL map was frozen again since it started"
      : was.configHash !== bindings.configHash ? "the new site's address changed since it started"
      : was.buildSha !== bindings.buildSha ? `the site was deployed since it started (build ${was.buildSha ?? "unknown"} → ${bindings.buildSha ?? "unknown"}), so its first results measured another build`
      : null;
    if (why || !run) throw new Error(`That cursor cannot continue: ${why}. Run again without a cursor.`);
    [runId, prev, after] = [run.id, run.summary as ParityRunSummary, run.cursor];
  }
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
  const results: UrlParityResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < batch.length && Date.now() < started + budget - 8_000) {
      const i = next++;
      const row = batch[i];
      results[i] = await classifyUrl({ oldUrl: row.oldUrl, expect: asExpect(row.expect), newPath: row.newPath }, { targetOrigin: target, fetch });
    }
  };
  await Promise.all(Array.from({ length: RUN_CONCURRENCY }, worker));

  const done = batch.slice(0, next);
  const finished = next === batch.length && rows.length <= PARITY_CHUNK;
  const summary = mergeSummary(prev, results, { total, target });
  const status: CheckStatus = !finished ? "inconclusive" : summary.processed === 0 ? "skip" : (ORDER.find((k) => summary.counts[k] > 0) ?? "pass");
  const now = new Date();
  const run = {
    status,
    summary: summary as unknown as Prisma.InputJsonObject,
    bindings,
    cursor: finished ? null : (done.at(-1)?.id ?? after),
    actor,
    finishedAt: finished ? now : null,
  };
  await withAudit(
    { actor, tool: "migration.run_checks", args: { projectId: project.id, checkIds: [...RUNNABLE_CHECKS], runId, urls: done.length }, ...meta },
    async () => {
      await prisma.$transaction([
        ...done.map((row, i) => {
          const { status: s, http, class: cls, finalUrl, hops, detail } = results[i];
          return prisma.migrationUrlMap.update({
            where: { id: row.id },
            data: { lastStatus: s, lastHttp: http, lastCheckedAt: now, lastDetail: { class: cls, finalUrl, hops, ...(detail ? { detail } : {}) } },
          });
        }),
        cursor
          ? prisma.migrationCheckRun.update({ where: { id: runId }, data: run })
          : prisma.migrationCheckRun.create({ data: { id: runId, projectId: project.id, checkId: "url.parity", phase: project.switchedAt ? "after" : "before", ...run } }),
      ]);
      return { runId, urls: done.length, status };
    },
  );
  return { runId, checkId: "url.parity", status, finished, nextCursor: finished ? null : runId, chunk: done.length, ...summary };
}
