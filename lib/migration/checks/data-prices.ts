import { z } from "zod";
import { compareExternalIds, DATA_DIFF_CAP, notInSourceNote, type DataCountsStatus } from "./data";

/**
 * MIGD `data.prices` — did the import misprice a product? Pure over what the
 * caller read: the shop's simple products with their prices as the IMPORTER
 * maps them (øre, from the Store API's minor units; lib/woo/price-source.ts),
 * and this site's imported products (`source = "woocommerce"`, not deleted).
 * Reading the shop is the webshop module's (lib/woo, through
 * lib/tools/packs/commerce.ts): nothing here imports it.
 *
 * Prices are never converted, so the tax basis the owner stated on the last
 * migration.woo_plan (`sourcePricesIncludeVat`) has to equal this shop's
 * (`pricesIncludeVat`) before any price can be held against the shop's:
 * unstated or different, the run is `inconclusive` and says so, never a pass.
 *
 * Every imported product the shop lists is, per field:
 *
 *   matched               its price, and its before-price, equal the shop's to the øre
 *   mispriced             priceDkk differs from the shop's price by any amount          → fail
 *   compareAtDiffers      a compareAtDkk is set here and the shop shows another          → fail
 *                         before-price (or none)
 *   compareAtNotImported  the shop has a sale (regular ≠ price) and no compareAtDkk is   → warn
 *                         set here: mapping v2 does not import it (lib/woo/map-catalog.ts)
 *   notCompared           the import holds its price back (no usable price, another     → inconclusive
 *                         currency), in the importer's words
 *
 * so the board can never read green while a sale's before-price is missing
 * here. An imported product the shop does not list is counted, not judged
 * (data.counts fails it); a list that is incomplete is `inconclusive` unless
 * a difference already fails it. A pass needs at least one product compared.
 */

export type PriceSourceRow = {
  externalId: string;
  /** The price the import writes, in øre; null when the shop sends no usable one. */
  priceDkk: number | null;
  /** The shop's regular price in øre when it differs from `priceDkk` (a sale); else null. */
  regularDkk: number | null;
  /** Why the import holds this product's price back — `code` is the importer's reason code. */
  held?: { code: string; reason: string };
};
export type PriceSourceList = { complete: boolean; total: number | null; rows: PriceSourceRow[] };
export type ImportedPrice = { externalId: string; priceDkk: number; compareAtDkk: number | null };
export type DataPricesInput = {
  source: PriceSourceList;
  imported: readonly ImportedPrice[];
  /** `sourcePricesIncludeVat` as the owner stated it on the last plan (undefined = unstated), and this shop's. */
  taxBasis: { sourcePricesIncludeVat?: boolean; pricesIncludeVat: boolean };
};

const count = z.number().int().nonnegative();
const DIFFS = ["mispriced", "compareAtDiffers", "notCompared", "compareAtNotImported"] as const;
type DiffKind = (typeof DIFFS)[number];
const diff = z.object({
  externalId: z.string(),
  diff: z.enum(DIFFS),
  /** The field compared: priceDkk, or compareAtDkk against the shop's regular price. */
  field: z.enum(["priceDkk", "compareAtDkk"]),
  /** The shop's value and this site's, in øre; null when that side has none. */
  source: z.number().int().nullable(),
  here: z.number().int().nullable(),
  code: z.string().optional(),
  reason: z.string(),
}).strict();

/** What a data.prices run keeps in `MigrationCheckRun.summary` and the tool returns. */
export const dataPricesSummarySchema = z.object({
  status: z.enum(["pass", "warn", "fail", "inconclusive", "skip"]),
  /** The shop's `X-WP-Total` for products; null when it sent none or the shop was not read. */
  sourceTotal: count.nullable(),
  /** The shop's simple products read, and this site's imported products. */
  source: count,
  imported: count,
  compared: count,
  matched: count,
  mispriced: count,
  compareAtDiffers: count,
  compareAtNotImported: count,
  notCompared: count,
  /** Imported products the shop's list does not hold: data.counts' to judge, not this check's. */
  notInSource: count,
  /** Why prices were not compared, per importer reason code. */
  held: z.record(z.string(), count),
  diffs: z.object({ count, first: z.array(diff) }).strict(),
  detail: z.string().optional(),
}).strict();

export type DataPricesSummary = z.infer<typeof dataPricesSummarySchema>;
type DataPriceDiff = z.infer<typeof diff>;

const ORDER = ["fail", "inconclusive", "warn"] as const;
const worst = (statuses: DataCountsStatus[]): DataCountsStatus => ORDER.find((s) => statuses.includes(s)) ?? "pass";
const vat = (incl: boolean) => (incl ? "include VAT" : "exclude VAT");

const zero = { compared: 0, matched: 0, mispriced: 0, compareAtDiffers: 0, compareAtNotImported: 0, notCompared: 0, notInSource: 0 };

