import { beforeAll, describe, expect, it } from "vitest";

import {
  WOO_SOURCE,
  htmlDecoder,
  mapWooCatalog,
  type MappedCategory,
  type HtmlDecode,
  type MappedProduct,
} from "@/lib/woo/map-catalog";
import { planWooCatalog, type WooDbRow, type WooDbState } from "@/lib/woo/plan";
import type { WooSnapshot } from "@/lib/woo/types";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-1 — the dry-run plan for categories and products: what an import
 * WOULD do with a snapshot, computed without writing anything. Each row's
 * verdict is decide()'s (tests/unit/woo-decide.test.ts); what the source alone
 * says, and that the plan adds nothing to it, is woo-source-verdicts.test.ts.
 */

/** A row an earlier import left here, as migration.woo_plan reads it: its keys and its owned fields. */
function woo(row: MappedCategory | MappedProduct, prefix: string): WooDbRow {
  return { id: `${prefix}-${row.externalId}`, source: WOO_SOURCE, externalId: row.externalId, slug: row.slug, permalink: row.permalink, sku: "sku" in row ? row.sku : undefined, owned: row };
}

/** The fixture shop with every product simple and priced, so a row's verdict is not its type's. */
function simpleShop(): WooSnapshot {
  const snap = wooSnapshot();
  for (const p of snap.products) {
    p.type = "simple";
    p.prices.price ||= "12500";
  }
  return snap;
}

/** The DB as a previous import of `snap` left it. */
function imported(snap: WooSnapshot): { db: WooDbState } {
  const { categories, products } = mapWooCatalog(snap, decode);
  return { db: { categories: categories.map((c) => woo(c, "c")), products: products.map((p) => woo(p, "p")) } };
}

let decode: HtmlDecode;
beforeAll(async () => {
  decode = await htmlDecoder();
});

const EMPTY_DB: WooDbState = { categories: [], products: [] };
// This shop: DKK, prices incl. VAT — and the owner has said the Woo shop shows them incl. VAT too.
const DKK = { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true };
const action = (items: { externalId: string; action: string }[], id: string) =>
  items.find((i) => i.externalId === id)?.action;

describe("woo plan — primary category", () => {
  it("is the deepest category whose permalink is a prefix of the product's", async () => {
    const { products, warnings } = mapWooCatalog(wooSnapshot(), decode);
    const ida = products.find((p) => p.externalId === "101")!;
    // Listed first: Lamper (/lamper/). Deepest in the tree: Messing — but
    // /lamper/bordlamper/messing/ is not a prefix of …/bordlampe-ida/.
    expect(ida.categoryExternalId).toBe("11");
    expect(ida.extraCategoryExternalIds).toEqual(["10", "12"]);
    expect(products.find((p) => p.externalId === "102")!.categoryExternalId).toBe("10");
    expect(warnings.filter((w) => w.code === "primaryCategoryFallback")).toEqual([]);
  });

  it("falls back to the first listed category, with a warning, when none is a prefix", async () => {
    const snap = wooSnapshot();
    const bo = snap.products.find((p) => p.id === 102)!;
    bo.categories = [
      { id: 20, slug: "sk%c3%a6rme" },
      { id: 11, slug: "bordlamper" },
    ];
    const { products, warnings } = mapWooCatalog(snap, decode);
    expect(products.find((p) => p.externalId === "102")!.categoryExternalId).toBe("20");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "primaryCategoryFallback", externalId: "102" }),
    );
  });
});

