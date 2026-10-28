import "server-only";

import { z } from "zod";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { defineTool, type ToolCtx } from "@/lib/tools/types";
import { openMigrationGate } from "@/lib/tools/migration";
import type { AuditActor } from "@/lib/audit";
import { currentBindings, currentMigrationProject, recordFinishedRun, saveWooPlanSummary, statedSourcePricesIncludeVat, type CallMeta } from "@/lib/migration/store";
import { wooPlanSummarySchema } from "@/lib/migration/woo-plan-summary";
import { judgeDataCounts, unreadableSource, type DataCountsSummary, type DataKind } from "@/lib/migration/checks/data";
import { RUN_BUDGET_MS } from "@/lib/migration/runner";
import { assertResolvedAddressesPublic } from "@/lib/import/safe-fetch";
import { WooHttpError, createWooClient, type WooTransport } from "@/lib/woo/client";
import { planWooCatalog, type WooDbState } from "@/lib/woo/plan";
import { summarizeWooPlan } from "@/lib/woo/summary";
import { WOO_SOURCE } from "@/lib/woo/map-catalog";
import { wooDataSource } from "@/lib/woo/counts";

/**
 * migration.woo_plan — W21-live-7-a: what importing the migration project's
 * source WooCommerce shop WOULD do to this catalogue. It reads the shop
 * (lib/woo/client.ts: GET only, the public Store API and wp/v2) and this
 * site's categories and products, plans with lib/woo/plan.ts, and keeps a
 * summary for /admin/migration. It writes no catalogue row; the run that does
 * is W21-live-2's. `settings:read` and no confirm, like migration.run_checks:
 * its only write is its own measurement.
 *
 * lib/woo is the webshop module's, so this pack comes through the commerce
 * seam (lib/tools/packs/commerce.ts): a profile without a webshop has no such
 * tool. Behind `migrationDashboard`, refused before any read or request.
 */

const BUDGET_DEFAULT_S = 60;

class WooBudgetSpent extends Error {}

/**
 * The network, held to ONE budget signal for the whole read: no request starts after the deadline,
 * one in flight is aborted by the signal, no retry waits past it, and neither does the public-address
 * check's DNS lookup. `spent` tells the budget running out by its cause, never by the clock: a 404
 * that lands at the deadline is a 404, and the signal's abort is the budget even when its timer fires
 * a millisecond before the deadline.
 */
function withinBudget(deadline: number) {
  const budget = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  const cut = new Promise<never>((_, reject) => budget.addEventListener("abort", () => reject(new WooBudgetSpent()), { once: true }));
  cut.catch(() => undefined); // no unhandled rejection when no lookup is racing it
  const assertHostPublic = async (hostname: string) => {
    if (budget.aborted || Date.now() >= deadline) throw new WooBudgetSpent();
    await Promise.race([assertResolvedAddressesPublic(hostname), cut]);
  };
  const transport: WooTransport = async (url, init) => {
    if (budget.aborted || Date.now() >= deadline) throw new WooBudgetSpent();
    return fetch(url, { ...init, signal: AbortSignal.any([init.signal, budget]) });
  };
  const sleep = async (ms: number) => {
    if (Date.now() + ms >= deadline) throw new WooBudgetSpent();
    await new Promise<void>((r) => setTimeout(r, ms));
  };
  return { transport, sleep, assertHostPublic, spent: (err: unknown) => err instanceof WooBudgetSpent || (budget.aborted && err === budget.reason) };
}

/** Why the shop could not be read, said so the next step is clear. */
function unread(err: unknown, spent: boolean, budgetSeconds: number): Error {
  if (err instanceof WooHttpError && err.status >= 300 && err.status < 400) {
    return new Error(`The shop redirects (HTTP ${err.status} for ${err.url}), and it is read only at the address it answers on: set sourceUrl to that address, usually the www or the bare domain (with WordPress's subdirectory, if it has one), with migration.project_set, then plan again. Nothing was saved.`);
  }
  if (spent) {
    return new Error(`Reading the shop cannot finish within ${budgetSeconds} s, so nothing was planned and nothing was saved. Call again with a larger budgetSeconds (at most 240).`);
  }
  return new Error(`Reading the shop failed: ${err instanceof Error ? err.message : String(err)}.${notThere(err)} Nothing was saved.`);
}

/** A 404 under a path: that path may be a page (a root install's /shop/), not where WordPress is installed. */
function notThere(err: unknown): string {
  if (!(err instanceof WooHttpError) || err.status !== 404) return "";
  const dir = new URL(err.url).pathname.split("/wp-json/")[0];
  return dir ? ` sourceUrl's path ${dir} must be the directory WordPress is installed in, not a page such as the shop page: for a shop in the root, set sourceUrl to the bare domain with migration.project_set.` : "";
}

/**
 * Every row holding a unique key a Woo row could claim, soft-deleted products
 * too: they keep their slug, sku and permalink. No `owned` projection yet
 * (W21-live-2 adds it), so a Woo row already here reads as a conflict.
 */
async function readWooDbState(): Promise<WooDbState> {
  const keys = { id: true, slug: true, permalink: true, source: true, externalId: true } as const;
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ select: keys }),
    prisma.product.findMany({ select: { ...keys, sku: true } }),
  ]);
  return { categories, products };
}

const meta = (ctx: ToolCtx) => ({ requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent });

