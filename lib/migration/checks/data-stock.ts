import { z } from "zod";
import type { StockPolicy } from "@/lib/stock-policy";
import { compareExternalIds, DATA_DIFF_CAP, notInSourceNote, type DataCountsStatus } from "./data";

/**
 * MIGD `data.stock` — did the import sell anything out, or make anything
 * buyable that the shop does not sell? Pure over what the caller read: the
 * shop's simple products imported here, each with the stock policy and count
 * the IMPORTER plans from wc/v3's facts (BOM2a contract §6.5, `stockPolicyOf`
 * in lib/woo/decide.ts), and this site's imported products (`source =
 * "woocommerce"`, not deleted). Reading the shop is the webshop module's
 * (lib/woo, through lib/tools/packs/commerce.ts): nothing here imports it.
 *
 * Redefined from "every product has an exact figure" (DRØM159 (ii), the main
 * session's decision of 2026-11-28 under owner decision E2): a product Woo does
 * not count (`untracked`, `unavailable`) has no figure by definition. So every
 * imported product the shop lists is
 *
 *   matched         its policy is Woo's, and a counted policy holds Woo's exact count
 *   policyMismatch  its stockPolicy is not the one Woo's facts give (none set here too)  → fail
 *   stockDiffers    a counted policy (tracked, backorder) whose stock is not Woo's        → fail
 *   stockClamped    Woo counts below zero and the import stored 0, as it does (§7.5)    → warn
 *   notCompared     Woo's facts say no policy (the importer refuses them), in its words → inconclusive
 *
 * `untracked` and `unavailable` need no figure: their stock is not read. A
 * negative Woo count stored as 0 is never a pass, so the board can not read
 * green while a backorder's sold-past-zero count is lost here. An imported
 * product the shop does not list is counted, not judged (data.counts fails
 * it); a list that is incomplete is `inconclusive` unless a difference already
 * fails it. A pass needs at least one product compared.
 */

export type StockSourceRow =
  | { externalId: string; policy: StockPolicy; /** Woo's count for a counted policy; null for one Woo does not count. */ count: number | null }
  | { externalId: string; /** Why the importer records no policy: `code` is its refusal code. */ refused: { code: string; reason: string } };
export type StockSourceList = {
  complete: boolean;
  total: number | null;
  /** The simple products the shop lists, imported here or not: `rows` holds only the imported ones, so this alone tells "nothing to move" from "nothing imported yet". */
  listed: number;
  rows: StockSourceRow[];
};
export type ImportedStock = { externalId: string; stock: number; stockPolicy: string | null };
export type DataStockInput = { source: StockSourceList; imported: readonly ImportedStock[] };

const count = z.number().int().nonnegative();
const value = z.union([z.string(), z.number().int()]).nullable();
const DIFFS = ["policyMismatch", "stockDiffers", "notCompared", "stockClamped"] as const;
type DiffKind = (typeof DIFFS)[number];
const diff = z.object({
  externalId: z.string(),
  diff: z.enum(DIFFS),
  /** The field compared: the policy, or the count a counted policy keeps. */
  field: z.enum(["stockPolicy", "stock"]),
  /** Woo's value and this site's; null when that side has none. */
  source: value,
  here: value,
  code: z.string().optional(),
  reason: z.string(),
}).strict();

/** What a data.stock run keeps in `MigrationCheckRun.summary` and the tool returns. */
export const dataStockSummarySchema = z.object({
  status: z.enum(["pass", "warn", "fail", "inconclusive", "skip"]),
  /** The shop's `X-WP-Total` for products; null when it sent none or the shop was not read. */
  sourceTotal: count.nullable(),
  /** The shop's simple products imported here that were read, and this site's imported products. */
  source: count,
  imported: count,
  compared: count,
  matched: count,
  policyMismatch: count,
  stockDiffers: count,
  stockClamped: count,
  notCompared: count,
  /** Imported products the shop's list does not hold: data.counts' to judge, not this check's. */
  notInSource: count,
  /** The compared products per policy Woo's facts give. */
  policies: z.record(z.string(), count),
  /** Why products were not compared, per importer refusal code. */
  held: z.record(z.string(), count),
  diffs: z.object({ count, first: z.array(diff) }).strict(),
  detail: z.string().optional(),
}).strict();

export type DataStockSummary = z.infer<typeof dataStockSummarySchema>;
type DataStockDiff = z.infer<typeof diff>;

const ORDER = ["fail", "inconclusive", "warn"] as const;
const worst = (statuses: DataCountsStatus[]): DataCountsStatus => ORDER.find((s) => statuses.includes(s)) ?? "pass";
const zero = { compared: 0, matched: 0, policyMismatch: 0, stockDiffers: 0, stockClamped: 0, notCompared: 0, notInSource: 0 };

