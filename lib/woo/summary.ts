import {
  WOO_PLAN_ISSUE_CAP,
  WOO_PLAN_ISSUES,
  WOO_PLAN_LIST_CAP,
  type WooPlanSummary,
} from "@/lib/migration/woo-plan-summary";
import type { WooPlan, WooPlanItem } from "@/lib/woo/plan";
import type { WooSnapshot } from "@/lib/woo/types";

/**
 * W21-live-7-a — a plan cut down to what the migration project keeps
 * (lib/migration/woo-plan-summary.ts): every count, the first rows a person
 * has to look at, no fingerprint. Pure.
 *
 * The two action lists are tied by the types: `counts` takes the plan's
 * Record<WooAction, …> where the summary wants every WooPlanAction, and an
 * issue takes a WooAction where the summary wants a WooPlanAction — an action
 * added on either side fails to compile here.
 */
export function summarizeWooPlan(
  plan: WooPlan,
  snapshot: WooSnapshot,
  ctx: { currency: string; pricesIncludeVat: boolean; sourcePricesIncludeVat?: boolean; durationMs: number; now: Date },
): WooPlanSummary {
  const flagged = (kind: "category" | "product" | "variation", items: WooPlanItem[]) =>
    items
      .filter((i) => WOO_PLAN_ISSUES.includes(i.action))
      .map((i) => ({ kind, externalId: i.externalId, slug: i.slug, action: i.action, reason: i.reason, dbId: i.dbId }));
  const issues = [...flagged("category", plan.categories), ...flagged("product", plan.products), ...flagged("variation", plan.variations.orphans)];
  const byCode: Record<string, number> = {};
  for (const w of plan.warnings) byCode[w.code] = (byCode[w.code] ?? 0) + 1;
  return {
    version: 1,
    plannedAt: ctx.now.toISOString(),
    durationMs: Math.max(0, Math.round(ctx.durationMs)),
    storeUrl: snapshot.storeUrl,
    fetchedAt: snapshot.fetchedAt,
    mappingVersion: plan.mappingVersion,
    currency: ctx.currency,
    pricesIncludeVat: ctx.pricesIncludeVat,
    sourcePricesIncludeVat: ctx.sourcePricesIncludeVat ?? null,
    collections: snapshot.meta,
    counts: plan.counts,
    variations: { attached: plan.variations.attached, orphans: plan.variations.orphans.length },
    missingInSource: { count: plan.missingInSource.length, first: plan.missingInSource.slice(0, WOO_PLAN_LIST_CAP) },
    warnings: { byCode, first: plan.warnings.slice(0, WOO_PLAN_LIST_CAP) },
    snapshotWarnings: plan.snapshotWarnings,
    issues: { count: issues.length, first: issues.slice(0, WOO_PLAN_ISSUE_CAP) },
  };
}