describe("woo plan — conflicts and orphans", () => {
  it("a slug already held by a source=csv product is a conflict, never a create", async () => {
    const db: WooDbState = {
      categories: [],
      products: [
        { id: "p-csv", source: "csv", externalId: null, slug: "bordlampe-ida", permalink: null, sku: null },
      ],
    };
    const plan = await planWooCatalog(simpleShop(), db, DKK);
    const ida = plan.products.find((p) => p.externalId === "101")!;
    expect(ida.action).toBe("conflict");
    expect(ida.reason).toMatch(/^keyTaken: slug "bordlampe-ida".*csv product p-csv/);
    expect(action(plan.products, "102")).toBe("create");
  });

  it("a sku or permalink held outside the import is a conflict too", async () => {
    const db: WooDbState = {
      categories: [
        { id: "c-hand", source: null, externalId: null, slug: "andet", permalink: "/lamper/loftlampe-bo" },
      ],
      products: [{ id: "p-hand", source: null, externalId: null, slug: "x", permalink: null, sku: "IDA-1" }],
    };
    const plan = await planWooCatalog(simpleShop(), db, DKK);
    expect(plan.products.find((p) => p.externalId === "101")!.reason).toMatch(/sku "IDA-1"/);
    expect(plan.products.find((p) => p.externalId === "102")!.reason).toMatch(/permalink/);
  });

  it("an orphan child — a variation or category whose parent is not in the source — is an orphan", async () => {
    const snap = wooSnapshot();
    snap.categories.push(
      { id: 30, name: "Gammel", slug: "gammel", parent: 77, permalink: "https://shop.example.test/gammel/" },
      { id: 31, name: "Under", slug: "under", parent: 30, permalink: "https://shop.example.test/gammel/under/" },
      { id: 40, name: "Ring A", slug: "ring-a", parent: 41, permalink: "https://shop.example.test/ring-a/" },
      { id: 41, name: "Ring B", slug: "ring-b", parent: 40, permalink: "https://shop.example.test/ring-b/" },
    );
    const extra = structuredClone(snap.products[1]);
    Object.assign(extra, {
      id: 104,
      type: "simple",
      slug: "gammel-lampe",
      sku: "OLD",
      permalink: "https://shop.example.test/gammel/under/gammel-lampe/",
      categories: [{ id: 31, slug: "under" }],
    });
    snap.products.push(extra);
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(plan.variations.orphans).toEqual([
      expect.objectContaining({ externalId: "299", action: "orphan", reason: expect.stringMatching(/999/) }),
    ]);
    expect(plan.variations.attached).toBe(2);
    expect(action(plan.categories, "30")).toBe("orphan");
    const reason = (id: string) => plan.categories.find((c) => c.externalId === id)?.reason;
    expect(reason("30")).toBe("parent 77 is not in the source");
    expect(reason("31")).toBe("parent 30 is an orphan");
    expect(action(plan.categories, "40")).toBe("orphan");
    expect(reason("40")).toMatch(/loops/);
    expect(action(plan.categories, "31")).toBe("orphan");
    expect(action(plan.products, "104")).toBe("orphan");
    expect(action(plan.products, "101")).toBe("create");
  });

  it("orders categories parents first and reports rewritten slugs", async () => {
    const plan = await planWooCatalog(wooSnapshot(), EMPTY_DB, DKK);
    expect(plan.categories.map((c) => c.externalId)).toEqual(["10", "20", "11", "12"]);
    expect(plan.categories.find((c) => c.externalId === "20")!.slug).toBe("skaerme");
    expect(plan.warnings.filter((w) => w.code === "slugRewritten").map((w) => w.externalId)).toEqual([
      "20",
      "103",
    ]);
  });
});

describe("woo plan — missing in the source", () => {
  const withGone = (): WooDbState => {
    const { db } = imported(wooSnapshot());
    db.products.push({ ...db.products[0], id: "p-gone", externalId: "999", slug: "gone", permalink: null, sku: null });
    return db;
  };

  it("lists a Woo row the source no longer has — and only lists it", async () => {
    const plan = await planWooCatalog(wooSnapshot(), withGone(), DKK);
    expect(plan.missingInSource).toEqual([{ kind: "product", externalId: "999", dbId: "p-gone" }]);
  });

  it("says nothing is missing when the snapshot is partial", async () => {
    const snap = wooSnapshot();
    snap.meta.products = { complete: false, total: 5, fetched: 3 };
    expect((await planWooCatalog(snap, withGone(), DKK)).missingInSource).toEqual([]);
  });
});

