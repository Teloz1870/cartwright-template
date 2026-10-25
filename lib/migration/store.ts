import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { CHECK_CATALOG } from "./catalog";
import type { LatestRun, RunBindings } from "./ready";
import { parseWooPlanSummary, type WooPlanSummary } from "./woo-plan-summary";

/**
 * Persistence for /admin/migration: the frozen URL map and the latest check
 * runs. The freeze follows the redirects-import contract (lib/redirects/
 * import.ts): `dryRun` returns the plan and writes nothing; a real run replaces
 * the project's URL map and stamps the snapshot in ONE transaction under ONE
 * audit entry — never one per URL. Fetching and parsing the sitemap is the
 * sitemap reader's job; this module takes its entries.
 */

export const MIGRATION_URL_CAP = 20_000;

/** One `<loc>` as the sitemap reader hands it over. */
export type FrozenUrlInput = {
  oldUrl: string;
  kind: string;
  sitemap?: string | null;
  lastmod?: string | null;
  images?: string[];
};
export type FrozenUrl = { oldUrl: string; oldPath: string; kind: string; sitemap: string | null; lastmod: string | null; images: string[] };
export type FreezeError = { oldUrl: string; reason: string };
export type FreezePlan = {
  rows: FrozenUrl[];
  errors: FreezeError[];
  summary: { entries: number; valid: number; invalid: number; duplicates: number; byKind: Record<string, number> };
};
export type FreezeOutcome =
  | ({ dryRun: true; replaces: number } & FreezePlan)
  | { dryRun: false; frozen: number; skipped: number; errors: FreezeError[]; snapshotId: string | null };

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Pure: validate, normalise and de-duplicate the entries against the source site. Over the cap the whole freeze is refused with one error. */
export function planFreeze(sourceUrl: string, entries: readonly FrozenUrlInput[]): FreezePlan {
  const summary = { entries: entries.length, valid: 0, invalid: 0, duplicates: 0, byKind: {} as Record<string, number> };
  if (entries.length > MIGRATION_URL_CAP) {
    const reason = `The sitemaps list ${entries.length} URLs; a freeze holds at most ${MIGRATION_URL_CAP}. Nothing was frozen.`;
    return { rows: [], errors: [{ oldUrl: "", reason }], summary: { ...summary, invalid: 1 } };
  }
  const source = bareHost(new URL(sourceUrl).hostname);
  const rows: FrozenUrl[] = [];
  const errors: FreezeError[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    let url: URL;
    try {
      url = new URL(e.oldUrl);
    } catch {
      errors.push({ oldUrl: e.oldUrl, reason: "not an absolute URL" });
      continue;
    }
    const kind = typeof e.kind === "string" ? e.kind.trim() : "";
    if (url.protocol !== "https:" && url.protocol !== "http:") errors.push({ oldUrl: e.oldUrl, reason: "not http(s)" });
    else if (bareHost(url.hostname) !== source) errors.push({ oldUrl: e.oldUrl, reason: "foreign-host" });
    else if (!kind) errors.push({ oldUrl: e.oldUrl, reason: "missing kind" });
    else {
      url.hash = "";
      if (seen.has(url.href)) {
        summary.duplicates++;
        continue;
      }
      seen.add(url.href);
      const images = (e.images ?? []).filter((i): i is string => typeof i === "string");
      rows.push({ oldUrl: url.href, oldPath: url.pathname + url.search, kind, sitemap: e.sitemap ?? null, lastmod: e.lastmod ?? null, images });
      summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1;
    }
  }
  return { rows, errors, summary: { ...summary, valid: rows.length, invalid: errors.length } };
}

