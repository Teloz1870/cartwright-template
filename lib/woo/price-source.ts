import type { PriceSourceList, PriceSourceRow } from "@/lib/migration/checks/data-prices";
import { wooTypeSkip } from "@/lib/woo/counts";
import { htmlDecoder, mapProduct, mapWooCatalog } from "@/lib/woo/map-catalog";
import { sourceVerdicts, type WooPolicy } from "@/lib/woo/plan";
import type { WooSnapshot, WooStoreProduct } from "@/lib/woo/types";

/**
 * MIGD-5b — the shop's side of `data.prices` (lib/migration/checks/data-prices.ts):
 * every simple product the snapshot lists, priced as the IMPORTER prices it.
 * Nothing is re-derived here: the price is `mapWooCatalog`'s (the mapping a
 * run writes), the regular price goes through the same `mapProduct` scaling,
 * and a price the import holds back carries the plan's own L2 verdict
 * (`sourceVerdicts`: another currency, or a tax basis that is unstated or
 * differs). A product that is not simple is not imported (data.counts says so)
 * and is left out. Async only because the importer's HTML decoder is loaded
 * on first use; it reads and writes nothing.
 */

/** A price in øre as the importer scales it, null when it would write none. Text fields are not read, so no decoding is needed. */
const asImported = (product: WooStoreProduct, price: string): number | null =>
  mapProduct({ ...product, prices: { ...product.prices, price } }, { categoryPermalinks: new Map(), decode: (t) => t }, []).priceDkk;

export async function wooPriceSource(snapshot: WooSnapshot, policy: WooPolicy): Promise<PriceSourceList> {
  const mapped = mapWooCatalog(snapshot, await htmlDecoder());
  const verdicts = sourceVerdicts(snapshot, mapped, policy).products;
  const priceOf = new Map(mapped.products.map((p) => [p.externalId, p.priceDkk]));
  const rows = snapshot.products.flatMap((product): PriceSourceRow[] => {
    if (wooTypeSkip(product.type)) return [];
    const externalId = String(product.id);
    const priceDkk = priceOf.get(externalId) ?? null;
    const regular = asImported(product, product.prices.regular_price);
    const verdict = verdicts.get(externalId);
    const held = verdict?.action === "blocked" ? { code: verdict.reason.split(":")[0], reason: verdict.reason } : undefined;
    return [{ externalId, priceDkk, regularDkk: regular !== null && regular !== priceDkk ? regular : null, ...(held && { held }) }];
  });
  const { complete, total } = snapshot.meta.products;
  return { complete, total, rows };
}
