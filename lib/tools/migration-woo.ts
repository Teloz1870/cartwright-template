import "server-only";

import { z } from "zod";
import { brand } from "@/brand.config";
import { isPostgresDriver, prisma } from "@/lib/db";
import { defineTool, type ToolCtx } from "@/lib/tools/types";
import { openMigrationGate } from "@/lib/tools/migration";
import type { AuditActor } from "@/lib/audit";
import { currentBindings, currentMigrationProject, recordFinishedRun, saveWooPlanSummary, statedSourcePricesIncludeVat, type CallMeta } from "@/lib/migration/store";
import { wooPlanSummarySchema } from "@/lib/migration/woo-plan-summary";
import { judgeDataCounts, unreadableSource, type DataCountsSummary, type DataKind } from "@/lib/migration/checks/data";
import { RUN_BUDGET_MS } from "@/lib/migration/runner";
import { assertResolvedAddressesPublic } from "@/lib/import/safe-fetch";
import { WooHttpError, createWooClient, type WooTransport } from "@/lib/woo/client";
import { readLedger, storeOf } from "@/lib/woo/ledger";
import { planWooCatalog, type WooPlan, type WooPolicy } from "@/lib/woo/plan";
import { readViewAndLedger } from "@/lib/woo/read-view";
import { summarizeWooPlan } from "@/lib/woo/summary";
import { WOO_SOURCE } from "@/lib/woo/map-catalog";
import type { WooSnapshot } from "@/lib/woo/types";
import { wooDataSource } from "@/lib/woo/counts";
import { judgeDataPrices, unreadablePrices, type DataPricesSummary, type ImportedPrice } from "@/lib/migration/checks/data-prices";
import { wooPriceSource } from "@/lib/woo/price-source";
import { judgeDataStock, unreadableStock, type DataStockSummary, type ImportedStock } from "@/lib/migration/checks/data-stock";
import { wooImportAuth } from "@/lib/woo/run-import";
import { wooStockSource } from "@/lib/woo/stock-source";

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

/** The plan over this catalogue and its stored baseline as one point in time. The tool holds no wc/v3 key, so a create says create without its stock. */
async function planHere(snapshot: WooSnapshot, projectId: string, policy: WooPolicy): Promise<WooPlan> {
  const { view, baseline } = await readViewAndLedger(prisma, isPostgresDriver() ? "postgres" : "sqlite", projectId, storeOf(snapshot.storeUrl));
  return planWooCatalog(snapshot, view, policy, { baseline });
}

const meta = (ctx: ToolCtx) => ({ requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent });

