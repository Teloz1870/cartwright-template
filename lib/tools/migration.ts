import "server-only";

import { z } from "zod";
import { defineTool, type ToolCtx } from "@/lib/tools/types";
import { getFeatureGateState } from "@/lib/brand";
import { parseAndValidateUrl } from "@/lib/import/safe-fetch";
import { CHECK_CATALOG } from "@/lib/migration/catalog";
import { bindingsFor, isFreshPass, readyForDns } from "@/lib/migration/ready";
import { attestCheck, loadMigrationBoard, setMigrationProject } from "@/lib/migration/store";
import { freezeFromSitemap, PARITY_CHUNK, RUNNABLE_CHECKS, runUrlParity } from "@/lib/migration/runner";

/**
 * migration.* — the agent side of /admin/migration (MIGD-3), over the same
 * lib/migration modules the board reads. No new scopes: setting up, freezing
 * and signing off are site-level writes (`settings:write`, plan-first confirm;
 * a freeze's `dryRun: true` is the preview and needs none), reading the board
 * and running a check are `settings:read` — a run sends GETs only, to the
 * owner-set hosts, and writes nothing but its own measurement rows.
 *
 * Behind the RUNTIME flag `migrationDashboard`, read fail-closed like
 * sitepack.*: off (or unreadable) ⇒ every handler refuses before any Migration*
 * read. Never in the shopper's allowlist (lib/ai/client.ts).
 */

export async function openMigrationGate(): Promise<void> {
  const { available, features } = await getFeatureGateState();
  if (!available) throw new Error("The migration dashboard is unavailable: the site's feature flags could not be read (database unreachable). Try again shortly.");
  if (!features.migrationDashboard) throw new Error("Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.");
}

const meta = (ctx: ToolCtx) => ({ requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent });
const isPublicUrl = (s: string) => {
  try {
    const u = parseAndValidateUrl(s);
    return !u.username && !u.password;
  } catch {
    return false;
  }
};
const siteUrl = z.string().refine(isPublicUrl, "must be an absolute http(s) URL of a public host, without credentials");
const confirmed = z.literal(true, { error: "Requires confirm: true" });
const count = z.number().int().nonnegative();
const iso = (d: Date | null) => d?.toISOString() ?? null;

