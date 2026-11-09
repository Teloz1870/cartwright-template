import type { DataCountsInput, DataSkip, DataSourceRow } from "@/lib/migration/checks/data";
import type { WooPlan, WooPlanItem } from "@/lib/woo/plan";
import type { WooSnapshot } from "@/lib/woo/types";

/**
 * MIGD-5a — the shop's side of `data.counts` (lib/migration/checks/data.ts):
 * every category and product the snapshot lists, each with the reason the
 * import leaves it out, if it does. Pure. The reasons are the importer's own,
 * never re-derived here: a row the plan (lib/woo/plan.ts) will not write
 * carries the plan's reason, and a product the importer does not take by its
 * type says so first, whatever the plan said — the same order the W21-live-2
 * run decides in.
 */

/** Product types the import leaves out, and why. Schema batch B gives a variant an externalId; until then a parent is never half-imported. */
export function wooTypeSkip(type: string): DataSkip | null {
  if (type === "simple") return null;
  if (type === "variable" || type === "grouped") {
    return { code: "variantsNeedBatchB", reason: `a ${type} product is not imported until schema batch B: its variants have no externalId yet` };
  }
  const named = type || "typeless";
  return { code: "typeNotImported", reason: `${/^[aeiou]/i.test(named) ? "an" : "a"} ${named} product is not imported` };
}

/** A plan row the import will not write, with the plan's reason. A `skip` of a row that exists (a local edit) counts as imported and never reads this; one deleted here is why it is not imported. */
const PLAN_SKIPS: readonly WooPlanItem["action"][] = ["conflict", "orphan", "blocked", "skip"];
const planSkip = (item: WooPlanItem | undefined): DataSkip | null =>
  item && PLAN_SKIPS.includes(item.action) ? { code: item.action, reason: item.reason ?? item.action } : null;

export function wooDataSource(snapshot: WooSnapshot, plan: WooPlan): DataCountsInput["source"] {
  const byId = (items: WooPlanItem[]) => new Map(items.map((i) => [i.externalId, i]));
  const categoryPlan = byId(plan.categories);
  const productPlan = byId(plan.products);
  const row = (externalId: string, skip: DataSkip | null): DataSourceRow => (skip ? { externalId, skip } : { externalId });
  const { categories, products } = snapshot.meta;
  return {
    categories: {
      complete: categories.complete,
      total: categories.total,
      rows: snapshot.categories.map((c) => row(String(c.id), planSkip(categoryPlan.get(String(c.id))))),
    },
    products: {
      complete: products.complete,
      total: products.total,
      rows: snapshot.products.map((p) => row(String(p.id), wooTypeSkip(p.type) ?? planSkip(productPlan.get(String(p.id))))),
    },
  };
}
