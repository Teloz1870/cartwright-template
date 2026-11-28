import type { StockSourceList, StockSourceRow } from "@/lib/migration/checks/data-stock";
import { wooTypeSkip } from "@/lib/woo/counts";
import { stockPolicyOf } from "@/lib/woo/decide";
import type { WooSnapshot, WooStock } from "@/lib/woo/types";

/**
 * MIGD-5c — the shop's side of `data.stock` (lib/migration/checks/data-stock.ts):
 * for each simple product the snapshot lists AND this site imported, the stock
 * policy and count as the IMPORTER plans them. Nothing is re-derived here: the
 * policy is `stockPolicyOf`'s (BOM2a contract §6.5's table, the one a create
 * writes), read from wc/v3's facts through `stockOf` (keyed, GETs only, and it
 * throws rather than read an id it got no answer for as "no stock"). A product
 * that is not simple is not imported (data.counts says so) and is left out, and
 * so is one not imported here: its stock is never asked for.
 */

export type StockOf = (ids: readonly number[]) => Promise<ReadonlyMap<string, WooStock>>;

export async function wooStockSource(snapshot: WooSnapshot, imported: ReadonlySet<string>, stockOf: StockOf): Promise<StockSourceList> {
  const simple = snapshot.products.filter((p) => !wooTypeSkip(p.type));
  const asked = simple.filter((p) => imported.has(String(p.id)));
  const stock = await stockOf(asked.map((p) => p.id));
  const rows = asked.map((product): StockSourceRow => {
    const externalId = String(product.id);
    const plan = stockPolicyOf(stock.get(externalId));
    if ("refused" in plan) return { externalId, refused: { code: plan.refused, reason: `${plan.refused}: ${plan.detail}` } };
    return { externalId, policy: plan.policy, count: plan.count };
  });
  const { complete, total } = snapshot.meta.products;
  return { complete, total, listed: simple.length, rows };
}