/** The count a counted policy must hold here, and the diff when it does not — or null when it does. */
function countDiff(externalId: string, woo: number, here: number): DataStockDiff | null {
  if (woo < 0) {
    // The import creates a count below zero as 0 (lib/woo/decide.ts, spec §7.5): a warn of its own, never a pass.
    if (here === 0) return { externalId, diff: "stockClamped", field: "stock", source: woo, here, code: "stockClamped", reason: `Woo counts ${woo} (sold past zero), and the import stored it as 0` };
    return { externalId, diff: "stockDiffers", field: "stock", source: woo, here, reason: `Woo counts ${woo} (sold past zero), which the import stores as 0, and here it is ${here}` };
  }
  if (here === woo) return null;
  const by = here - woo;
  return { externalId, diff: "stockDiffers", field: "stock", source: woo, here, reason: `${Math.abs(by)} ${by > 0 ? "above" : "below"} Woo's count` };
}

export function judgeDataStock({ source, imported }: DataStockInput): DataStockSummary {
  const bySource = new Map(source.rows.map((r) => [r.externalId, r]));
  const k = { ...zero };
  const policies: Record<string, number> = {};
  const held: Record<string, number> = {};
  const diffs: DataStockDiff[] = [];
  const add = (row: DataStockDiff) => {
    k[row.diff]++;
    diffs.push(row);
  };
  for (const here of imported) {
    const shop = bySource.get(here.externalId);
    if (!shop) {
      k.notInSource++;
      continue;
    }
    if ("refused" in shop) {
      held[shop.refused.code] = (held[shop.refused.code] ?? 0) + 1;
      add({ externalId: here.externalId, diff: "notCompared", field: "stockPolicy", source: null, here: here.stockPolicy, code: shop.refused.code, reason: shop.refused.reason });
      continue;
    }
    k.compared++;
    policies[shop.policy] = (policies[shop.policy] ?? 0) + 1;
    const before = diffs.length;
    if (here.stockPolicy !== shop.policy) {
      const reason = here.stockPolicy === null
        ? `no stock policy is set here, and Woo's facts say ${shop.policy}`
        : `Woo's facts say ${shop.policy}, and here it is ${here.stockPolicy}`;
      add({ externalId: here.externalId, diff: "policyMismatch", field: "stockPolicy", source: shop.policy, here: here.stockPolicy, reason });
    }
    // Only a counted policy has a figure to hold: untracked and unavailable need none.
    const counted = shop.count === null ? null : countDiff(here.externalId, shop.count, here.stock);
    if (counted) add(counted);
    if (diffs.length === before) k.matched++;
  }

  // `rows` is only what is imported here, so an empty `rows` before an import says nothing about the shop: `listed` does.
  const empty = source.complete && source.listed === 0 && imported.length === 0;
  const status: DataStockSummary["status"] = empty ? "skip" : worst([
    ...(k.policyMismatch || k.stockDiffers ? ["fail" as const] : []),
    ...(k.notCompared || !source.complete || k.compared === 0 ? ["inconclusive" as const] : []),
    ...(k.stockClamped ? ["warn" as const] : []),
  ]);
  const rank = Object.fromEntries(DIFFS.map((d, i) => [d, i])) as Record<DiffKind, number>;
  // Within a kind of difference by Woo id, never the order the rows were read in.
  const first = [...diffs].sort((a, b) => rank[a.diff] - rank[b.diff] || compareExternalIds(a.externalId, b.externalId)).slice(0, DATA_DIFF_CAP);
  return {
    status, sourceTotal: source.total, source: source.rows.length, imported: imported.length, ...k, policies, held,
    diffs: { count: diffs.length, first },
    ...(status === "pass" ? {} : { detail: describe(status, source, k) }),
  };
}

/** One line for the board: what was compared and what is wrong. */
function describe(status: DataStockSummary["status"], source: StockSourceList, k: typeof zero): string {
  if (status === "skip") return "The shop lists no simple product and none is imported: there is no stock to compare.";
  const parts = [`${k.matched} of ${k.compared} compared products keep Woo's stock policy and count`];
  if (k.policyMismatch) parts.push(`${k.policyMismatch} have another stock policy than Woo's facts give`);
  if (k.stockDiffers) parts.push(`${k.stockDiffers} hold another count than Woo's`);
  if (k.stockClamped) parts.push(`${k.stockClamped} counted below zero in Woo are stored as 0 here`);
  if (k.notCompared) parts.push(`${k.notCompared} whose stock facts the import refuses were not compared`);
  if (!source.complete) parts.push(`the shop's product list came back incomplete (it lists ${source.total ?? "an unknown number of"} products), so the products not read were not compared`);
  else if (k.compared === 0 && !k.notCompared) parts.push(notInSourceNote(k.notInSource));
  return `${parts.join("; ")}.`;
}

/** The shop's stock could not be read (no key, a refused key, a failed read): nothing is compared, and the run counts as not ready. */
export function unreadableStock(detail: string, imported: number): DataStockSummary {
  return { status: "inconclusive", sourceTotal: null, source: 0, imported, ...zero, policies: {}, held: {}, diffs: { count: 0, first: [] }, detail };
}
