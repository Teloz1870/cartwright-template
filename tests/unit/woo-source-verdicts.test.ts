import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { decide, type WooSrc } from "@/lib/woo/decide";
import { WOO_SOURCE, htmlDecoder, mapWooCatalog, type HtmlDecode, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import { planWooCatalog, sourceVerdicts, type WooPolicy } from "@/lib/woo/plan";
import type { WooSnapshot } from "@/lib/woo/types";
import { WooView, type WooDbRow, type WooDbState } from "@/lib/woo/view";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-2a-1b — L2, what the source alone says (`sourceVerdicts`), and the
 * dry run on the importer's one verdict: the plan holds no verdict of its own,
 * so the verdict it shows is the one a write will run (W21-live-2 spec
 * 2026-10-25 §3D, §3E, INV-16, INV-23).
 */

vi.mock("@/lib/woo/decide", async (orig) => {
  const actual = await orig<typeof import("@/lib/woo/decide")>();
  return { ...actual, decide: vi.fn(actual.decide) };
});

let decode: HtmlDecode;
beforeAll(async () => {
  decode = await htmlDecoder();
});
afterEach(() => {
  vi.mocked(decide).mockReset(); // back to the real decide
});

const DKK: WooPolicy = { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true };
const LINK = "https://shop.example.test";

/** The fixture shop with every product simple and priced: 101 under 11, 102 under 10, 103 under 20. */
function shop(): WooSnapshot {
  const snap = wooSnapshot();
  for (const p of snap.products) {
    p.type = "simple";
    p.prices.price ||= "12500";
  }
  return snap;
}
const product = (s: WooSnapshot, id: number) => {
  const row = s.products.find((p) => p.id === id);
  if (!row) throw new Error(`no product ${id}`);
  return row;
};
const category = (s: WooSnapshot, id: number) => {
  const row = s.categories.find((c) => c.id === id);
  if (!row) throw new Error(`no category ${id}`);
  return row;
};
const addCategory = (s: WooSnapshot, id: number, parent: number, permalink = `${LINK}/c-${id}/`) => s.categories.push({ id, name: `C ${id}`, slug: `c-${id}`, parent, permalink });
const fileUnder = (s: WooSnapshot, id: number, categoryId: number) => {
  product(s, id).categories = [{ id: categoryId, slug: `c-${categoryId}` }];
};

function verdicts(snap: WooSnapshot, policy: WooPolicy = DKK) {
  return sourceVerdicts(snap, mapWooCatalog(snap, decode), policy);
}

describe("sourceVerdicts — a product's price, and nothing else, can be blocked", () => {
  const eur = (s: WooSnapshot) => {
    product(s, 101).prices.currency_code = "EUR";
  };
  const noCurrency = (s: WooSnapshot) => {
    Object.assign(product(s, 101).prices, { currency_code: undefined });
  };
  it.each<[string, (s: WooSnapshot) => void, WooPolicy, string | undefined]>([
    ["priced in another currency", eur, DKK, "currencyMismatch: priced in EUR, this shop sells in DKK"],
    ["priced in no currency", noCurrency, DKK, "currencyMismatch: priced in no currency, this shop sells in DKK"],
    ["nobody has said what the prices include", () => {}, { currency: "DKK", pricesIncludeVat: true }, "taxBasisUnknown: nobody has said whether the shop's prices include VAT (sourcePricesIncludeVat)"],
    ["the shop's exclude VAT, this shop's include it", () => {}, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: false }, "taxBasisMismatch: the shop's prices exclude VAT, this shop's include it"],
    ["the shop's include VAT, this shop's exclude it", () => {}, { currency: "DKK", pricesIncludeVat: false, sourcePricesIncludeVat: true }, "taxBasisMismatch: the shop's prices include VAT, this shop's exclude it"],
    ["both exclude VAT", () => {}, { currency: "DKK", pricesIncludeVat: false, sourcePricesIncludeVat: false }, undefined],
    ["both include VAT, in this shop's currency", () => {}, DKK, undefined],
  ])("%s", (_label, edit, policy, reason) => {
    const snap = shop();
    edit(snap);
    const v = verdicts(snap, policy);
    expect(v.products.get("101")).toEqual(reason ? { action: "blocked", reason } : undefined);
    expect(v.categories.size).toBe(0); // a category carries no price
  });

  it("a currency is held against each product alone; a tax basis against all of them", () => {
    const snap = shop();
    eur(snap);
    const v = verdicts(snap);
    expect(v.products.get("101")?.action).toBe("blocked");
    expect(v.products.get("102")).toBeUndefined();
    expect([...verdicts(shop(), { currency: "DKK", pricesIncludeVat: true }).products.keys()]).toEqual(["101", "102", "103"]);
  });

  it("says each once for the shop, for the plan's snapshot warnings: every other currency, and the basis", () => {
    expect(verdicts(shop()).warnings).toEqual([]);
    const snap = shop();
    product(snap, 101).prices.currency_code = "EUR";
    product(snap, 102).prices.currency_code = "SEK";
    product(snap, 103).prices.currency_code = "EUR";
    expect(verdicts(snap).warnings).toEqual(["The shop prices in EUR, SEK, this shop in DKK: no product is planned, and prices are never converted"]);
    expect(verdicts(shop(), { currency: "DKK", pricesIncludeVat: true }).warnings).toEqual(["Nobody has said whether the shop's prices include VAT (sourcePricesIncludeVat): no product is planned, and prices are never converted"]);
    expect(verdicts(shop(), { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: false }).warnings).toEqual(["The shop's prices exclude VAT, this shop's include it: no product is planned, and prices are never converted"]);
  });
});

