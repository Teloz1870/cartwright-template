/**
 * MIGD data checks — the capped first-50 diff list does not depend on the order
 * the rows were read in. The reads behind data.counts, data.prices and
 * data.stock carry no `orderBy`, so Postgres may hand the same unchanged shop's
 * rows back in another order on the next run; the judges tie-break on the Woo id
 * (numeric-aware), so the board lists the same differences each run. Also: a
 * price or stock run whose every imported product is absent from a complete
 * shop list says so, instead of "no imported product to compare yet".
 */
import { describe, expect, it } from "vitest";
import { compareExternalIds, DATA_DIFF_CAP, judgeDataCounts, notInSourceNote, type DataSourceList } from "@/lib/migration/checks/data";
import { judgeDataPrices, type ImportedPrice, type PriceSourceRow } from "@/lib/migration/checks/data-prices";
import { judgeDataStock, type ImportedStock, type StockSourceRow } from "@/lib/migration/checks/data-stock";

/** A seeded Fisher–Yates shuffle: a different read order on every seed, the same one on every run of this test. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Well past the cap, so which rows make the first 50 is decided by the order.
const N = DATA_DIFF_CAP * 3;
const ids = Array.from({ length: N }, (_, i) => String(1000 - i));
const SEEDS = [1, 7, 42, 2026];

describe("compareExternalIds — the tie-break", () => {
  it("sorts Woo's numeric ids as numbers, past Number's precision, before any other id, which sorts by code unit", () => {
    const sorted = ["10", "a2", "9", "100", "B", "2", "12345678901234567890", "12345678901234567889", "a10"].sort(compareExternalIds);
    expect(sorted).toEqual(["2", "9", "10", "100", "12345678901234567889", "12345678901234567890", "B", "a10", "a2"]);
  });

  it("is antisymmetric and 0 only on the same id", () => {
    for (const [a, b] of [["9", "10"], ["7", "x"], ["a", "b"]]) {
      expect(Math.sign(compareExternalIds(a, b))).toBe(-Math.sign(compareExternalIds(b, a)));
      expect(compareExternalIds(a, b)).not.toBe(0);
    }
    expect(compareExternalIds("42", "42")).toBe(0);
  });
});

describe("data.counts — the same first list whatever order the rows are read in", () => {
  const products: DataSourceList = {
    complete: true,
    total: N,
    rows: ids.map((externalId, i) => (i % 3 === 0 ? { externalId, skip: { code: "conflict", reason: "slug taken" } } : { externalId })),
  };
  const categories: DataSourceList = { complete: true, total: 20, rows: ids.slice(0, 20).map((externalId) => ({ externalId })) };
  const extra = Array.from({ length: 30 }, (_, i) => `9${i}`);
  const judge = (seed: number) => judgeDataCounts({
    source: {
      categories: { ...categories, rows: shuffled(categories.rows, seed) },
      products: { ...products, rows: shuffled(products.rows, seed + 1) },
    },
    imported: { categories: shuffled(extra, seed + 2), products: shuffled(extra, seed + 3) },
  });

  it("is identical across shuffled reads", () => {
    const base = judge(0).diffs.first;
    expect(base).toHaveLength(DATA_DIFF_CAP);
    for (const seed of SEEDS) expect(judge(seed).diffs.first).toEqual(base);
  });

  it("orders by kind of difference, then categories before products, then by Woo id as a number", () => {
    const first = judge(3).diffs.first;
    const missingCategories = first.filter((d) => d.diff === "missing" && d.kind === "categories").map((d) => d.externalId);
    expect(missingCategories).toEqual(ids.slice(0, 20).map(Number).sort((a, b) => a - b).map(String));
    expect(first.slice(0, 20).every((d) => d.kind === "categories" && d.diff === "missing")).toBe(true);
    expect(first[20]).toMatchObject({ kind: "products", diff: "missing", externalId: "851" });
  });
});

describe("data.prices — the same first list whatever order the rows are read in", () => {
  const source: PriceSourceRow[] = ids.map((externalId) => ({ externalId, priceDkk: 100, regularDkk: Number(externalId) % 2 ? 200 : null }));
  const imported: ImportedPrice[] = ids.map((externalId) => ({ externalId, priceDkk: Number(externalId) % 5 ? 101 : 100, compareAtDkk: null }));
  const judge = (seed: number) => judgeDataPrices({
    source: { complete: true, total: N, rows: shuffled(source, seed) },
    imported: shuffled(imported, seed + 1),
    taxBasis: { sourcePricesIncludeVat: true, pricesIncludeVat: true },
  });

  it("is identical across shuffled reads, failures first and then by Woo id", () => {
    const base = judge(0).diffs.first;
    expect(base).toHaveLength(DATA_DIFF_CAP);
    for (const seed of SEEDS) expect(judge(seed).diffs.first).toEqual(base);
    expect(base.every((d) => d.diff === "mispriced")).toBe(true);
    const order = base.map((d) => Number(d.externalId));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("data.stock — the same first list whatever order the rows are read in", () => {
  const source: StockSourceRow[] = ids.map((externalId) => ({ externalId, policy: "tracked", count: Number(externalId) % 4 ? 5 : -2 }));
  const imported: ImportedStock[] = ids.map((externalId) => ({ externalId, stock: Number(externalId) % 3 ? 0 : 5, stockPolicy: "tracked" }));
  const judge = (seed: number) => judgeDataStock({ source: { complete: true, total: N, listed: N, rows: shuffled(source, seed) }, imported: shuffled(imported, seed + 1) });

  it("is identical across shuffled reads, failures first and then by Woo id", () => {
    const base = judge(0).diffs.first;
    expect(base).toHaveLength(DATA_DIFF_CAP);
    for (const seed of SEEDS) expect(judge(seed).diffs.first).toEqual(base);
    expect(base.every((d) => d.diff === "stockDiffers")).toBe(true);
    const order = base.map((d) => Number(d.externalId));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("a complete list that holds none of the imported products says so", () => {
  const INCL = { sourcePricesIncludeVat: true, pricesIncludeVat: true };

  it("data.prices names them and points at data.counts — never “no imported product” while some are", () => {
    const r = judgeDataPrices({ source: { complete: true, total: 1, rows: [{ externalId: "1", priceDkk: 100, regularDkk: null }] }, imported: [
      { externalId: "8", priceDkk: 1, compareAtDkk: null }, { externalId: "9", priceDkk: 1, compareAtDkk: null },
    ], taxBasis: INCL });
    expect(r).toMatchObject({ status: "inconclusive", compared: 0, notInSource: 2, imported: 2 });
    expect(r.detail).toBe("0 of 0 compared prices match the shop's; 2 imported products are not in the shop's list; see data.counts.");
    expect(judgeDataPrices({ source: { complete: true, total: 1, rows: [{ externalId: "1", priceDkk: 100, regularDkk: null }] }, imported: [], taxBasis: INCL }).detail)
      .toContain("no imported product to compare yet");
  });

  it("data.stock names them the same way, one product in the singular", () => {
    const r = judgeDataStock({ source: { complete: true, total: 0, listed: 0, rows: [] }, imported: [{ externalId: "9", stock: 0, stockPolicy: "tracked" }] });
    expect(r).toMatchObject({ status: "inconclusive", compared: 0, notInSource: 1 });
    expect(r.detail).toBe("0 of 0 compared products keep Woo's stock policy and count; 1 imported product is not in the shop's list; see data.counts.");
  });

  it("the note itself: none, one, many", () => {
    expect([0, 1, 3].map(notInSourceNote)).toEqual([
      "no imported product to compare yet",
      "1 imported product is not in the shop's list; see data.counts",
      "3 imported products are not in the shop's list; see data.counts",
    ]);
  });
});