export type FreezeOptions = {
  dryRun: boolean;
  /** Extra snapshot facts from the reader (sitemap list, robots, DNS before). */
  snapshot?: Record<string, unknown>;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function freezeUrlMap(
  projectId: string,
  entries: readonly FrozenUrlInput[],
  actor: AuditActor,
  opts: FreezeOptions,
): Promise<FreezeOutcome> {
  const project = await prisma.migrationProject.findUnique({ where: { id: projectId }, select: { sourceUrl: true } });
  if (!project) throw new Error("Migration project not found.");
  const plan = planFreeze(project.sourceUrl, entries);
  if (opts.dryRun) {
    return { dryRun: true, replaces: await prisma.migrationUrlMap.count({ where: { projectId } }), ...plan };
  }
  // A freeze with nothing valid would wipe the map the checks run against.
  if (plan.rows.length === 0) return { dryRun: false, frozen: 0, skipped: plan.errors.length, errors: plan.errors, snapshotId: null };

  const snapshotId = randomUUID();
  const frozenAt = new Date();
  const snapshot = { ...opts.snapshot, id: snapshotId, frozenAt: frozenAt.toISOString(), counts: { urls: plan.rows.length, byKind: plan.summary.byKind } };
  await withAudit(
    {
      actor,
      tool: "migration.freeze_sitemap",
      // Never the URL list: the count is what an audit reader needs; the rows are the record.
      args: { projectId, count: plan.rows.length, dryRun: false },
      requestId: opts.requestId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    },
    async () => {
      await prisma.$transaction([
        prisma.migrationUrlMap.deleteMany({ where: { projectId } }),
        prisma.migrationUrlMap.createMany({ data: plan.rows.map((r) => ({ projectId, ...r })) }),
        prisma.migrationProject.update({ where: { id: projectId }, data: { frozenAt, snapshot: snapshot as Prisma.InputJsonObject } }),
      ]);
      return { frozen: plan.rows.length, snapshotId };
    },
  );
  return { dryRun: false, frozen: plan.rows.length, skipped: plan.errors.length, errors: plan.errors, snapshotId };
}

export type CallMeta = Pick<FreezeOptions, "requestId" | "ip" | "userAgent">;
const origin = (u: string) => new URL(u).origin;
/** A shop's address as lib/woo reads it — origin and path: two shops on one host are two shops. */
const shopBase = (u: string) => { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/+$/, "")}`; };
export const snapshotIdOf = (snapshot: unknown) => {
  const id = (snapshot as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
};

/**
 * The measuring config a run is bound to besides the URL snapshot — today the
 * new site's origin. A hash of its CONTENT: a new target makes every earlier
 * run stale, and setting the old target back makes them count again (within
 * 24 hours, on the same snapshot), since they measured that very site.
 */
export function configHashOf(targetUrl: string | null): string {
  const target = targetUrl ? new URL(targetUrl).origin : null;
  return createHash("sha256").update(JSON.stringify({ target })).digest("hex").slice(0, 16);
}

/**
 * What a run made now is bound to, and what a run must still be bound to, to
 * count: the snapshot, the measuring config and this deploy's build. With no
 * build known (local dev: no VERCEL_GIT_COMMIT_SHA) the build is left out and
 * never compared. A sign-off records and is judged without it (ready.ts
 * `bindingsFor`): it was not measured on a build.
 */
export function currentBindings(project: { snapshot: unknown; targetUrl: string | null }): RunBindings {
  const snapshotId = snapshotIdOf(project.snapshot);
  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA || undefined;
  return { ...(snapshotId ? { snapshotId } : {}), configHash: configHashOf(project.targetUrl), ...(buildSha ? { buildSha } : {}) };
}

/** The site's migration project — one per site, the newest, as the board reads it. */
export async function currentMigrationProject() {
  const project = await prisma.migrationProject.findFirst({ orderBy: { createdAt: "desc" } });
  if (!project) throw new Error("No migration project yet: set one up with migration.project_set (sourceUrl).");
  return project;
}

/**
 * Create the project or change its addresses; both are stored as an origin. A
 * new SOURCE origin drops the frozen URL map in the same transaction and stamps
 * a fresh snapshot id with no freeze behind it, so no run or sign-off made
 * against the old site still counts toward the switch.
 */
export async function setMigrationProject(
  input: { sourceUrl?: string; targetUrl?: string | null },
  actor: AuditActor,
  meta: CallMeta,
): Promise<{ id: string; sourceUrl: string; targetUrl: string | null; created: boolean; freezeReset: boolean }> {
  const sourceUrl = input.sourceUrl === undefined ? undefined : origin(input.sourceUrl);
  const targetUrl = input.targetUrl == null ? input.targetUrl : origin(input.targetUrl);
  const existing = await prisma.migrationProject.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, sourceUrl: true } });
  if (!existing && !sourceUrl) throw new Error("sourceUrl is required to set up the migration project.");
  const freezeReset = !!existing && !!sourceUrl && origin(existing.sourceUrl) !== sourceUrl;
  return withAudit({ actor, tool: "migration.project_set", args: { sourceUrl, targetUrl, freezeReset }, ...meta }, async () => {
    if (!existing) {
      const p = await prisma.migrationProject.create({ data: { sourceUrl: sourceUrl!, targetUrl: targetUrl ?? null } });
      return { id: p.id, sourceUrl: p.sourceUrl, targetUrl: p.targetUrl, created: true, freezeReset: false };
    }
    const reset = { frozenAt: null, snapshot: { id: randomUUID(), resetAt: new Date().toISOString(), reason: "source changed" } };
    const update = prisma.migrationProject.update({
      where: { id: existing.id },
      data: { ...(sourceUrl ? { sourceUrl } : {}), ...(targetUrl !== undefined ? { targetUrl } : {}), ...(freezeReset ? reset : {}) },
    });
    const p = freezeReset
      ? (await prisma.$transaction([update, prisma.migrationUrlMap.deleteMany({ where: { projectId: existing.id } })]))[0]
      : await update;
    return { id: p.id, sourceUrl: p.sourceUrl, targetUrl: p.targetUrl, created: false, freezeReset };
  });
}

export type AttestStatus = "pass" | "warn" | "fail";

/**
 * The owner's sign-off on a catalogue row that is not measured alone. It is
 * kept in `attestations` (who, when, the note); on a pure sign-off row it is
 * also that check's run, bound to the current snapshot, so the counter reads it
 * like any other. A check+sign-off row still needs its machine half to count.
 * `cutover.switched` signed off as a pass is the ONLY writer of `switchedAt`;
 * signing it off again keeps the first time.
 *
 * The write is a compare-and-set on `updatedAt`, which it moves strictly
 * forward: a sign-off saved between our read and our write makes us re-read
 * and merge, never overwrite it (bounded; the run row commits with it or not).
 */
export async function attestCheck(
  input: { checkId: string; status: AttestStatus; note: string },
  actor: AuditActor,
  meta: CallMeta,
): Promise<{ checkId: string; status: AttestStatus; attestedAt: string; recordedRun: boolean; switchedAt: string | null }> {
  const row = CHECK_CATALOG.find((r) => r.id === input.checkId);
  if (!row || row.verify === "machine") throw new Error(`${input.checkId} is measured by a check, not signed off.`);
  const recordedRun = row.verify === "attest";
  return withAudit({ actor, tool: "migration.attest", args: input, ...meta }, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const project = await currentMigrationProject();
      const at = new Date(Math.max(Date.now(), project.updatedAt.getTime() + 1));
      const attestations = { ...(project.attestations as Prisma.JsonObject | null), [row.id]: { status: input.status, note: input.note, actor, at: at.toISOString() } };
      const switches = row.id === "cutover.switched" && input.status === "pass" && !project.switchedAt;
      const { snapshotId, configHash } = currentBindings(project);
      const saved = await prisma.$transaction(async (tx) => {
        const { count } = await tx.migrationProject.updateMany({
          where: { id: project.id, updatedAt: project.updatedAt },
          data: { attestations, updatedAt: at, ...(switches ? { switchedAt: at } : {}) },
        });
        if (count === 0) return false;
        if (recordedRun) {
          await tx.migrationCheckRun.create({
            data: {
              projectId: project.id, checkId: row.id, phase: row.phase === "after" ? "after" : "before", status: input.status,
              summary: { attestation: { note: input.note } }, bindings: { snapshotId, configHash }, actor, startedAt: at, finishedAt: at,
            },
          });
        }
        return true;
      });
      const switchedAt = switches ? at : project.switchedAt;
      if (saved) return { checkId: row.id, status: input.status, attestedAt: at.toISOString(), recordedRun, switchedAt: switchedAt?.toISOString() ?? null };
    }
    throw new Error("Other sign-offs kept landing at the same moment, so nothing was saved. Try again.");
  });
}

/**
 * Keep the summary of the last WooCommerce import plan (migration.woo_plan) in
 * `settings.wooPlan`, the project's other settings untouched. The same
 * compare-and-set on `updatedAt` as a sign-off, so one saved meanwhile is
 * re-read and kept. A plan of another shop than the project now names as its
 * source is not saved. One audit entry, with the counts and never the rows.
 */
export async function saveWooPlanSummary(projectId: string, summary: WooPlanSummary, actor: AuditActor, meta: CallMeta): Promise<void> {
  const args = { projectId, counts: summary.counts, sourcePricesIncludeVat: summary.sourcePricesIncludeVat };
  await withAudit({ actor, tool: "migration.woo_plan", args, ...meta }, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const project = await prisma.migrationProject.findUnique({ where: { id: projectId } });
      if (!project || shopBase(project.sourceUrl) !== shopBase(summary.storeUrl)) {
        throw new Error("The migration project's source changed while the shop was read, so the plan was not saved. Plan again.");
      }
      const at = new Date(Math.max(Date.now(), project.updatedAt.getTime() + 1));
      const settings = { ...(project.settings as Prisma.JsonObject | null), wooPlan: summary as unknown as Prisma.InputJsonObject };
      const { count } = await prisma.migrationProject.updateMany({ where: { id: project.id, updatedAt: project.updatedAt }, data: { settings, updatedAt: at } });
      if (count > 0) return { plannedAt: summary.plannedAt };
    }
    throw new Error("Other changes to the migration project kept landing at the same moment, so the plan was not saved. Try again.");
  });
}

export type MigrationBoardData = {
  project: { id: string; sourceUrl: string; targetUrl: string | null; frozenAt: Date | null; switchedAt: Date | null; snapshotId: string | null } | null;
  urlCount: number;
  latest: Map<string, LatestRun>;
  /** What a latest run must be bound to, to count (`currentBindings`). */
  current: RunBindings;
  /** The last WooCommerce import plan's summary (`settings.wooPlan`), if any. */
  wooPlan: WooPlanSummary | null;
};

/** The board's read: the project (one per site), its URL count, the latest run per check and the last import plan. */
export async function loadMigrationBoard(): Promise<MigrationBoardData> {
  const project = await prisma.migrationProject.findFirst({ orderBy: { createdAt: "desc" } });
  if (!project) return { project: null, urlCount: 0, latest: new Map(), current: {}, wooPlan: null };
  const wooPlan = parseWooPlanSummary(project.settings);
  const [urlCount, runs] = await Promise.all([
    prisma.migrationUrlMap.count({ where: { projectId: project.id } }),
    prisma.migrationCheckRun.findMany({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
      distinct: ["checkId"],
      select: { checkId: true, status: true, finishedAt: true, bindings: true },
    }),
  ]);
  return {
    project: {
      id: project.id,
      sourceUrl: project.sourceUrl,
      targetUrl: project.targetUrl,
      frozenAt: project.frozenAt,
      switchedAt: project.switchedAt,
      snapshotId: snapshotIdOf(project.snapshot),
    },
    urlCount,
    latest: new Map(runs.map((r) => [r.checkId, { ...r, bindings: r.bindings as RunBindings | null }])),
    current: currentBindings(project),
    // A plan read from the source the project named before is not this project's plan.
    wooPlan: wooPlan && shopBase(wooPlan.storeUrl) === shopBase(project.sourceUrl) ? wooPlan : null,
  };
}