describe("sourceVerdicts — a row with no place in the source's tree is an orphan", () => {
  it.each<[string, (s: WooSnapshot) => void, "category" | "product", string, string | undefined]>([
    ["a product with no category", (s) => void (product(s, 101).categories = []), "product", "101", "it has no category"],
    ["a product under a category the source does not send", (s) => fileUnder(s, 101, 88), "product", "101", "its category 88 is not in the source"],
    ["a product under a category that is an orphan", (s) => {
      addCategory(s, 30, 77);
      fileUnder(s, 101, 30);
    }, "product", "101", "its category 30 is an orphan"],
    ["a product under a category inside a loop", (s) => {
      addCategory(s, 40, 41);
      addCategory(s, 41, 40);
      fileUnder(s, 101, 41);
    }, "product", "101", "its category 41 is an orphan"],
    ["a product under a category in the source's tree", () => {}, "product", "101", undefined],
    ["a category whose parent is not in the source (a broken chain)", (s) => addCategory(s, 30, 77), "category", "30", "parent 77 is not in the source"],
    ["a category under an orphan inherits", (s) => {
      addCategory(s, 30, 77);
      addCategory(s, 31, 30);
    }, "category", "31", "parent 30 is an orphan"],
    ["…and the level below that", (s) => {
      addCategory(s, 30, 77);
      addCategory(s, 31, 30);
      addCategory(s, 32, 31);
    }, "category", "32", "parent 31 is an orphan"],
    ["…listed before its parent, as the Store API may", (s) => {
      addCategory(s, 32, 31);
      addCategory(s, 31, 30);
      addCategory(s, 30, 77);
    }, "category", "32", "parent 31 is an orphan"],
    ["a loop of two", (s) => {
      addCategory(s, 40, 41);
      addCategory(s, 41, 40);
    }, "category", "40", "its parent chain loops or runs deeper than the tree cap"],
    ["its own parent", (s) => addCategory(s, 40, 40), "category", "40", "its parent chain loops or runs deeper than the tree cap"],
    ["a row under a loop, itself in no loop", (s) => {
      addCategory(s, 40, 41);
      addCategory(s, 41, 40);
      addCategory(s, 42, 41);
    }, "category", "42", "its parent chain loops or runs deeper than the tree cap"],
    ["a root beside a loop", (s) => {
      addCategory(s, 40, 41);
      addCategory(s, 41, 40);
    }, "category", "10", undefined],
    ["a child of a healthy parent", () => {}, "category", "12", undefined],
  ])("%s", (_label, edit, kind, id, reason) => {
    const snap = shop();
    edit(snap);
    const v = verdicts(snap);
    expect((kind === "category" ? v.categories : v.products).get(id)).toEqual(reason ? { action: "orphan", reason } : undefined);
  });

  it("a chain past the tree cap: the row within it stands, the row past it is an orphan", () => {
    const snap = shop();
    for (let i = 0; i < 13; i++) addCategory(snap, 50 + i, i ? 49 + i : 0); // 50 is a root; 62 has 12 ancestors
    const v = verdicts(snap);
    expect(v.categories.get("60")).toBeUndefined(); // 10 ancestors: the cap
    expect(v.categories.get("61")).toEqual({ action: "orphan", reason: "its parent chain loops or runs deeper than the tree cap" });
    expect(v.categories.get("62")?.action).toBe("orphan");
  });
});

