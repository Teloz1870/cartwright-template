import "server-only";

import { z } from "zod";
import { defineTool, type ToolCtx } from "@/lib/tools/types";
import { getFeatureGateState } from "@/lib/brand";
import { parseAndValidateUrl } from "@/lib/import/safe-fetch";
import { CHECK_CATALOG } from "@/lib/migration/catalog";
import { dataCountsSummarySchema } from "@/lib/migration/checks/data";
import { bindingsFor, isFreshPass, readyForDns } from "@/lib/migration/ready";
import { attestCheck, hasQueryOrFragment, loadMigrationBoard, setMigrationProject } from "@/lib/migration/store";
import { freezeFromSitemap, PAGE_CHUNK, PARITY_CHUNK, RUNNABLE_CHECKS, runCheck } from "@/lib/migration/runner";
import { DNS_CHECKS, runDnsCheck, type DnsCheckId } from "@/lib/migration/checks/dns";

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
const sourceSite = siteUrl.refine((s) => !hasQueryOrFragment(s), "must be the shop's address without a query (?) or fragment (#)");
const confirmed = z.literal(true, { error: "Requires confirm: true" });
const count = z.number().int().nonnegative();
const iso = (d: Date | null) => d?.toISOString() ?? null;

export const projectSetTool = defineTool({
  name: "migration.project_set",
  description:
    "Set up the site's migration project, or change its addresses: sourceUrl = the old WordPress/WooCommerce site, targetUrl = the new site the checks measure (null clears it). sourceUrl is stored as its origin and path, trailing slash dropped — a WordPress installed in a subdirectory keeps it (https://example.com/shop/ is read at /shop/wp-json/ and /shop/sitemap_index.xml) — and refused with a query or fragment. Give the address WordPress is installed at, not a page: for a shop in the root, the bare domain, never its shop page (/shop/, /butik/); targetUrl is stored as an origin. Give the canonical host (www or not) the old sitemap lists. A new source drops the frozen URL map — freeze again. Requires confirm: true.",
  scope: "settings:write",
  input: z
    .object({ sourceUrl: sourceSite.optional(), targetUrl: siteUrl.nullable().optional(), confirm: confirmed })
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

/**
 * Every check with a runner: the ones lib/migration/runner.ts lists (the cursor checks url.parity,
 * url.content and seo.head, and data.counts, run through the commerce seam) and the DNS pair
 * (lib/migration/checks/dns.ts). One check per call; data.counts and the DNS checks finish in one
 * call, so they take no cursor.
 */
const RUNNABLE = [...RUNNABLE_CHECKS, ...DNS_CHECKS] as const;
const isDnsCheck = (id: string | undefined): id is DnsCheckId => (DNS_CHECKS as readonly string[]).includes(id ?? "");
const dnsHostRow = z.object({
  host: z.string(), status: z.enum(["pass", "warn", "fail", "skip", "inconclusive", "absent"]),
  cname: z.array(z.string()), addresses: z.array(z.string()), ttl: count.nullable(), detail: z.string().optional(),
}).strict();

const runHead = { runId: z.string(), status: statusEnum, finished: z.boolean(), nextCursor: z.string().nullable(), chunk: count, processed: count, total: count, target: z.string() };
const findingValue = z.union([z.string(), z.number()]).nullable().optional();
const pageRow = z.object({
  oldUrl: z.string(), newUrl: z.string(), status: statusEnum, detail: z.string().optional(),
  findings: z.array(z.object({ field: z.string(), status: z.enum(["warn", "fail", "inconclusive"]), old: findingValue, new: findingValue, detail: z.string().optional() }).strict()),
}).strict();

export const runChecksTool = defineTool({
  name: "migration.run_checks",
  description: `Run ONE migration check that has a runner. url.parity (the default): every frozen old path requested on targetUrl, redirects followed by hand, at most ${PARITY_CHUNK} URLs a call. url.content and seo.head: for each URL url.parity found on the new site, the old page (live, so before the DNS switch only) against the new one — url.content: soft 404, h1, JSON-LD sku, tables/paragraphs/links/images inside <main>; seo.head: title, meta description, canonical on the expected host, noindex by meta tag or X-Robots-Tag, og:image — at most ${PAGE_CHUNK} URLs a call. A call to any of these three takes about 45 seconds; while finished is false, call again with cursor = nextCursor to continue the same run. data.counts (checkIds: ["data.counts"], no cursor, a webshop site only): the source WooCommerce shop's categories and products (its Store API, GETs only) against the rows imported here, in one call — pass when every one is imported and none is extra, warn when every difference is on the skip list (a variable or grouped product until schema batch B, or a row the import plan holds back as a conflict, orphan or blocked, with its reason), fail on an unexplained difference, inconclusive when the shop cannot be read whole in about 45 seconds; it returns the first 50 differing ids. dns.web: what the domain that moves (settings.expectedHost, else the source's host) and its www twin resolve to, held against the new site's host and addresses — before the signed-off switch a difference is information (skip), after it a fail; when the new site is a *.vercel.app alias, a CNAME to Vercel's edge or its documented apex A passes and any other difference after the switch is inconclusive, since Vercel serves a custom domain from other addresses than the alias. dns.ttl: the zone's own TTL for those records, warn above 300 s (before the switch only). data.counts and the DNS checks finish in one call and take no cursor. Sends GETs to the project's hosts and DNS queries, nothing else; writes the run, and for url.parity each URL's last result.`,
  scope: "settings:read",
  input: z
    .object({
      checkIds: z.array(z.enum(RUNNABLE)).min(1).max(1, "One check per call.").optional(),
      cursor: z.string().min(1).max(64).optional(),
    })
    .refine((d) => !(d.cursor && isDnsCheck(d.checkIds?.[0])), { message: "A DNS check finishes in one call; it takes no cursor." }),
  output: z.discriminatedUnion("checkId", [
    z.object({
      ...runHead, checkId: z.literal("url.parity"),
      counts: z.object({ pass: count, warn: count, fail: count, inconclusive: count }).strict(),
      classes: z.record(z.string(), count),
      firstErrors: z.array(parityRow),
    }).strict(),
    z.object({
      ...runHead, checkId: z.enum(["url.content", "seo.head"]),
      counts: z.object({ pass: count, warn: count, fail: count, skip: count, inconclusive: count }).strict(),
      fields: z.record(z.string(), count),
      firstErrors: z.array(pageRow),
    }).strict(),
    dataCountsSummarySchema.extend({ runId: z.string(), checkId: z.literal("data.counts"), finished: z.literal(true), nextCursor: z.null() }).strict(),
    z.object({
      runId: z.string(), checkId: z.enum(DNS_CHECKS), status: statusEnum, finished: z.literal(true), nextCursor: z.null(),
      phase: z.enum(["before", "after"]), domain: z.string(), hosts: z.array(dnsHostRow),
      target: z.object({ hosts: z.array(z.string()), addresses: z.array(z.string()) }).strict().optional(),
      nameservers: z.array(z.string()).optional(), detail: z.string().optional(),
    }).strict(),
  ]),
  examples: [
    { name: "Run url.parity", body: { checkIds: ["url.parity"] } },
    { name: "Run url.content", body: { checkIds: ["url.content"] } },
    { name: "Run seo.head", body: { checkIds: ["seo.head"] } },
    { name: "Run data.counts", body: { checkIds: ["data.counts"] } },
    { name: "Read the web DNS", body: { checkIds: ["dns.web"] } },
    { name: "Read the DNS TTL", body: { checkIds: ["dns.ttl"] } },
  ],
  handler: async (args, ctx) => {
    await openMigrationGate();
    const checkId = args.checkIds?.[0];
    // data.counts and the DNS checks are measured in one call and never take a cursor, so they are dispatched before runCheck (the cursor-run checks).
    if (isDnsCheck(checkId)) return runDnsCheck(checkId, ctx.actor, meta(ctx));
    if (checkId === "data.counts") {
      if (args.cursor) throw new Error('data.counts runs on its own in one call: pass checkIds: ["data.counts"] and no cursor.');
      // The shop is read through lib/woo, the webshop module's: reached through the commerce seam, loaded on use.
      const { runWooDataCounts } = await import("@/lib/tools/packs/commerce");
      return runWooDataCounts(ctx.actor, meta(ctx));
    }
    return runCheck(checkId, ctx.actor, { cursor: args.cursor, ...meta(ctx) });
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
      runnable: [...RUNNABLE],
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