describe("woo plan — R1: what a row carries, unset permalinks, every key holder", () => {
  const item = (items: { externalId: string; action: string; reason?: string }[], id: string) =>
    items.find((i) => i.externalId === id);

  it("a NEW category that conflicts blocks its subcategories and the products filed under them", async () => {
    const db: WooDbState = {
      categories: [{ id: "c-csv", source: "csv", externalId: null, slug: "lamper", permalink: null }],
      products: [],
    };
    const plan = await planWooCatalog(simpleShop(), db, DKK);
    expect(action(plan.categories, "10")).toBe("conflict");
    expect(item(plan.categories, "11")).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 10 does not exist here" });
    expect(item(plan.categories, "12")).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 11 does not exist here" });
    expect(item(plan.products, "102")).toMatchObject({ action: "blocked", reason: "dependencyMissing: its category 10 does not exist here" });
    expect(action(plan.products, "101")).toBe("blocked"); // filed under 11, itself blocked
    expect(action(plan.categories, "20")).toBe("create");
    expect(action(plan.products, "103")).toBe("create");
    expect(plan.counts.categories).toMatchObject({ conflict: 1, blocked: 2, create: 1 });
  });

  it("a category already here as ours, whatever the comparison says, still carries its children", async () => {
    const ours = imported(wooSnapshot()).db.categories.filter((c) => c.externalId === "10");
    const same = await planWooCatalog(simpleShop(), { categories: ours, products: [] }, DKK);
    expect(item(same.categories, "10")).toMatchObject({ action: "unchanged", dbId: "c-10" });
    const renamed = simpleShop();
    renamed.categories[0].name = "Lamper, renamed at the source";
    const differs = await planWooCatalog(renamed, { categories: ours, products: [] }, DKK);
    expect(item(differs.categories, "10")).toMatchObject({ action: "conflict", dbId: "c-10", reason: expect.stringMatching(/^noBaseline:/) });
    for (const plan of [same, differs]) {
      expect(action(plan.categories, "11")).toBe("create");
      expect(action(plan.products, "102")).toBe("create");
    }
  });

  it("a price above what the price column holds is no price: its mapping warning, under mapping version 2, and a create it blocks", async () => {
    const snap = wooSnapshot();
    snap.products[0].prices.price = "2147483648";
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(plan.mappingVersion).toBe(2);
    expect(item(plan.products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^noPrice:/) });
    expect(plan.warnings).toContainEqual({ code: "noPrice", externalId: "101", detail: 'price "2147483648"' });
  });

  it("a query-only Woo address (?product=…) is an unset permalink, with a warning — never '/'", async () => {
    const snap = simpleShop();
    snap.products[0].permalink = "https://shop.example.test/?product=bordlampe-ida";
    snap.products[1].permalink = "https://shop.example.test/?product=loftlampe-bo";
    snap.categories[0].permalink = "https://shop.example.test/?product_cat=lamper";
    const { products, categories, warnings } = mapWooCatalog(snap, decode);
    expect(products.slice(0, 2).map((p) => p.permalink)).toEqual([null, null]);
    expect(categories[0].permalink).toBeNull();
    expect(warnings.filter((w) => w.code === "permalinkUnset").map((w) => w.externalId)).toEqual(["10", "101", "102"]);
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(action(plan.products, "102")).toBe("create");
  });

  it("every row holding a permalink counts: a hand-made category on a product's address is a conflict", async () => {
    const db: WooDbState = { categories: [{ id: "c-hand", source: null, externalId: null, slug: "ida-kategori", permalink: "/lamper/bordlamper/bordlampe-ida/" }], products: [] };
    const plan = await planWooCatalog(wooSnapshot(), db, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/c-hand/) });
  });

  it("…and on a rerun, where the product itself holds the address too and neither hides the other", async () => {
    const snap = wooSnapshot();
    const { db } = imported(snap);
    db.categories.push({ id: "c-hand", source: null, externalId: null, slug: "ida-kategori", permalink: "/lamper/bordlamper/bordlampe-ida/" });
    const plan = await planWooCatalog(snap, db, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/c-hand/) });
  });

  it("a product filed nowhere, or under a category the source does not send, is an orphan", async () => {
    const snap = simpleShop();
    snap.products[0].categories = [];
    snap.products[1].categories = [{ id: 88, slug: "ukendt" }];
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "orphan", reason: "it has no category" });
    expect(item(plan.products, "102")).toMatchObject({ action: "orphan", reason: "its category 88 is not in the source" });
  });

  it("a row of another source under the same Woo id is not ours: the product is planned as new, and that row is never listed as gone", async () => {
    const csv = (id: string, externalId: string): WooDbRow => ({ id, source: "csv", externalId, slug: id, permalink: null, sku: null });
    const plan = await planWooCatalog(wooSnapshot(), { categories: [], products: [csv("p-csv", "101"), csv("p-csv-gone", "999")] }, DKK);
    expect(item(plan.products, "101")?.action).toBe("create");
    expect(plan.missingInSource).toEqual([]);
  });

  it("an orphan subtree listed child-first still plans parents first, as orphans, not as a loop", async () => {
    const snap = wooSnapshot();
    snap.categories.push(
      { id: 32, name: "C", slug: "c", parent: 31, permalink: "https://shop.example.test/a/b/c/" },
      { id: 31, name: "B", slug: "b", parent: 30, permalink: "https://shop.example.test/a/b/" },
      { id: 30, name: "A", slug: "a", parent: 77, permalink: "https://shop.example.test/a/" },
    );
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    const order = plan.categories.map((c) => c.externalId);
    expect(order.indexOf("30")).toBeLessThan(order.indexOf("31"));
    expect(order.indexOf("31")).toBeLessThan(order.indexOf("32"));
    expect(item(plan.categories, "30")?.reason).toBe("parent 77 is not in the source");
    expect(item(plan.categories, "31")?.reason).toBe("parent 30 is an orphan");
    expect(item(plan.categories, "32")?.reason).toBe("parent 31 is an orphan");
  });

  it("says when wp/v2 did not answer for every product", async () => {
    const snap = wooSnapshot();
    snap.wpProducts = [];
    snap.meta.wpProducts = { complete: false, total: 3, fetched: 0 };
    expect((await planWooCatalog(snap, EMPTY_DB, DKK)).snapshotWarnings).toEqual([
      expect.stringMatching(/wp\/v2 answered 0 of 3 products/),
    ]);
    expect((await planWooCatalog(wooSnapshot(), EMPTY_DB, DKK)).snapshotWarnings).toEqual([]);
  });
});