describe("sourceVerdicts — a key two source rows share is a conflict on BOTH rows", () => {
  const twins = (s: WooSnapshot, a: "category" | "product", idA: string, b: "category" | "product", idB: string) => {
    const v = verdicts(s);
    const of = (kind: "category" | "product", id: string) => (kind === "category" ? v.categories : v.products).get(id);
    return [of(a, idA), of(b, idB)];
  };
  it.each<[string, (s: WooSnapshot) => void, "category" | "product", string, "category" | "product", string, string]>([
    ["a sku, on two products", (s) => void (product(s, 102).sku = "IDA-1"), "product", "101", "product", "102", 'sku "IDA-1"'],
    ["a slug, on two products", (s) => void (product(s, 102).slug = "bordlampe-ida"), "product", "101", "product", "102", 'slug "bordlampe-ida"'],
    ["a permalink, on two products", (s) => void (product(s, 102).permalink = product(s, 101).permalink), "product", "101", "product", "102", 'permalink "/lamper/bordlamper/bordlampe-ida/"'],
    ["a slug, on two categories", (s) => void (category(s, 20).slug = "lamper"), "category", "10", "category", "20", 'slug "lamper"'],
    ["a permalink, on two categories", (s) => void (category(s, 20).permalink = category(s, 10).permalink), "category", "10", "category", "20", 'permalink "/lamper/"'],
  ])("%s", (_label, edit, kindA, idA, kindB, idB, label) => {
    const snap = shop();
    edit(snap);
    expect(twins(snap, kindA, idA, kindB, idB)).toEqual([
      { action: "conflict", reason: `keyDuplicated: ${label} is also claimed by Woo ${kindB} ${idB}` },
      { action: "conflict", reason: `keyDuplicated: ${label} is also claimed by Woo ${kindA} ${idA}` },
    ]);
  });

  it("a permalink across the two tables, the address being one: a category and a product, even under one Woo id", () => {
    const snap = shop();
    product(snap, 103).id = 20; // Woo numbers terms and posts apart: this product and category 20 are two rows
    product(snap, 20).permalink = category(snap, 20).permalink;
    expect(twins(snap, "category", "20", "product", "20")).toEqual([
      { action: "conflict", reason: expect.stringMatching(/^keyDuplicated: permalink .* is also claimed by Woo product 20$/) },
      { action: "conflict", reason: expect.stringMatching(/^keyDuplicated: permalink .* is also claimed by Woo category 20$/) },
    ]);
  });

  it("the same address in another spelling is the same key: no trailing slash, a letter percent-encoded", () => {
    const snap = shop();
    product(snap, 102).permalink = `${LINK}/lamper/bordlamper/bordlampe-%69da`;
    expect(twins(snap, "product", "101", "product", "102").map((v) => v?.action)).toEqual(["conflict", "conflict"]);
  });

  it("three rows on one key: each is a conflict, and names another", () => {
    const snap = shop();
    for (const id of [102, 103]) product(snap, id).sku = "IDA-1";
    const v = verdicts(snap);
    expect(v.products.get("101")?.reason).toMatch(/also claimed by Woo product 102$/);
    expect(v.products.get("102")?.reason).toMatch(/also claimed by Woo product 101$/);
    expect(v.products.get("103")?.reason).toMatch(/also claimed by Woo product 101$/);
  });

  it("the first of a row's keys two rows share is the one it names", () => {
    const snap = shop();
    product(snap, 102).sku = "IDA-1";
    product(snap, 103).slug = "bordlampe-ida";
    const v = verdicts(snap);
    expect(v.products.get("101")?.reason).toMatch(/^keyDuplicated: slug "bordlampe-ida" is also claimed by Woo product 103$/);
    expect(v.products.get("102")?.reason).toMatch(/^keyDuplicated: sku "IDA-1" is also claimed by Woo product 101$/);
  });

  it("what is no shared key: a slug across the two tables, no sku, no permalink of its own", () => {
    const snap = shop();
    category(snap, 20).slug = "bordlampe-ida"; // a slug is unique per table
    for (const id of [101, 102]) {
      product(snap, id).sku = "";
      product(snap, id).permalink = `${LINK}/?product=${id}`;
    }
    const v = verdicts(snap);
    expect(v.products.size + v.categories.size).toBe(0);
  });

  it("a row a verdict holds back still claims its keys: its twin is a conflict, whatever a policy or a type says of the other", () => {
    const snap = shop();
    product(snap, 102).sku = "IDA-1";
    product(snap, 102).prices.currency_code = "EUR"; // blocked: never written
    expect(twins(snap, "product", "101", "product", "102")).toEqual([
      { action: "conflict", reason: 'keyDuplicated: sku "IDA-1" is also claimed by Woo product 102' },
      { action: "blocked", reason: "currencyMismatch: priced in EUR, this shop sells in DKK" },
    ]);
    const orphan = shop();
    product(orphan, 102).sku = "IDA-1";
    product(orphan, 102).categories = [];
    expect(twins(orphan, "product", "101", "product", "102")).toEqual([
      { action: "conflict", reason: 'keyDuplicated: sku "IDA-1" is also claimed by Woo product 102' },
      { action: "orphan", reason: "it has no category" },
    ]);
    const branch = shop();
    addCategory(branch, 30, 77, product(branch, 101).permalink); // an orphan on the product's address
    expect(twins(branch, "category", "30", "product", "101")).toEqual([
      { action: "orphan", reason: "parent 77 is not in the source" },
      { action: "conflict", reason: expect.stringMatching(/also claimed by Woo category 30$/) },
    ]);
  });

  it("a category's verdict on a key does not move with the policy", () => {
    const snap = shop();
    category(snap, 20).permalink = product(snap, 103).permalink;
    const expected = verdicts(snap).categories.get("20");
    expect(expected?.action).toBe("conflict");
    for (const policy of [{ currency: "DKK", pricesIncludeVat: true }, { currency: "EUR", pricesIncludeVat: true, sourcePricesIncludeVat: true }]) {
      expect(verdicts(snap, policy).categories.get("20")).toEqual(expected);
    }
  });

  it("a row a snapshot lists twice claims its keys twice, so it is written by neither listing", () => {
    const snap = shop();
    snap.categories.push(structuredClone(category(snap, 20)));
    expect(verdicts(snap).categories.get("20")).toEqual({ action: "conflict", reason: expect.stringMatching(/^keyDuplicated: slug "skaerme" is also claimed by Woo category 20$/) });
  });
});