export const wooPlanTool = defineTool({
  name: "migration.woo_plan",
  description:
    "Plan importing the migration project's source WooCommerce shop (its sourceUrl) into this catalogue — a dry run. The shop is read at sourceUrl's origin and path: a WordPress installed in a subdirectory, such as https://example.com/shop/, is read at https://example.com/shop/wp-json/, one in the root at /wp-json/. Reads the shop's public Store API and wp/v2 (GETs only) and this site's categories and products, and returns the counts per action and of orphan variations, plus the first 50 rows that need a look (conflict, orphan, blocked; a row to create is only counted) and the first 20 rows gone from the source and mapping warnings. Until the importer exists (W21-live-2), every row plans as create, conflict, orphan or blocked: a row already here from an earlier import is a conflict, never update, unchanged or skip, so those three counts stay 0. Writes nothing to the catalogue; keeps this summary for /admin/migration. Prices are never converted: until sourcePricesIncludeVat says whether the shop's prices include VAT, every product is blocked, and so it is when that differs from this site's pricesIncludeVat. budgetSeconds (10–240, default 60) bounds the read; an admin chat request ends at 120 s, so a longer read belongs on REST.",
  scope: "settings:read",
  input: z.object({
    sourcePricesIncludeVat: z.boolean().optional(),
    budgetSeconds: z.number().int().min(10).max(240).optional(),
  }),
  output: wooPlanSummarySchema,
  examples: [{ name: "Plan the import", body: { sourcePricesIncludeVat: true } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    const project = await currentMigrationProject();
    const started = Date.now();
    const budgetSeconds = args.budgetSeconds ?? BUDGET_DEFAULT_S;
    const { spent, ...network } = withinBudget(started + budgetSeconds * 1000);
    const client = createWooClient({ storeUrl: project.sourceUrl, siteUrl: brand.url, ...network });
    const snapshot = await client.fetchSnapshot().catch((err: unknown) => {
      throw unread(err, spent(err), budgetSeconds);
    });
    const { currency, pricesIncludeVat } = brand.policies;
    const { sourcePricesIncludeVat } = args;
    const plan = await planWooCatalog(snapshot, await readWooDbState(), { currency, pricesIncludeVat, sourcePricesIncludeVat });
    const summary = summarizeWooPlan(plan, snapshot, { currency, pricesIncludeVat, sourcePricesIncludeVat, durationMs: Date.now() - started, now: new Date() });
    await saveWooPlanSummary(project.id, summary, ctx.actor, meta(ctx));
    return summary;
  },
});

/** Why data.counts could not read the shop — the run's detail, so the owner knows what to fix. */
function sourceUnread(err: unknown, spent: boolean, budgetSeconds: number): string {
  if (err instanceof WooHttpError && err.status >= 300 && err.status < 400) {
    return `The shop redirects (HTTP ${err.status} for ${err.url}) and is read only at the address it answers on: set sourceUrl to that address with migration.project_set.`;
  }
  if (spent) return `Reading the shop did not finish within ${budgetSeconds} s.`;
  return `Reading the shop failed: ${err instanceof Error ? err.message : String(err)}.`;
}

/** This catalogue's imported rows by their Woo id: categories, and products not soft-deleted (a deleted product is not sold). */
async function readImportedIds(): Promise<Record<DataKind, string[]>> {
  const where = { source: WOO_SOURCE, externalId: { not: null } };
  const select = { externalId: true } as const;
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where, select }),
    prisma.product.findMany({ where: { ...where, deletedAt: null }, select }),
  ]);
  const ids = (rows: { externalId: string | null }[]) => rows.map((r) => r.externalId!);
  return { categories: ids(categories), products: ids(products) };
}

export type DataCountsRunOutcome = DataCountsSummary & { runId: string; checkId: "data.counts"; finished: true; nextCursor: null };

/**
 * MIGD-5a — `data.counts` for migration.run_checks: the source shop read like
 * migration.woo_plan reads it (GETs only, one budget), planned against this
 * catalogue so a row the import leaves out carries the importer's own reason,
 * and held against the rows imported here (lib/migration/checks/data.ts).
 * A shop that cannot be read is an `inconclusive` run, never a fail. The
 * plan's tax basis is the one the owner stated on the last migration.woo_plan;
 * unstated, every product the import would block says so. One call, one run.
 */
export async function runWooDataCounts(actor: AuditActor, meta: CallMeta): Promise<DataCountsRunOutcome> {
  const project = await currentMigrationProject();
  const bindings = currentBindings(project);
  const startedAt = new Date();
  const budgetSeconds = RUN_BUDGET_MS / 1000;
  const { spent, ...network } = withinBudget(startedAt.getTime() + RUN_BUDGET_MS);
  const client = createWooClient({ storeUrl: project.sourceUrl, siteUrl: brand.url, ...network });
  const read = await client.fetchSnapshot().then(
    (snapshot) => ({ snapshot }),
    (err: unknown) => ({ failure: sourceUnread(err, spent(err), budgetSeconds) }),
  );
  const imported = await readImportedIds();
  let summary: DataCountsSummary;
  if ("failure" in read) summary = unreadableSource(read.failure, imported);
  else {
    const { currency, pricesIncludeVat } = brand.policies;
    const sourcePricesIncludeVat = statedSourcePricesIncludeVat(project);
    const plan = await planWooCatalog(read.snapshot, await readWooDbState(), { currency, pricesIncludeVat, sourcePricesIncludeVat });
    summary = judgeDataCounts({ source: wooDataSource(read.snapshot, plan), imported });
  }
  const runId = await recordFinishedRun(project, { checkId: "data.counts", status: summary.status, summary, bindings, startedAt }, actor, meta);
  return { runId, checkId: "data.counts", finished: true, nextCursor: null, ...summary };
}

export const migrationWooTools = [wooPlanTool];