export const wooPlanTool = defineTool({
  name: "migration.woo_plan",
  // Public: the flag refuses the call, not this text, so every shop with this tool lists it with
  // migrationDashboard off. Rewording it changes what a canary serves, and its CHANGELOG entry says so.
  description:
    "Plan importing the migration project's source WooCommerce shop (its sourceUrl) into this catalogue — a dry run. The shop is read at sourceUrl's origin and path: a WordPress installed in a subdirectory, such as https://example.com/shop/, is read at https://example.com/shop/wp-json/, one in the root at /wp-json/. Reads the shop's public Store API and wp/v2 (GETs only) and this site's categories and products, and returns the counts per action and of orphan variations, plus the first 50 rows that need a look (conflict, orphan and blocked, then skip; a row to create or left unchanged is only counted) and the first 20 rows gone from the source and mapping warnings. Each row's verdict is the one the importer's writes will run. Until the importer keeps a baseline (W21-live-2), update stays 0: a row already here from an earlier import is unchanged when it matches the source and a conflict when it differs, since nothing says which side changed. A product that is not simple, or one deleted here, is a skip. Writes nothing to the catalogue; keeps this summary for /admin/migration. Prices are never converted: until sourcePricesIncludeVat says whether the shop's prices include VAT, every simple product is blocked, and so it is when that differs from this site's pricesIncludeVat. budgetSeconds (10–240, default 60) bounds the read; an admin chat request ends at 120 s, so a longer read belongs on REST.",
  scope: "settings:read",
  gate: { ecommerce: true, flags: ["migrationDashboard"] },
  input: z.object({
    sourcePricesIncludeVat: z.boolean().optional(),
    budgetSeconds: z.number().int().min(10).max(240).optional(),
  }),
  output: wooPlanSummarySchema,
  examples: [{ name: "Plan the import", body: { sourcePricesIncludeVat: true } }],
  handler: async (args, ctx) => {
    await openMigrationGate();
    const project = await currentMigrationProject();
    await readLedger(prisma, project.id); // another shop's baseline, or one this version cannot read: refused before any request
    const started = Date.now();
    const budgetSeconds = args.budgetSeconds ?? BUDGET_DEFAULT_S;
    const { spent, ...network } = withinBudget(started + budgetSeconds * 1000);
    const client = createWooClient({ storeUrl: project.sourceUrl, siteUrl: brand.url, ...network });
    const snapshot = await client.fetchSnapshot().catch((err: unknown) => {
      throw unread(err, spent(err), budgetSeconds);
    });
    const { currency, pricesIncludeVat } = brand.policies;
    const { sourcePricesIncludeVat } = args;
    const plan = await planHere(snapshot, project.id, { currency, pricesIncludeVat, sourcePricesIncludeVat });
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
    const plan = await planHere(read.snapshot, project.id, { currency, pricesIncludeVat, sourcePricesIncludeVat });
    summary = judgeDataCounts({ source: wooDataSource(read.snapshot, plan), imported });
  }
  const runId = await recordFinishedRun(project, { checkId: "data.counts", status: summary.status, summary, bindings, startedAt }, actor, meta);
  return { runId, checkId: "data.counts", finished: true, nextCursor: null, ...summary };
}

/** This catalogue's imported products with their prices: by their Woo id, not soft-deleted (a deleted product is not sold). */
async function readImportedPrices(): Promise<ImportedPrice[]> {
  const rows = await prisma.product.findMany({
    where: { source: WOO_SOURCE, externalId: { not: null }, deletedAt: null },
    select: { externalId: true, priceDkk: true, compareAtDkk: true },
  });
  return rows.map((r) => ({ externalId: r.externalId!, priceDkk: r.priceDkk, compareAtDkk: r.compareAtDkk ?? null }));
}

export type DataPricesRunOutcome = DataPricesSummary & { runId: string; checkId: "data.prices"; finished: true; nextCursor: null };

/**
 * MIGD-5b — `data.prices` for migration.run_checks: the source shop read like
 * data.counts reads it (GETs only, one budget), each simple product priced as
 * the importer prices it (lib/woo/price-source.ts), and held against the
 * products imported here (lib/migration/checks/data-prices.ts), to the øre. The
 * tax basis is the one the owner stated on the last migration.woo_plan;
 * unstated, or not this shop's, no price is compared and the run is
 * `inconclusive`. A shop that cannot be read is `inconclusive` too, never a
 * fail. One call, one run, one audit entry without rows.
 */
export async function runWooDataPrices(actor: AuditActor, meta: CallMeta): Promise<DataPricesRunOutcome> {
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
  const imported = await readImportedPrices();
  let summary: DataPricesSummary;
  if ("failure" in read) summary = unreadablePrices(read.failure, imported.length);
  else {
    const { currency, pricesIncludeVat } = brand.policies;
    const sourcePricesIncludeVat = statedSourcePricesIncludeVat(project);
    const source = await wooPriceSource(read.snapshot, { currency, pricesIncludeVat, sourcePricesIncludeVat });
    summary = judgeDataPrices({ source, imported, taxBasis: { sourcePricesIncludeVat, pricesIncludeVat } });
  }
  const runId = await recordFinishedRun(project, { checkId: "data.prices", status: summary.status, summary, bindings, startedAt }, actor, meta);
  return { runId, checkId: "data.prices", finished: true, nextCursor: null, ...summary };
}

/** This catalogue's imported products with their stock and policy: by their Woo id, not soft-deleted (a deleted product is not sold). */
async function readImportedStock(): Promise<ImportedStock[]> {
  const rows = await prisma.product.findMany({
    where: { source: WOO_SOURCE, externalId: { not: null }, deletedAt: null },
    select: { externalId: true, stock: true, stockPolicy: true },
  });
  return rows.map((r) => ({ externalId: r.externalId!, stock: r.stock, stockPolicy: r.stockPolicy ?? null }));
}

const NO_KEY = "data.stock reads each product's stock from the shop's wc/v3 API, which needs a read key, and this site has none: set WOO_AUTH_USER and WOO_AUTH_PASS (a consumer key and its secret, or a WordPress user and an application password) in its environment, then run it again. Nothing was read or compared.";

/** Why the stock could not be read: a refused key is said as one, so the owner knows to check it. */
function stockUnread(err: unknown, spent: boolean, budgetSeconds: number): string {
  if (err instanceof WooHttpError && (err.status === 401 || err.status === 403) && new URL(err.url).pathname.includes("/wc/v3/")) {
    return `The shop refused the wc/v3 read key (HTTP ${err.status}): check WOO_AUTH_USER and WOO_AUTH_PASS, and that the key may read products. Nothing was compared.`;
  }
  return sourceUnread(err, spent, budgetSeconds);
}

/** The shop's stock against these imported products: no key, half a key or a failed read is `inconclusive` with why, never a pass or a fail. */
async function measureStock(sourceUrl: string, imported: readonly ImportedStock[], startedAt: Date): Promise<DataStockSummary> {
  let auth;
  try {
    auth = wooImportAuth(process.env);
  } catch (err) {
    return unreadableStock(`The wc/v3 read key is set by half: ${err instanceof Error ? err.message : String(err)}. Nothing was read or compared.`, imported.length);
  }
  if (!auth) return unreadableStock(NO_KEY, imported.length);
  const budgetSeconds = RUN_BUDGET_MS / 1000;
  const { spent, ...network } = withinBudget(startedAt.getTime() + RUN_BUDGET_MS);
  try {
    // The constructor refuses a key over plain http before any request: that is a reason, caught like a failed read.
    const client = createWooClient({ storeUrl: sourceUrl, siteUrl: brand.url, auth, ...network });
    const snapshot = await client.fetchSnapshot();
    const source = await wooStockSource(snapshot, new Set(imported.map((p) => p.externalId)), client.stockOf);
    return judgeDataStock({ source, imported });
  } catch (err) {
    return unreadableStock(stockUnread(err, spent(err), budgetSeconds), imported.length);
  }
}

export type DataStockRunOutcome = DataStockSummary & { runId: string; checkId: "data.stock"; finished: true; nextCursor: null };

/**
 * MIGD-5c — `data.stock` for migration.run_checks: the source shop read like
 * data.counts reads it (GETs only, one budget), then wc/v3's stock facts for the
 * simple products imported here (keyed: WOO_AUTH_USER and WOO_AUTH_PASS, as
 * `pnpm woo:import` reads them), each planned as the importer plans it
 * (lib/woo/stock-source.ts) and held against the policy and count stored here
 * (lib/migration/checks/data-stock.ts). Without a key, or with a shop that
 * cannot be read, the run is `inconclusive` and says why — never a pass or a
 * fail. One call, one run, one audit entry without rows.
 */
export async function runWooDataStock(actor: AuditActor, meta: CallMeta): Promise<DataStockRunOutcome> {
  const project = await currentMigrationProject();
  const bindings = currentBindings(project);
  const startedAt = new Date();
  const imported = await readImportedStock();
  const summary = await measureStock(project.sourceUrl, imported, startedAt);
  const runId = await recordFinishedRun(project, { checkId: "data.stock", status: summary.status, summary, bindings, startedAt }, actor, meta);
  return { runId, checkId: "data.stock", finished: true, nextCursor: null, ...summary };
}

/**
 * MIGD-4b — which of these frozen paths are lead-only products here, for
 * seo.product-jsonld to leave out. Lead-only is decided per product (ultraplan
 * D3) and stored as `attributes.leadOnly` or `attributes.catalogOnly`: true (the
 * W21-live mapping); a frozen path meets its product at the permalink the import
 * keeps. Nothing is matched, and so nothing left out, for any other value.
 */
export async function leadOnlyPaths(paths: readonly string[]): Promise<Set<string>> {
  const rows = await prisma.product.findMany({ where: { permalink: { in: [...paths] }, deletedAt: null }, select: { permalink: true, attributes: true } });
  const marked = rows.filter(({ attributes }) => {
    const a = attributes as { leadOnly?: unknown; catalogOnly?: unknown } | null;
    return a?.leadOnly === true || a?.catalogOnly === true;
  });
  return new Set(marked.flatMap((r) => r.permalink ?? []));
}

export const migrationWooTools = [wooPlanTool];