describe("sourceVerdicts — one order, first match wins", () => {
  it("blocked over orphan over conflict, on a product", () => {
    const snap = shop();
    product(snap, 102).sku = "IDA-1"; // a key it shares with 101
    product(snap, 101).categories = []; // and no category
    const held = verdicts(snap, { currency: "DKK", pricesIncludeVat: true });
    expect(held.products.get("101")?.reason).toMatch(/^taxBasisUnknown/);
    product(snap, 101).prices.currency_code = "EUR";
    expect(verdicts(snap, { currency: "DKK", pricesIncludeVat: true }).products.get("101")?.reason).toMatch(/^currencyMismatch/); // a currency over a tax basis
    expect(verdicts(snap).products.get("101")?.reason).toMatch(/^currencyMismatch/);
    product(snap, 101).prices.currency_code = "DKK";
    expect(verdicts(snap).products.get("101")).toEqual({ action: "orphan", reason: "it has no category" });
  });

  it("orphan over conflict, on a category", () => {
    const snap = shop();
    addCategory(snap, 30, 77, category(snap, 10).permalink);
    const v = verdicts(snap);
    expect(v.categories.get("30")).toEqual({ action: "orphan", reason: "parent 77 is not in the source" });
    expect(v.categories.get("10")?.action).toBe("conflict");
  });

  it("is pure: the same answer twice, and its input untouched", () => {
    const snap = shop();
    product(snap, 102).sku = "IDA-1";
    const mapped = mapWooCatalog(snap, decode);
    const [snapBefore, mappedBefore] = [structuredClone(snap), structuredClone(mapped)];
    const one = sourceVerdicts(snap, mapped, DKK);
    expect(snap).toEqual(snapBefore);
    expect(mapped).toEqual(mappedBefore);
    const two = sourceVerdicts(snap, mapped, DKK);
    expect([...two.products]).toEqual([...one.products]);
    expect([...two.categories]).toEqual([...one.categories]);
  });

  it("on a whole clean shop it says nothing", () => {
    const v = verdicts(shop());
    expect([v.categories.size, v.products.size, v.warnings]).toEqual([0, 0, []]);
  });
});

/** A row an earlier import left here, as the tool's read hands it over. */
function here(kind: "c" | "p", row: MappedCategory | MappedProduct, more: Partial<WooDbRow> = {}): WooDbRow {
  return { id: `${kind}-${row.externalId}`, source: WOO_SOURCE, externalId: row.externalId, slug: row.slug, permalink: row.permalink, ...("sku" in row && { sku: row.sku, deletedAt: null }), owned: row, ...more };
}
function importedFrom(snap: WooSnapshot, filter: { categories?: string[]; products?: string[] } = {}): WooDbState {
  const { categories, products } = mapWooCatalog(snap, decode);
  const keep = (list: string[] | undefined, id: string) => !list || list.includes(id);
  return {
    categories: categories.filter((c) => keep(filter.categories, c.externalId)).map((c) => here("c", c, { parentId: c.parentExternalId && `c-${c.parentExternalId}` })),
    products: products.filter((p) => keep(filter.products, p.externalId)).map((p) => here("p", p)),
  };
}