/** Why no price can be compared on this tax basis, or null when it can. */
function taxBasisBlocks({ sourcePricesIncludeVat, pricesIncludeVat }: DataPricesInput["taxBasis"]): string | null {
  if (sourcePricesIncludeVat === undefined) {
    return "Nobody has said whether the shop's prices include VAT: run migration.woo_plan with sourcePricesIncludeVat, then this check. No price was compared.";
  }
  if (sourcePricesIncludeVat !== pricesIncludeVat) {
    return `The shop's prices ${vat(sourcePricesIncludeVat)}, this shop's ${vat(pricesIncludeVat)}, and prices are never converted: no price was compared.`;
  }
  return null;
}

export function judgeDataPrices({ source, imported, taxBasis }: DataPricesInput): DataPricesSummary {
  const head = { sourceTotal: source.total, source: source.rows.length, imported: imported.length };
  const blocked = taxBasisBlocks(taxBasis);
  if (blocked) return { status: "inconclusive", ...head, ...zero, held: {}, diffs: { count: 0, first: [] }, detail: blocked };

  const bySource = new Map(source.rows.map((r) => [r.externalId, r]));
  const k = { ...zero };
  const held: Record<string, number> = {};
  const diffs: DataPriceDiff[] = [];
  const add = (row: DataPriceDiff) => {
    k[row.diff]++;
    diffs.push(row);
  };
  for (const here of imported) {
    const shop = bySource.get(here.externalId);
    if (!shop) {
      k.notInSource++;
      continue;
    }
    if (shop.held || shop.priceDkk === null) {
      const why = shop.held ?? { code: "noPrice", reason: "the shop sends no usable price, and the import writes none" };
      held[why.code] = (held[why.code] ?? 0) + 1;
      add({ externalId: here.externalId, diff: "notCompared", field: "priceDkk", source: shop.priceDkk, here: here.priceDkk, code: why.code, reason: why.reason });
      continue;
    }
    k.compared++;
    const before = diffs.length;
    if (here.priceDkk !== shop.priceDkk) {
      const by = here.priceDkk - shop.priceDkk;
      add({ externalId: here.externalId, diff: "mispriced", field: "priceDkk", source: shop.priceDkk, here: here.priceDkk, reason: `${Math.abs(by)} øre ${by > 0 ? "above" : "below"} the shop's price` });
    }
    if (here.compareAtDkk !== null && here.compareAtDkk !== shop.regularDkk) {
      const reason = shop.regularDkk === null
        ? "a before-price is set here, and the shop shows none"
        : `the before-price here is not the shop's regular price (${shop.regularDkk} øre)`;
      add({ externalId: here.externalId, diff: "compareAtDiffers", field: "compareAtDkk", source: shop.regularDkk, here: here.compareAtDkk, reason });
    } else if (here.compareAtDkk === null && shop.regularDkk !== null) {
      add({
        externalId: here.externalId, diff: "compareAtNotImported", field: "compareAtDkk", source: shop.regularDkk, here: null,
        reason: "on sale in the shop; the import does not bring the before-price (compareAtDkk) over yet, so the sale shows here as a plain price",
      });
    }
    if (diffs.length === before) k.matched++;
  }

  const empty = source.complete && source.rows.length === 0 && imported.length === 0;
  const status: DataPricesSummary["status"] = empty ? "skip" : worst([
    ...(k.mispriced || k.compareAtDiffers ? ["fail" as const] : []),
    ...(k.notCompared || !source.complete || k.compared === 0 ? ["inconclusive" as const] : []),
    ...(k.compareAtNotImported ? ["warn" as const] : []),
  ]);
  const rank = Object.fromEntries(DIFFS.map((d, i) => [d, i])) as Record<DiffKind, number>;
  // Within a kind of difference by Woo id, never the order the rows were read in.
  const first = [...diffs].sort((a, b) => rank[a.diff] - rank[b.diff] || compareExternalIds(a.externalId, b.externalId)).slice(0, DATA_DIFF_CAP);
  return { status, ...head, ...k, held, diffs: { count: diffs.length, first }, ...(status === "pass" ? {} : { detail: describe(status, source, k) }) };
}

/** One line for the board: what was compared and what is wrong. */
function describe(status: DataPricesSummary["status"], source: PriceSourceList, k: typeof zero): string {
  if (status === "skip") return "The shop lists no simple product and none is imported: there is no price to compare.";
  const parts = [`${k.matched} of ${k.compared} compared prices match the shop's`];
  if (k.mispriced) parts.push(`${k.mispriced} differ`);
  if (k.compareAtDiffers) parts.push(`${k.compareAtDiffers} show another before-price than the shop`);
  if (k.compareAtNotImported) parts.push(`${k.compareAtNotImported} sale prices lack their before-price here (not imported yet)`);
  if (k.notCompared) parts.push(`${k.notCompared} the import holds back were not compared`);
  if (!source.complete) parts.push(`the shop's product list came back incomplete (it lists ${source.total ?? "an unknown number of"} products), so the products not read were not compared`);
  else if (k.compared === 0 && !k.notCompared) parts.push(notInSourceNote(k.notInSource));
  return `${parts.join("; ")}.`;
}

/** The shop could not be read: nothing is compared, and the run counts as not ready. */
export function unreadablePrices(detail: string, imported: number): DataPricesSummary {
  return { status: "inconclusive", sourceTotal: null, source: 0, imported, ...zero, held: {}, diffs: { count: 0, first: [] }, detail };
}
