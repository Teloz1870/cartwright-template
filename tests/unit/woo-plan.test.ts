import { beforeAll, describe, expect, it } from "vitest";

import {
  WOO_SOURCE,
  htmlDecoder,
  mapWooCatalog,
  wooFingerprint,
  type MappedCategory,
  type HtmlDecode,
  type MappedProduct,
} from "@/lib/woo/map-catalog";
import {
  planWooCatalog,
  threeWay,
  type WooBaseline,
  type WooDbRow,
  type WooDbState,
} from "@/lib/woo/plan";
import type { WooSnapshot } from "@/lib/woo/types";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-1 — the dry-run plan for categories and products: what an import
 * WOULD do with a snapshot, computed without writing anything.
 */

function woo<T extends MappedCategory | MappedProduct>(row: T, prefix: string): WooDbRow<T> {
  const sku = "sku" in row ? row.sku : undefined;
  return {
    id: `${prefix}-${row.externalId}`,
    source: WOO_SOURCE,
    externalId: row.externalId,
    slug: row.slug,
    permalink: row.permalink,
    sku,
    owned: row,
  };
}

/** The DB and baseline as a previous run that imported `snap` left them. */
function imported(snap: WooSnapshot): { db: WooDbState; baseline: WooBaseline } {
  const { categories, products } = mapWooCatalog(snap, decode);
  const fps = (rows: (MappedCategory | MappedProduct)[]) =>
    Object.fromEntries(rows.map((r) => [r.externalId, wooFingerprint(r)]));
  return {
    db: { categories: categories.map((c) => woo(c, "c")), products: products.map((p) => woo(p, "p")) },
    baseline: { categories: fps(categories), products: fps(products) },
  };
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

describe("woo plan — the three-way re-run table", () => {
  it.each([
    ["no DB row", "create", "S", null, "S"],
    ["source = DB (whatever the baseline)", "unchanged", "S", "S", "B"],
    ["source changed, DB still at the baseline", "update", "S2", "B", "B"],
    ["DB changed locally, source still at the baseline", "skip", "B", "D", "B"],
    ["both changed since the baseline", "conflict", "S2", "D", "B"],
    ["no baseline and source ≠ DB", "conflict", "S", "D", undefined],
  ] as const)("%s ⇒ %s", (_label, expected, src, db, base) => {
    expect(threeWay(src, db, base).action).toBe(expected);
  });

  it("feeds the table from fingerprints of the importer-owned fields", async () => {
    const snap = wooSnapshot();
    const { db, baseline } = imported(snap);
    const again = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(again.counts.products).toMatchObject({ unchanged: 3, update: 0, skip: 0, conflict: 0 });
    expect(again.counts.categories).toMatchObject({ unchanged: 4 });

    snap.products.find((p) => p.id === 101)!.prices.price = "69900"; // source changed
    const bo = db.products.find((p) => p.externalId === "102")!;
    bo.owned = { ...bo.owned!, name: "Loftlampe Bo (rettet)" }; // edited locally
    const duo = db.products.find((p) => p.externalId === "103")!;
    duo.owned = { ...duo.owned!, name: "Lokal rettelse" };
    snap.products.find((p) => p.id === 103)!.name = "Ny kildetekst"; // …and in the source
    const plan = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(action(plan.products, "101")).toBe("update");
    expect(action(plan.products, "102")).toBe("skip");
    expect(action(plan.products, "103")).toBe("conflict");
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
    const plan = await planWooCatalog(wooSnapshot(), db, DKK);
    const ida = plan.products.find((p) => p.externalId === "101")!;
    expect(ida.action).toBe("conflict");
    expect(ida.reason).toMatch(/slug "bordlampe-ida".*csv product p-csv/);
    expect(action(plan.products, "102")).toBe("create");
  });

  it("a sku or permalink held outside the import is a conflict too", async () => {
    const db: WooDbState = {
      categories: [
        { id: "c-hand", source: null, externalId: null, slug: "andet", permalink: "/lamper/loftlampe-bo" },
      ],
      products: [{ id: "p-hand", source: null, externalId: null, slug: "x", permalink: null, sku: "IDA-1" }],
    };
    const plan = await planWooCatalog(wooSnapshot(), db, DKK);
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
    const plan = await planWooCatalog(wooSnapshot(), db, DKK);
    expect(action(plan.categories, "10")).toBe("conflict");
    expect(item(plan.categories, "11")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/parent 10/) });
    expect(action(plan.categories, "12")).toBe("blocked");
    expect(item(plan.products, "102")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/category 10/) });
    expect(action(plan.products, "101")).toBe("blocked"); // filed under 11, itself blocked
    expect(action(plan.categories, "20")).toBe("create");
    expect(action(plan.products, "103")).toBe("create");
    expect(plan.counts.categories).toMatchObject({ conflict: 1, blocked: 2, create: 1 });
  });

  it("a conflicting category that already exists here as ours still carries its children", async () => {
    const snap = wooSnapshot();
    const { db, baseline } = imported(snap);
    snap.categories.find((c) => c.id === 10)!.name = "Lamper (kilde)";
    const lamper = db.categories.find((c) => c.externalId === "10")!;
    lamper.owned = { ...lamper.owned!, name: "Lamper (lokal)" };
    const plan = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(action(plan.categories, "10")).toBe("conflict");
    expect(action(plan.categories, "11")).toBe("unchanged");
    expect(action(plan.products, "102")).toBe("unchanged");
  });

  it("a query-only Woo address (?product=…) is an unset permalink, with a warning — never '/'", async () => {
    const snap = wooSnapshot();
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

  it("every row holding a permalink counts: a hand-made category on a product's address is a conflict on rerun", async () => {
    const snap = wooSnapshot();
    const { db, baseline } = imported(snap);
    db.categories.push({ id: "c-hand", source: null, externalId: null, slug: "ida-kategori", permalink: "/lamper/bordlamper/bordlampe-ida/" });
    const plan = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(item(plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/c-hand/) });
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

describe("woo plan — R2: unavailable is not removed, secondary categories, plain permalinks", () => {
  const item = (items: { externalId: string; action: string; reason?: string; fingerprint?: string }[], id: string) =>
    items.find((i) => i.externalId === id);
  const withoutWp = (snap: WooSnapshot) => {
    snap.wpProducts = [];
    snap.meta.wpProducts = { complete: false, total: snap.products.length, fetched: 0 };
    return snap;
  };

  it("wp/v2 unavailable never erases a stored Yoast title: at the baseline the row is unchanged", async () => {
    const { db, baseline } = imported(wooSnapshot());
    expect(db.products[0].owned!.metaTitle).toBe("Bordlampe Ida i messing | Lampebutikken");
    const plan = await planWooCatalog(withoutWp(wooSnapshot()), db, { ...DKK, baseline });
    expect(plan.counts.products).toMatchObject({ unchanged: 3, update: 0 });
  });

  it("…and a real source edit updates the row with the stored SEO fields carried, not nulled", async () => {
    const { db, baseline } = imported(wooSnapshot());
    const snap = withoutWp(wooSnapshot());
    snap.products[0].prices.price = "69900";
    const ida = item((await planWooCatalog(snap, db, { ...DKK, baseline })).products, "101")!;
    expect(ida.action).toBe("update");
    expect(ida.fingerprint).toBe(wooFingerprint({ ...db.products[0].owned!, priceDkk: 69900 }));
  });

  it("a row created without wp/v2 is fingerprinted as written, so the next full run is an update, not a conflict", async () => {
    const first = item((await planWooCatalog(withoutWp(wooSnapshot()), EMPTY_DB, DKK)).products, "101")!;
    expect(first.action).toBe("create");
    const { db } = imported(wooSnapshot());
    db.products[0].owned = { ...db.products[0].owned!, status: "active", metaTitle: null, metaDescription: null };
    const plan = await planWooCatalog(wooSnapshot(), db, { ...DKK, baseline: { categories: imported(wooSnapshot()).baseline.categories, products: { "101": first.fingerprint! } } });
    expect(item(plan.products, "101")!.action).toBe("update");
  });

  it("a secondary category that is blocked is dropped from the product with a warning; the product is still created", async () => {
    const db: WooDbState = {
      categories: [{ id: "c-csv", source: "csv", externalId: null, slug: "messing", permalink: null }],
      products: [],
    };
    const snap = wooSnapshot();
    snap.products[0].categories.push({ id: 88, slug: "ukendt" }); // and one the source does not list at all
    const plan = await planWooCatalog(snap, db, DKK);
    expect(action(plan.categories, "12")).toBe("conflict");
    const ida = item(plan.products, "101")!;
    expect(ida.action).toBe("create");
    const mapped = mapWooCatalog(snap, decode).products[0];
    expect(ida.fingerprint).toBe(wooFingerprint({ ...mapped, extraCategoryExternalIds: ["10"] }));
    expect(plan.warnings.filter((w) => w.code === "extraCategoryDropped")).toEqual([
      expect.objectContaining({ externalId: "101", detail: expect.stringMatching(/12 conflicts/) }),
      expect.objectContaining({ externalId: "101", detail: expect.stringMatching(/88 is not in the source/) }),
    ]);
  });

  it.each([
    "https://shop.example.test/wordpress/?product=PLACEHOLDER",
    "https://shop.example.test/wordpress/?post_type=product&p=PLACEHOLDER",
    "https://shop.example.test/?p=PLACEHOLDER",
    "https://shop.example.test/blog/?page_id=PLACEHOLDER",
  ])("a plain WordPress/Woo address under any install path is unset: %s", async (pattern) => {
    const snap = wooSnapshot();
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

  it("a three-way conflict still claims its keys, so a source twin on its new slug is a conflict (guard)", async () => {
    const snap = wooSnapshot();
    const { db, baseline } = imported(snap);
    snap.products[0].slug = "ny-ida"; // renamed at the source…
    db.products[0].owned = { ...db.products[0].owned!, name: "Lokal Ida" }; // …and edited here: conflict
    const twin = structuredClone(snap.products[2]);
    Object.assign(twin, { id: 105, slug: "ny-ida", sku: "TWIN", permalink: "https://shop.example.test/sk%c3%a6rme/twin/" });
    snap.products.push(twin);
    const plan = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(action(plan.products, "101")).toBe("conflict");
    expect(item(plan.products, "105")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/also claimed by Woo product 101/) });
  });
});

describe("woo plan — R3: Yoast off, every HTML entity", () => {
  it("wp/v2 answers the status but no Yoast head: the stored SEO fields are carried, not nulled", async () => {
    const { db, baseline } = imported(wooSnapshot());
    const snap = wooSnapshot();
    for (const wp of snap.wpProducts) delete wp.yoast_head_json; // Yoast deactivated
    const plan = await planWooCatalog(snap, db, { ...DKK, baseline });
    expect(plan.counts.products).toMatchObject({ unchanged: 3, update: 0 });
    // A head that IS there but has no description is Yoast saying there is none.
    expect(mapWooCatalog(wooSnapshot(), decode).products[1].metaDescription).toBeNull();
  });

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
    const snap = wooSnapshot();
    for (const p of snap.products) p.prices.currency_code = "EUR";
    const plan = await planWooCatalog(snap, EMPTY_DB, DKK);
    expect(plan.counts.products).toMatchObject({ blocked: 3, create: 0 });
    expect(plan.products[0].reason).toMatch(/currencyMismatch.*EUR.*DKK/);
    expect(plan.snapshotWarnings).toContainEqual(expect.stringMatching(/EUR.*DKK.*never converted/));
    expect(plan.counts.categories).toMatchObject({ create: 4 }); // categories carry no price
  });

  it("the DKK fixture plans as before, scaled by Woo's own minor unit", async () => {
    const plan = await planWooCatalog(wooSnapshot(), EMPTY_DB, DKK);
    expect(plan.counts.products).toMatchObject({ create: 3, blocked: 0 });
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
    const plan = await planWooCatalog(wooSnapshot(), EMPTY_DB, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat });
    expect(plan.counts.products).toMatchObject({ blocked: 3, create: 0 });
    expect(plan.products.every((p) => p.reason?.startsWith(`${code}:`))).toBe(true);
    expect(plan.snapshotWarnings).toContainEqual(expect.stringMatching(warning));
    expect(plan.counts.categories).toMatchObject({ create: 4 });
  });

  it("the same basis on both sides plans the products", async () => {
    const plan = await planWooCatalog(wooSnapshot(), EMPTY_DB, { currency: "DKK", pricesIncludeVat: false, sourcePricesIncludeVat: false });
    expect(plan.counts.products).toMatchObject({ create: 3, blocked: 0 });
  });
});