/** One of every verdict the dry run can reach: every action there is but update, which takes a baseline. */
const CORPUS: { name: string; snap: () => WooSnapshot; db: (s: WooSnapshot) => WooDbState; policy?: WooPolicy }[] = [
  { name: "an empty catalogue", snap: shop, db: () => ({ categories: [], products: [] }) },
  { name: "the fixture's mixed types", snap: wooSnapshot, db: () => ({ categories: [], products: [] }) },
  { name: "already imported", snap: shop, db: (s) => importedFrom(s) },
  { name: "imported, mixed types", snap: wooSnapshot, db: (s) => importedFrom(s) },
  { name: "imported, then changed at the source", snap: () => {
    const s = shop();
    product(s, 101).name = "Renamed at the source";
    category(s, 10).name = "Renamed at the source";
    return s;
  }, db: () => importedFrom(shop()) },
  { name: "imported, and deleted here", snap: shop, db: (s) => {
    const db = importedFrom(s);
    db.products[0].deletedAt = new Date("2026-10-01T00:00:00Z");
    return db;
  } },
  { name: "keys held here", snap: shop, db: () => ({
    categories: [{ id: "c-csv", source: "csv", externalId: null, slug: "bordlamper", permalink: null }],
    products: [{ id: "p-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null, sku: null }],
  }) },
  { name: "no price", snap: () => {
    const s = shop();
    product(s, 101).prices.price = "";
    return s;
  }, db: () => ({ categories: [], products: [] }) },
  { name: "key twins and orphans", snap: () => {
    const s = shop();
    product(s, 102).sku = "IDA-1";
    category(s, 20).slug = "bordlamper";
    addCategory(s, 30, 77);
    addCategory(s, 40, 41);
    addCategory(s, 41, 40);
    return s;
  }, db: () => ({ categories: [], products: [] }) },
  { name: "a loop above a parent here", snap: shop, db: (s) => {
    const db = importedFrom(s, { categories: ["10", "20"], products: [] });
    db.categories[0].parentId = "c-20";
    db.categories[1].parentId = "c-10";
    return db;
  } },
  { name: "a secondary category that is not here", snap: () => {
    const s = shop();
    product(s, 101).categories.push({ id: 88, slug: "ukendt" });
    return s;
  }, db: () => ({ categories: [], products: [] }) },
  { name: "the tax basis unstated", snap: shop, db: () => ({ categories: [], products: [] }), policy: { currency: "DKK", pricesIncludeVat: true } },
  { name: "another currency", snap: shop, db: (s) => importedFrom(s), policy: { currency: "USD", pricesIncludeVat: true, sourcePricesIncludeVat: true } },
];

/** The verdict on every row, by hand from the parts: L2, then decide() in the plan's order, each write into the view. */
function byHand(snap: WooSnapshot, db: WooDbState, policy: WooPolicy, categoryOrder: string[]) {
  const mapped = mapWooCatalog(snap, decode);
  const l2 = sourceVerdicts(snap, mapped, policy);
  const view = new WooView(db);
  const types = new Map(snap.products.map((p) => [String(p.id), p.type]));
  const sources: WooSrc[] = [
    ...categoryOrder.map((id): WooSrc => {
      const row = mapped.categories.find((c) => c.externalId === id);
      if (!row) throw new Error(`no category ${id}`);
      return { kind: "category", row, verdict: l2.categories.get(id) };
    }),
    ...mapped.products.map((row): WooSrc => ({ kind: "product", row, type: types.get(row.externalId) ?? "", verdict: l2.products.get(row.externalId) })),
  ];
  return sources.map((src) => {
    const d = decide(src, view, undefined, null);
    if (d.write) view.record(view.own(src.kind, src.row.externalId), d.write.after);
    return { kind: src.kind, externalId: src.row.externalId, action: d.action, reason: d.reason, dbId: d.dbId, warnings: d.warnings };
  });
}

describe("the plan and decide() cannot disagree (one implementation, INV-16, INV-23)", () => {
  it("every row shows what decide() said of it, whatever that was: the plan has no verdict of its own", async () => {
    vi.mocked(decide).mockImplementation((src) => ({
      action: "unchanged",
      reason: `decide on ${src.kind} ${src.row.externalId}`,
      dbId: `row-${src.row.externalId}`,
      warnings: [{ code: "stockClamped", externalId: src.row.externalId, detail: "said by decide" }],
      refresh: [],
    }));
    // Everything the plan could once have settled by itself: an orphan, a key twin, a tax basis, a type, no price.
    const snap = wooSnapshot();
    snap.products.push({ ...structuredClone(product(snap, 101)), id: 104, sku: "IDA-1", prices: { ...product(snap, 101).prices, price: "" }, categories: [] });
    addCategory(snap, 30, 77);
    const plan = await planWooCatalog(snap, { categories: [{ id: "c-csv", source: "csv", externalId: null, slug: "lamper", permalink: null }], products: [] }, { currency: "DKK", pricesIncludeVat: true });
    const rows = [...plan.categories, ...plan.products];
    expect(rows).toHaveLength(5 + 4);
    for (const row of rows) {
      expect(row).toMatchObject({ action: "unchanged", dbId: `row-${row.externalId}`, reason: expect.stringMatching(new RegExp(`^decide on \\w+ ${row.externalId}$`)) });
    }
    expect(plan.counts.categories.unchanged).toBe(5);
    expect(plan.counts.products.unchanged).toBe(4);
    expect(plan.warnings.filter((w) => w.detail === "said by decide").map((w) => w.externalId)).toEqual(rows.map((r) => r.externalId));
  });

  it("decide() is asked once per row, with L2 as its input, no baseline and no stock (W21-live-2a-2 brings both)", async () => {
    const snap = shop();
    product(snap, 102).sku = "IDA-1";
    product(snap, 103).categories = [];
    addCategory(snap, 30, 77);
    const plan = await planWooCatalog(snap, { categories: [], products: [] }, DKK);
    const calls = vi.mocked(decide).mock.calls;
    expect(calls).toHaveLength(plan.categories.length + plan.products.length);
    const l2 = verdicts(snap);
    for (const [src, , base, stock] of calls) {
      expect(base).toBeUndefined();
      expect(stock).toBeNull();
      expect(src.verdict).toEqual((src.kind === "category" ? l2.categories : l2.products).get(src.row.externalId));
    }
    expect(calls.map(([src]) => src.verdict?.action).filter(Boolean)).toEqual(["orphan", "conflict", "conflict", "orphan"]);
    // Rows of a type that is not simple reach decide() with that type, for L1 to say so.
    const mixed = await planWooCatalog(wooSnapshot(), { categories: [], products: [] }, DKK);
    expect(mixed.products.map((p) => p.action)).toEqual(["create", "skip", "skip"]);
  });

  it.each(CORPUS.map((c) => [c.name, c] as const))("rows from the parts by hand equal the plan's, row by row: %s", async (_name, c) => {
    const snap = c.snap();
    const db = c.db(snap);
    const policy = c.policy ?? DKK;
    const plan = await planWooCatalog(snap, db, policy);
    const hand = byHand(snap, db, policy, plan.categories.map((row) => row.externalId));
    const shown = [...plan.categories.map((row) => ({ kind: "category", row })), ...plan.products.map((row) => ({ kind: "product", row }))];
    expect(shown.map(({ kind, row }) => ({ kind, externalId: row.externalId, action: row.action, reason: row.reason, dbId: row.dbId }))).toEqual(
      hand.map(({ kind, externalId, action, reason, dbId }) => ({ kind, externalId, action, reason, dbId })),
    );
    // A decision's warnings are the plan's, after the mapping's.
    const mappingWarnings = mapWooCatalog(snap, decode).warnings;
    expect(plan.warnings).toEqual([...mappingWarnings, ...hand.flatMap((row) => row.warnings)]);
  });

  it("the corpus above reaches every action a dry run can give, and every code", async () => {
    const seen = new Set<string>();
    for (const c of CORPUS) {
      const snap = c.snap();
      const plan = await planWooCatalog(snap, c.db(snap), c.policy ?? DKK);
      for (const row of [...plan.categories, ...plan.products]) seen.add(`${row.action} ${/^(\w+):/.exec(row.reason ?? "")?.[1] ?? ""}`.trim());
    }
    expect([...seen].sort()).toEqual([
      "blocked currencyMismatch", "blocked dependencyMissing", "blocked noPrice", "blocked parentLoop", "blocked taxBasisUnknown",
      "conflict keyDuplicated", "conflict keyTaken", "conflict noBaseline",
      "create",
      "orphan", // an orphan's reason names no code
      "skip deletedHere", "skip unsupportedType",
      "unchanged",
    ].sort());
  });
});

describe("the plan over decide() — what the dry run now shows (each named in the CHANGELOG)", () => {
  const item = (items: { externalId: string; action: string; reason?: string; dbId?: string }[], id: string) => items.find((i) => i.externalId === id);
  const EMPTY: WooDbState = { categories: [], products: [] };

  it("a parent the plan would create is there for its child; a refused one is not, and the child is blocked", async () => {
    const plan = await planWooCatalog(shop(), EMPTY, DKK);
    expect(plan.categories.map((c) => c.action)).toEqual(["create", "create", "create", "create"]);
    expect(plan.products.map((p) => p.action)).toEqual(["create", "create", "create"]);
    const twinned = shop();
    category(twinned, 20).slug = "lamper"; // neither Lamper nor Skærme is created now
    const refused = await planWooCatalog(twinned, EMPTY, DKK);
    expect(item(refused.categories, "10")?.action).toBe("conflict");
    expect(item(refused.categories, "20")?.action).toBe("conflict");
    expect(item(refused.categories, "11")).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 10 does not exist here" });
    expect(item(refused.products, "103")).toMatchObject({ action: "blocked", reason: "dependencyMissing: its category 20 does not exist here" });
  });

  it("a category listed child-first is decided parents first, so its child still finds it", async () => {
    const snap = shop();
    snap.categories.reverse();
    const plan = await planWooCatalog(snap, EMPTY, DKK);
    expect(plan.categories.map((c) => c.externalId).indexOf("11")).toBeGreaterThan(plan.categories.map((c) => c.externalId).indexOf("10"));
    expect(plan.categories.map((c) => c.action)).toEqual(["create", "create", "create", "create"]);
  });

  it("a product that is not simple is a skip, whatever else holds, here or not", async () => {
    const empty = await planWooCatalog(wooSnapshot(), EMPTY, { currency: "DKK", pricesIncludeVat: true });
    expect(item(empty.products, "102")).toMatchObject({ action: "skip", reason: "unsupportedType: a variable product is not imported until schema batch B: its variants have no externalId yet" });
    expect(item(empty.products, "103")).toMatchObject({ action: "skip", reason: "unsupportedType: a grouped product is not imported until schema batch B: its variants have no externalId yet" });
    const external = wooSnapshot();
    product(external, 102).type = "external";
    expect(item((await planWooCatalog(external, EMPTY, DKK)).products, "102")).toMatchObject({ action: "skip", reason: "unsupportedType: an external product is not imported" });
    const already = await planWooCatalog(wooSnapshot(), importedFrom(wooSnapshot()), DKK);
    expect(item(already.products, "102")).toMatchObject({ action: "skip", dbId: "p-102" });
  });

  it("a row the snapshot names no type for is not taken for a simple one", async () => {
    const snap = shop();
    Reflect.deleteProperty(product(snap, 101), "type");
    expect(item((await planWooCatalog(snap, EMPTY, DKK)).products, "101")).toMatchObject({ action: "skip", reason: "unsupportedType: a typeless product is not imported" });
  });

  it("a row already here compares as a row with no baseline does: unchanged when it matches, a conflict when it differs", async () => {
    const same = await planWooCatalog(shop(), importedFrom(shop()), DKK);
    expect(same.counts.categories).toMatchObject({ unchanged: 4, conflict: 0 });
    expect(same.counts.products).toMatchObject({ unchanged: 3, conflict: 0, update: 0 });
    expect(item(same.products, "101")).toMatchObject({ dbId: "p-101" });
    const renamed = shop();
    product(renamed, 101).name = "Renamed";
    const differs = await planWooCatalog(renamed, importedFrom(shop()), DKK);
    expect(item(differs.products, "101")).toMatchObject({ action: "conflict", dbId: "p-101", reason: expect.stringMatching(/^noBaseline: /) });
    expect(item(differs.products, "102")?.action).toBe("unchanged");
    expect(differs.counts.products.update).toBe(0);
  });

  it("a product that is not imported by its type still claims its keys: a simple one sharing them is a conflict, and it stays a skip", async () => {
    const snap = wooSnapshot();
    product(snap, 102).sku = "IDA-1"; // 102 is the fixture's variable product
    const plan = await planWooCatalog(snap, EMPTY, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "conflict", reason: 'keyDuplicated: sku "IDA-1" is also claimed by Woo product 102' });
    expect(item(plan.products, "102")?.action).toBe("skip");
  });

  it("a product deleted here is a skip, never compared and never written", async () => {
    const db = importedFrom(shop());
    db.products[0].deletedAt = new Date("2026-10-01T00:00:00Z");
    expect(item((await planWooCatalog(shop(), db, DKK)).products, "101")).toMatchObject({ action: "skip", dbId: "p-101", reason: expect.stringMatching(/^deletedHere: /) });
  });

  it("a row already here names its id whatever it is held back by", async () => {
    const eur = shop();
    product(eur, 101).prices.currency_code = "EUR";
    product(eur, 102).categories = [];
    const db = importedFrom(shop());
    const plan = await planWooCatalog(eur, db, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "blocked", dbId: "p-101" });
    expect(item(plan.products, "102")).toMatchObject({ action: "orphan", dbId: "p-102" });
    db.categories.push({ id: "c-hand", source: null, externalId: null, slug: "hand", permalink: "/lamper/bordlamper/bordlampe-ida/" });
    expect(item((await planWooCatalog(shop(), db, DKK)).products, "101")).toMatchObject({ action: "conflict", dbId: "p-101", reason: expect.stringMatching(/^keyTaken: /) });
  });

  it("a simple product with no usable price is blocked, where it was a create", async () => {
    const snap = shop();
    product(snap, 101).prices.price = "";
    expect(item((await planWooCatalog(snap, EMPTY, DKK)).products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^noPrice: /) });
  });

  it("a key of its own taken outranks a parent that will not exist: a conflict, not blocked", async () => {
    const db: WooDbState = {
      categories: [
        { id: "c-csv", source: "csv", externalId: null, slug: "lamper", permalink: null }, // Lamper will not exist…
        { id: "c-csv2", source: "csv", externalId: null, slug: "bordlamper", permalink: null }, // …and Bordlamper's own slug is taken
      ],
      products: [],
    };
    expect(item((await planWooCatalog(shop(), db, DKK)).categories, "11")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: slug "bordlamper"/) });
  });

  it("a row whose parent is here is not blocked by a conflict further up that parent's chain", async () => {
    const snap = shop();
    const { categories } = importedFrom(snap, { categories: ["11"] }); // Bordlamper is here; Lamper, its parent, will not be
    const db: WooDbState = { categories: [...categories, { id: "c-csv", source: "csv", externalId: null, slug: "lamper", permalink: null }], products: [] };
    const plan = await planWooCatalog(snap, db, DKK);
    expect(item(plan.categories, "10")?.action).toBe("conflict");
    expect(item(plan.categories, "12")).toMatchObject({ action: "create" }); // Messing, under Bordlamper
    expect(item(plan.products, "101")).toMatchObject({ action: "create" }); // filed under Bordlamper
  });

  it("a category filed under a loop here is blocked, and so what it carries", async () => {
    const db = importedFrom(shop(), { categories: ["10", "20"], products: [] });
    db.categories[0].parentId = "c-20";
    db.categories[1].parentId = "c-10";
    const plan = await planWooCatalog(shop(), db, DKK);
    expect(item(plan.categories, "11")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^parentLoop: /) });
    expect(item(plan.categories, "12")).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 11 does not exist here" });
  });

  it("a secondary category is dropped only when it will not exist here, and said in one way; a row that stops first says nothing of it", async () => {
    const snap = shop();
    addCategory(snap, 77, 999); // an orphan in the source
    product(snap, 101).categories.push({ id: 77, slug: "c-77" });
    const dropped = (plan: { warnings: { code: string; detail: string }[] }) => plan.warnings.filter((w) => w.code === "extraCategoryDropped").map((w) => w.detail);
    expect(dropped(await planWooCatalog(snap, EMPTY, DKK))).toEqual(["category 77 does not exist here; the product is filed without it"]);
    // Here as ours, an orphan or not: the link stands.
    const c77: WooDbRow = { id: "c-77", source: WOO_SOURCE, externalId: "77", slug: "c-77", permalink: null };
    expect(dropped(await planWooCatalog(snap, { categories: [c77], products: [] }, DKK))).toEqual([]);
    // Stopped before its secondary categories are read: not simple, a key conflict, deleted here.
    const variable = structuredClone(snap);
    product(variable, 101).type = "variable";
    expect(dropped(await planWooCatalog(variable, EMPTY, DKK))).toEqual([]);
    const taken: WooDbRow = { id: "p-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null, sku: null };
    expect(dropped(await planWooCatalog(snap, { categories: [], products: [taken] }, DKK))).toEqual([]);
    // Blocked by what comes after them: said.
    const noPrice = structuredClone(snap);
    product(noPrice, 101).prices.price = "";
    expect(dropped(await planWooCatalog(noPrice, EMPTY, DKK))).toEqual(["category 77 does not exist here; the product is filed without it"]);
  });

  it("a row gone from the source is listed from the rows read, once each; a row the plan writes in its own view is no such row", async () => {
    const db = importedFrom(shop(), { categories: ["10"], products: [] });
    const gone: WooDbRow = { id: "c-gone", source: WOO_SOURCE, externalId: "998", slug: "gone", permalink: null };
    const notOurs: WooDbRow = { id: "c-csv", source: "csv", externalId: "997", slug: "csv", permalink: null };
    db.categories.push(gone, notOurs);
    const plan = await planWooCatalog(shop(), db, DKK);
    expect(plan.counts.categories.create).toBe(3); // written into the view, and not in the rows read
    expect(plan.missingInSource).toEqual([{ kind: "category", externalId: "998", dbId: "c-gone" }]);
  });

  it("a row a snapshot lists twice shows the id of no row that exists", async () => {
    const snap = shop();
    snap.categories.push(structuredClone(category(snap, 20)));
    const plan = await planWooCatalog(snap, EMPTY, DKK);
    const twice = plan.categories.filter((c) => c.externalId === "20");
    expect(twice.map((c) => [c.action, c.dbId])).toEqual([["conflict", undefined], ["conflict", undefined]]);
  });
});