describe("woo plan — R2: secondary categories, plain permalinks", () => {
  const item = (items: { externalId: string; action: string; reason?: string }[], id: string) =>
    items.find((i) => i.externalId === id);

  it("a secondary category that will not exist here is dropped from the product with a warning; the product is still created", async () => {
    const db: WooDbState = {
      categories: [{ id: "c-csv", source: "csv", externalId: null, slug: "messing", permalink: null }],
      products: [],
    };
    const snap = wooSnapshot();
    snap.categories.push({ id: 77, name: "Gammel", slug: "gammel", parent: 999, permalink: "https://shop.example.test/gammel/" }); // an orphan: its parent is not in the source
    snap.products[0].categories.push({ id: 77, slug: "gammel" }, { id: 88, slug: "ukendt" }); // and one the source does not list at all
    const plan = await planWooCatalog(snap, db, DKK);
    expect(action(plan.categories, "12")).toBe("conflict");
    expect(item(plan.products, "101")?.action).toBe("create");
    expect(plan.warnings.filter((w) => w.code === "extraCategoryDropped")).toEqual([
      expect.objectContaining({ externalId: "101", detail: "category 12 does not exist here; the product is filed without it" }),
      expect.objectContaining({ externalId: "101", detail: "category 77 does not exist here; the product is filed without it" }),
      expect.objectContaining({ externalId: "101", detail: "category 88 does not exist here; the product is filed without it" }),
    ]);
  });

  it.each([
    "https://shop.example.test/wordpress/?product=PLACEHOLDER",
    "https://shop.example.test/wordpress/?post_type=product&p=PLACEHOLDER",
    "https://shop.example.test/?p=PLACEHOLDER",
    "https://shop.example.test/blog/?page_id=PLACEHOLDER",
  ])("a plain WordPress/Woo address under any install path is unset: %s", async (pattern) => {
    const snap = simpleShop();
    snap.products[0].permalink = pattern.replace("PLACEHOLDER", "101");
    snap.products[1].permalink = pattern.replace("PLACEHOLDER", "102");
    snap.categories[0].permalink = "https://shop.example.test/wordpress/?product_cat=lamper";
    const { products, categories } = mapWooCatalog(snap, decode);
    expect([products[0].permalink, products[1].permalink, categories[0].permalink]).toEqual([null, null, null]);
    expect(action((await planWooCatalog(snap, EMPTY_DB, DKK)).products, "102")).toBe("create");
  });

  it("keeps a pretty permalink that merely carries a query (a variation's attribute link)", async () => {
    const snap = wooSnapshot();
    snap.products[0].permalink = "https://shop.example.test/lamper/bordlamper/bordlampe-ida/?attribute_pa_farve=hvid";
    expect(mapWooCatalog(snap, decode).products[0].permalink).toBe("/lamper/bordlamper/bordlampe-ida/");
  });

  it("a row already here and a new one that the source gives one slug are both a conflict", async () => {
    const snap = simpleShop();
    const { db } = imported(snap);
    snap.products[0].slug = "ny-ida"; // renamed at the source, and already here
    const twin = structuredClone(snap.products[2]);
    Object.assign(twin, { id: 105, slug: "ny-ida", sku: "TWIN", permalink: "https://shop.example.test/sk%c3%a6rme/twin/" });
    snap.products.push(twin);
    const plan = await planWooCatalog(snap, db, DKK);
    expect(item(plan.products, "101")).toMatchObject({ action: "conflict", dbId: "p-101", reason: expect.stringMatching(/^keyDuplicated: .*Woo product 105/) });
    expect(item(plan.products, "105")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyDuplicated: .*Woo product 101/) });
  });

  it("a sku or relative permalink is compared as a column holds it: rows that collide only in that form are a conflict, not a write that throws", async () => {
    const claimed = { action: "conflict", reason: expect.stringMatching(/also claimed by Woo product 101/) };
    const skus = simpleShop();
    skus.products[0].sku = "X\ud83d";
    skus.products[1].sku = "X\ude00";
    expect(item((await planWooCatalog(skus, EMPTY_DB, DKK)).products, "102")).toMatchObject(claimed);
    const links = simpleShop();
    links.products[0].permalink = "/lamper/a\ud83d/";
    links.products[1].permalink = "/lamper/a\ude00/";
    expect(item((await planWooCatalog(links, EMPTY_DB, DKK)).products, "102")).toMatchObject(claimed);
    const held = wooSnapshot();
    held.products[0].sku = "X\ud83d";
    const hand: WooDbRow = { id: "p-hand", source: null, externalId: null, slug: "x", permalink: null, sku: "X\ud83d".toWellFormed() };
    expect(item((await planWooCatalog(held, { categories: [], products: [hand] }, DKK)).products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/is taken by a hand-made product p-hand/) });
  });
});