export const projectSetTool = defineTool({
  name: "migration.project_set",
  description:
    "Set up the site's migration project, or change its addresses: sourceUrl = the old WordPress/WooCommerce site, targetUrl = the new site the checks measure (null clears it). Both are stored as an origin; give the canonical host (www or not) the old sitemap lists. A new source drops the frozen URL map — freeze again. Requires confirm: true.",
  scope: "settings:write",
  input: z
    .object({ sourceUrl: siteUrl.optional(), targetUrl: siteUrl.nullable().optional(), confirm: confirmed })
    .refine((d) => d.sourceUrl !== undefined || d.targetUrl !== undefined, { message: "Give sourceUrl, targetUrl or both." }),
  output: z.object({ id: z.string(), sourceUrl: z.string(), targetUrl: z.string().nullable(), created: z.boolean(), freezeReset: z.boolean() }).strict(),
  examples: [{ name: "Set up a migration", body: { sourceUrl: "https://old-shop.example", targetUrl: "https://new-shop.example", confirm: true } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    return setMigrationProject({ sourceUrl: args.sourceUrl, targetUrl: args.targetUrl }, ctx.actor, meta(ctx));
  },
});

const freezeError = z.object({ oldUrl: z.string(), reason: z.string() }).strict();
export const freezeSitemapTool = defineTool({
  name: "migration.freeze_sitemap",
  description:
    "Freeze the old site's URL list from its sitemap (Yoast's /sitemap_index.xml unless sitemapUrl names another on the source host) — the list url.parity checks. dryRun:true crawls and returns the plan without writing. confirm:true replaces the frozen map in one transaction, and is refused unless every sitemap was read; at most 20,000 URLs.",
  scope: "settings:write",
  input: z
    .object({ sitemapUrl: z.url({ protocol: /^https?$/ }).optional(), dryRun: z.boolean().optional(), confirm: z.boolean().optional() })
    .refine((d) => d.dryRun === true || d.confirm === true, { message: "Requires confirm: true to freeze (or dryRun: true to preview)." }),
  output: z.discriminatedUnion("dryRun", [
    z.object({
      dryRun: z.literal(true),
      complete: z.boolean(),
      capped: z.union([z.literal(false), z.enum(["urls", "sitemaps"])]),
      sitemaps: z.array(z.object({ url: z.string(), status: z.string(), kind: z.string().optional(), count: count.optional(), detail: z.string().optional() }).strict()),
      foreign: count,
      replaces: count,
      summary: z.object({ entries: count, valid: count, invalid: count, duplicates: count, byKind: z.record(z.string(), count) }).strict(),
      sample: z.array(z.object({ oldPath: z.string(), kind: z.string() }).strict()),
      errors: z.array(freezeError),
    }).strict(),
    z.object({ dryRun: z.literal(false), frozen: count, skipped: count, snapshotId: z.string().nullable(), errors: z.array(freezeError) }).strict(),
  ]),
  examples: [{ name: "Preview the freeze", body: { dryRun: true } }, { name: "Freeze", body: { confirm: true } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    const { crawl, outcome } = await freezeFromSitemap(ctx.actor, { sitemapUrl: args.sitemapUrl, dryRun: args.dryRun === true, ...meta(ctx) });
    if (!outcome.dryRun) return { ...outcome, errors: outcome.errors.slice(0, 50) };
    const { complete, capped, sitemaps, foreign } = crawl;
    const sample = outcome.rows.slice(0, 20).map((r) => ({ oldPath: r.oldPath, kind: r.kind }));
    return { dryRun: true as const, complete, capped, sitemaps: sitemaps.slice(0, 50), foreign: foreign.count, replaces: outcome.replaces, summary: outcome.summary, sample, errors: outcome.errors.slice(0, 50) };
  },
});

const statusEnum = z.enum(["pass", "warn", "fail", "skip", "inconclusive"]);
const parityRow = z.object({
  oldUrl: z.string(), targetUrl: z.string(), finalUrl: z.string(), variant: z.boolean(),
  expect: z.enum(["same", "301", "gone"]),
  class: z.enum(["same", "same-modulo-slash", "redirect", "chain", "missing", "gone", "error", "inconclusive"]),
  status: z.enum(["pass", "warn", "fail", "inconclusive"]),
  http: z.number().int(),
  hops: z.array(z.object({ url: z.string(), status: z.number().int() }).strict()),
  detail: z.string().optional(),
}).strict();

export const runChecksTool = defineTool({
  name: "migration.run_checks",
  description: `Run the migration checks that have a runner (today: url.parity — every frozen old path requested on targetUrl, redirects followed by hand). One call checks at most ${PARITY_CHUNK} URLs in about 45 seconds; while finished is false, call again with cursor = nextCursor to continue the same run. Sends GETs only, to the project's hosts; writes the run and each URL's last result.`,
  scope: "settings:read",
  input: z.object({ checkIds: z.array(z.enum(RUNNABLE_CHECKS)).min(1).optional(), cursor: z.string().min(1).max(64).optional() }),
  output: z.object({
    runId: z.string(), checkId: z.literal("url.parity"), status: statusEnum, finished: z.boolean(), nextCursor: z.string().nullable(),
    chunk: count, processed: count, total: count, target: z.string(),
    counts: z.object({ pass: count, warn: count, fail: count, inconclusive: count }).strict(),
    classes: z.record(z.string(), count),
    firstErrors: z.array(parityRow),
  }).strict(),
  examples: [{ name: "Run url.parity", body: { checkIds: ["url.parity"] } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    return runUrlParity(ctx.actor, { cursor: args.cursor, ...meta(ctx) });
  },
});

export const statusTool = defineTool({
  name: "migration.status",
  description:
    "Read the migration board: the project (source, target, frozen/switched times), the frozen URL count, \"Ready for DNS switch\" (required checks whose latest run passed within 24 hours on the current snapshot and new site, and the ones missing), and the latest run per check. Read-only.",
  scope: "settings:read",
  input: z.object({}),
  output: z.object({
    project: z.object({
      id: z.string(), sourceUrl: z.string(), targetUrl: z.string().nullable(),
      frozenAt: z.string().nullable(), switchedAt: z.string().nullable(), snapshotId: z.string().nullable(),
    }).strict().nullable(),
    urlCount: count,
    ready: z.object({ ready: count, required: count, missing: z.array(z.string()) }).strict(),
    runnable: z.array(z.string()),
    checks: z.array(z.object({ checkId: z.string(), status: z.string(), finishedAt: z.string().nullable(), fresh: z.boolean() }).strict()),
  }).strict(),
  handler: async () => {
    await openMigrationGate();
    const { project, urlCount, latest, current } = await loadMigrationBoard();
    const now = new Date();
    return {
      project: project && { ...project, frozenAt: iso(project.frozenAt), switchedAt: iso(project.switchedAt) },
      urlCount,
      ready: readyForDns(latest, { now, current }),
      runnable: [...RUNNABLE_CHECKS],
      checks: [...latest.values()].map((r) => {
        const fresh = isFreshPass(r, now, bindingsFor(CHECK_CATALOG.find((c) => c.id === r.checkId), current));
        return { checkId: r.checkId, status: r.status, finishedAt: iso(r.finishedAt), fresh };
      }),
    };
  },
});

const ATTESTABLE = CHECK_CATALOG.filter((r) => r.verify !== "machine").map((r) => r.id) as [string, ...string[]];
export const attestTool = defineTool({
  name: "migration.attest",
  description:
    "Record the owner's sign-off on a migration check a machine cannot settle alone (a test order, the cart matrix, cutover reconciled, …): status pass|warn|fail and a note. On a sign-off-only check it is that check's run, counted toward the switch while it is under 24 hours old on the current snapshot. cutover.switched as a pass records the DNS switch time — the only thing that does. Requires confirm: true.",
  scope: "settings:write",
  input: z.object({ checkId: z.enum(ATTESTABLE), status: z.enum(["pass", "warn", "fail"]), note: z.string().trim().min(1).max(2000), confirm: confirmed }),
  output: z.object({
    checkId: z.string(), status: z.enum(["pass", "warn", "fail"]), attestedAt: z.string(), recordedRun: z.boolean(), switchedAt: z.string().nullable(),
  }).strict(),
  examples: [{ name: "Sign off the test order", body: { checkId: "pay.test-order", status: "pass" as const, note: "Order 1042, refunded", confirm: true as const } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    return attestCheck({ checkId: args.checkId, status: args.status, note: args.note }, ctx.actor, meta(ctx));
  },
});

export const migrationTools = [projectSetTool, freezeSitemapTool, runChecksTool, statusTool, attestTool];