describe("woo plan — R3: every HTML entity", () => {
  it("decodes every named, decimal and hex entity — once", async () => {
    const snap = wooSnapshot();
    snap.categories[3].name = "Sk&aelig;rme &#x2013; bl&aring; &amp; gr&oslash;n";
    snap.products[0].name = "Lampe &#8211; &Aring;&Oslash;&AElig; &hellip;";
    snap.products[0].description = "<p>&amp;amp; is not &amp;</p><p>&lt;b&gt;literal&lt;/b&gt;&nbsp;tekst</p>";
    const { categories, products } = mapWooCatalog(snap, decode);
    expect(categories[3].name).toBe("Skærme – blå & grøn");
    expect(products[0].name).toBe("Lampe – ÅØÆ …");
    expect(products[0].description).toBe("&amp; is not & <b>literal</b> tekst");
  });
});

describe("woo plan — R4: currency, and a wide tree in linear time", () => {
  it("a shop pricing in another currency plans no product — blocked, never converted", async () => {
    const snap = simpleShop();
    for (const p of snap.products) p.prices.currency_code = "EUR";
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(plan.counts.products).toMatchObject({ blocked: 3, create: 0 });
    expect(plan.products[0].reason).toMatch(/currencyMismatch.*EUR.*DKK/);
    expect(plan.snapshotWarnings).toContainEqual(expect.stringMatching(/EUR.*DKK.*never converted/));
    expect(plan.counts.categories).toMatchObject({ create: 4 }); // categories carry no price
  });

  it("a product Woo names no currency for is blocked: an absent currency is never taken for this shop's", async () => {
    const snap = wooSnapshot();
    Object.assign(snap.products[0].prices, { currency_code: undefined });
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(plan.products[0]).toMatchObject({ action: "blocked", reason: "currencyMismatch: priced in no currency, this shop sells in DKK" });
  });

  it("the DKK fixture plans its one simple product, scaled by Woo's own minor unit", async () => {
    const plan = await planWooCatalog(wooSnapshot(), EMPTY_DB, DKK);
    expect(plan.counts.products).toMatchObject({ create: 1, skip: 2, blocked: 0 });
    expect(plan.snapshotWarnings).toEqual([]);
    const snap = wooSnapshot();
    Object.assign(snap.products[0].prices, { price: "799", currency_minor_unit: 0 }); // a shop set to whole kroner
    expect(mapWooCatalog(snap, decode).products[0].priceDkk).toBe(79900);
    expect(mapWooCatalog(wooSnapshot(), decode).products[0].priceDkk).toBe(79900); // "79900" at minor unit 2
  });

  const wide = (n: number) => {
    const snap = wooSnapshot();
    for (let i = 0; i < n; i++) {
      const parent = i < 10 ? 0 : 1000 + Math.floor((i - 10) / 10); // 4–5 levels
      snap.categories.push({ id: 1000 + i, name: `Kategori ${i}`, slug: `kategori-${i}`, parent, permalink: `https://shop.example.test/k/${i}/` });
    }
    snap.meta.categories = { complete: true, total: snap.categories.length, fetched: snap.categories.length };
    return snap;
  };
  const best = async (snap: WooSnapshot) => {
    let ms = Infinity;
    for (let r = 0; r < 3; r++) {
      const t = performance.now();
      await planWooCatalog(snap, EMPTY_DB, DKK);
      ms = Math.min(ms, performance.now() - t);
    }
    return ms;
  };

  it("10,000 categories plan in well under a second, and four times the tree is not sixteen times the time", async () => {
    await planWooCatalog(wooSnapshot(), EMPTY_DB, DKK); // load the decoder outside the timing
    const large = await best(wide(10_000));
    expect(large).toBeLessThan(1000);
    const ratio = large / Math.max(await best(wide(2_500)), 0.5);
    expect(ratio).toBeLessThan(8);
  }, 60_000);
});

describe("woo plan — R5: the tax basis is stated, never guessed", () => {
  it.each([
    ["nobody has said whether the shop's prices include VAT", undefined, "taxBasisUnknown", /whether the shop's prices include VAT/],
    ["the shop shows prices ex VAT, this shop stores them incl. VAT", false, "taxBasisMismatch", /exclude VAT.*include it.*never converted/],
  ] as const)("%s ⇒ every product blocked, categories still planned", async (_label, sourcePricesIncludeVat, code, warning) => {
    const plan = await planWooCatalog(simpleShop(), EMPTY_DB, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat });
    expect(plan.counts.products).toMatchObject({ blocked: 3, create: 0 });
    expect(plan.products.every((p) => p.reason?.startsWith(`${code}:`))).toBe(true);
    expect(plan.snapshotWarnings).toContainEqual(expect.stringMatching(warning));
    expect(plan.counts.categories).toMatchObject({ create: 4 });
  });

  it("the same basis on both sides plans the products", async () => {
    const plan = await planWooCatalog(simpleShop(), EMPTY_DB, { currency: "DKK", pricesIncludeVat: false, sourcePricesIncludeVat: false });
    expect(plan.counts.products).toMatchObject({ create: 3, blocked: 0 });
  });
});
