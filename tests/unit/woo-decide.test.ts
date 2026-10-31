import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";

import { decide, withoutExactStock, type Decision, type SourceVerdict, type UpdateProductPayload, type WooSrc } from "@/lib/woo/decide";
import { groupFp, groupNames, groupStates, type WooBaseEntry, type WooKind } from "@/lib/woo/groups";
import { WOO_SOURCE, htmlDecoder, mapWooCatalog, type HtmlDecode, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import type { WooSnapshot, WooStock } from "@/lib/woo/types";
import { WooView, ownedCategory, ownedProduct, type WooDbRow, type WooDbState } from "@/lib/woo/view";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-2a-1 — the importer's ONE verdict (lib/woo/decide.ts), pure: the
 * precedence of its four levels, the per-group three-way, and the gates of a
 * write. Test names carry the failure class they pin (W21-live-2 spec
 * 2026-10-25, §4); the DB-backed halves of those classes come with the apply
 * slices. The source's own verdict (L2) is an input here, as the plan hands it over.
 */

let decode: HtmlDecode;
beforeAll(async () => {
  decode = await htmlDecoder();
});

const ORPHAN: SourceVerdict = { action: "orphan", reason: "it has no category" };
const NO_VAT_BASIS: SourceVerdict = { action: "blocked", reason: "taxBasisUnknown: nobody has said whether the shop's prices include VAT" };
const TWIN: SourceVerdict = { action: "conflict", reason: 'keyDuplicated: sku "IDA-1" is also claimed by Woo product 105' };

function pick<T extends { externalId: string }>(rows: T[], id: string): T {
  const row = rows.find((r) => r.externalId === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

/** The snapshot as decide() reads it: each mapped row (a product with its type), and an L2 verdict when given. */
function sources(snap: WooSnapshot = wooSnapshot()) {
  const mapped = mapWooCatalog(snap, decode);
  const types = new Map(snap.products.map((p) => [String(p.id), p.type]));
  const category = (id: string): WooSrc => ({ kind: "category", row: pick(mapped.categories, id) });
  const product = (id: string, type = types.get(id) ?? "simple", verdict?: SourceVerdict): WooSrc => ({ kind: "product", row: pick(mapped.products, id), type, verdict });
  return { mapped, category, product };
}

/** The DB an earlier run of `snap` left: every row ours, its owned fields as mapped. Ids `c-<Woo id>`, `p-<Woo id>`. */
function imported(snap: WooSnapshot = wooSnapshot()): WooDbState {
  const { categories, products } = mapWooCatalog(snap, decode);
  const keys = (r: MappedCategory | MappedProduct, prefix: string) => ({ id: `${prefix}-${r.externalId}`, source: WOO_SOURCE, externalId: r.externalId, slug: r.slug, permalink: r.permalink });
  return {
    categories: categories.map((c): WooDbRow => ({ ...keys(c, "c"), parentId: c.parentExternalId === null ? null : `c-${c.parentExternalId}`, owned: c })),
    products: products.map((p): WooDbRow => ({ ...keys(p, "p"), sku: p.sku, deletedAt: null, owned: p })),
  };
}

/** The baseline a run that wrote `row` as the source sent it keeps: every group saw = wrote = its fingerprint. */
function entry(kind: WooKind, row: MappedCategory | MappedProduct, rowId: string, saw?: null): WooBaseEntry {
  const fp = (g: ReturnType<typeof groupNames>[number]) => groupFp(kind, g, row);
  return { rowId, groups: Object.fromEntries(groupNames(kind).map((g) => [g, { saw: saw === null ? null : fp(g), wrote: fp(g) }])) };
}

const stockOf = (rows: Record<string, Partial<WooStock>>) =>
  new Map(Object.entries(rows).map(([id, s]) => [id, { id: Number(id), manage_stock: true, stock_quantity: 5, stock_status: "instock", ...s }]));
const EXACT = stockOf({ "101": {} });

function own(db: WooDbState, kind: WooKind, id: string): WooDbRow {
  const row = (kind === "category" ? db.categories : db.products).find((r) => r.externalId === id);
  if (!row?.owned) throw new Error(`no imported ${kind} ${id}`);
  return row;
}

describe("decide — precedence: one order, first match wins", () => {
  type Cond = "vat" | "orphan" | "twin" | "keyTaken" | "noPrice" | "dependency";
  const L2: Partial<Record<Cond, SourceVerdict>> = { vat: NO_VAT_BASIS, orphan: ORPHAN, twin: TWIN };
  /** Product 101 (simple, priced, filed under 11) with the given conditions made true; never imported. */
  function verdict(conds: Cond[], type?: string): Decision {
    const on = (c: Cond) => conds.includes(c);
    const snap = wooSnapshot();
    if (on("noPrice")) snap.products[0].prices.price = "";
    const db: WooDbState = { categories: on("dependency") ? [] : imported().categories, products: [] };
    if (on("keyTaken")) db.products.push({ id: "p-csv", source: "csv", externalId: null, slug: "andet", permalink: null, sku: "IDA-1" });
    const source = conds.map((c) => L2[c]).find((v) => v !== undefined);
    return decide(sources(snap).product("101", type, source), new WooView(db), undefined, EXACT);
  }

  const table: [Cond[], string, RegExp | null][] = [
    [[], "create", null],
    [["dependency"], "blocked", /^dependencyMissing:/],
    [["noPrice", "dependency"], "blocked", /^noPrice:/],
    [["keyTaken", "noPrice", "dependency"], "conflict", /^keyTaken: sku "IDA-1" is taken by csv product p-csv/],
    [["twin", "keyTaken", "noPrice"], "conflict", /^keyDuplicated:/],
    [["orphan", "keyTaken", "noPrice", "dependency"], "orphan", /^it has no category/],
    [["vat", "keyTaken", "noPrice", "dependency"], "blocked", /^taxBasisUnknown:/],
  ];

  it.each(table)("a simple product with %j ⇒ %s", (conds, action, reason) => {
    const d = verdict(conds);
    expect(d.action).toBe(action);
    if (reason) expect(d.reason).toMatch(reason);
  });

  it("decide › unsupported type wins every cell (R1R2-TYPE-GATE-SHADOWED)", () => {
    for (const type of ["variable", "grouped", "external"]) {
      for (const [conds] of table) {
        const d = verdict(conds, type);
        expect([d.action, d.reason], `${type} × ${conds.join("+")}`).toEqual(["skip", expect.stringMatching(new RegExp(`^unsupportedType: an? ${type} product is not imported`))]);
        expect(d.write).toBeUndefined();
      }
    }
  });

  it("the source's own verdict outranks a row deleted here, and the product type outranks both (L1, L2, then L3)", () => {
    const db = imported();
    const row = own(db, "product", "101");
    const base = entry("product", row.owned as MappedProduct, "p-101");
    const s = sources();
    const hardDeleted = new WooView({ categories: db.categories, products: [] });
    const softDeleted = new WooView({ categories: db.categories, products: [{ ...row, deletedAt: new Date("2026-10-01T00:00:00Z") }] });
    for (const view of [hardDeleted, softDeleted]) {
      expect(decide(s.product("101", undefined, ORPHAN), view, base, EXACT)).toMatchObject({ action: "orphan", reason: ORPHAN.reason });
      expect(decide(s.product("101", undefined, NO_VAT_BASIS), view, base, EXACT)).toMatchObject({ action: "blocked", reason: NO_VAT_BASIS.reason });
      expect(decide(s.product("101", "variable"), view, base, EXACT).reason).toMatch(/^unsupportedType:/);
      expect(decide(s.product("101"), view, base, EXACT).reason).toMatch(/^deletedHere:/); // no verdict: L3 speaks
    }
  });
});

describe("decide — the per-group three-way (source, DB here, baseline)", () => {
  /** Product 101 imported; `src` edits the snapshot, `here` the row as this shop holds it now, `base` the baseline (an object: those groups differ from a plain re-run's). */
  function threeWay(opts: { src?: (s: WooSnapshot) => void; here?: (p: MappedProduct) => MappedProduct; base?: "none" | "fallback" | WooBaseEntry["groups"] }): Decision {
    const snap = wooSnapshot();
    opts.src?.(snap);
    const db = imported();
    const row = own(db, "product", "101");
    const before = row.owned as MappedProduct;
    row.owned = opts.here ? opts.here(before) : before;
    const last = entry("product", before, "p-101", opts.base === "fallback" ? null : undefined);
    const base = opts.base === "none" ? undefined : typeof opts.base === "object" ? { ...last, groups: { ...last.groups, ...opts.base } } : last;
    return decide(sources(snap).product("101"), new WooView(db), base, EXACT);
  }
  const newPrice = (s: WooSnapshot) => {
    s.products[0].prices.price = "69900";
  };
  const newName = (s: WooSnapshot) => {
    s.products[0].name = "Table lamp Ida (new)";
  };
  const editedName = (p: MappedProduct) => ({ ...p, name: "Ida, edited here" });
  const relisted = (s: WooSnapshot) => {
    s.products[0].categories.reverse();
  };
  /** A baseline group from a run long ago: neither what the source says now nor what is here now. */
  const OLD = { saw: "older", wrote: "older" };

  it.each([
    ["source = DB, baseline (src, src)", {}, "unchanged", undefined],
    ["Woo lists the same categories in another order", { src: relisted }, "unchanged", undefined],
    ["Woo lists the same categories in another order, no baseline", { src: relisted, base: "none" as const }, "unchanged", undefined],
    ["source changed, DB still at the baseline", { src: newPrice }, "update", undefined],
    ["DB edited here, source still at the baseline", { here: editedName }, "skip", /^localEdit:/],
    ["both changed the same group", { src: newName, here: editedName }, "conflict", /^bothChanged:/],
    ["source changed one group, DB another", { src: newPrice, here: editedName }, "conflict", /^bothChanged:/],
    ["no baseline and source ≠ DB", { src: newPrice, base: "none" as const }, "conflict", /^noBaseline:/],
  ])("%s ⇒ %s", (_label, opts, action, reason) => {
    const d = threeWay(opts);
    expect(d.action).toBe(action);
    if (reason) expect(d.reason).toMatch(reason);
  });

  it("an update writes only the groups the source changed: a price edit carries no core and no stock", () => {
    const d = threeWay({ src: newPrice });
    expect(d.write).toMatchObject({ kind: "product", op: "update", id: "p-101", groups: ["price"] });
    expect(d.write?.payload).toEqual({ price: { priceDkk: 69900 } });
  });

  it("an update writes only the groups the source changed: a name edit carries no price", () => {
    const d = threeWay({ src: newName });
    expect(d.write).toMatchObject({ kind: "product", op: "update", groups: ["core"] });
    expect(Object.keys(d.write?.payload ?? {})).toEqual(["core"]);
  });

  it("an update's row as written keeps the id it has here: recorded, it is that row and not a new one", () => {
    expect(threeWay({ src: newName }).write?.after.id).toBe("p-101");
    expect(threeWay({ src: newPrice }).write?.after.id).toBe("p-101");
  });

  it("decide › a core update keeps the price here: a missing price blocks a create, not a name change (W21-live-2a-1 R1)", () => {
    // Woo renames the product and sends no usable price: the price group is unknown, so the update writes core alone.
    const d = threeWay({ src: (s) => {
      newName(s);
      s.products[0].prices.price = "";
    } });
    expect(d).toMatchObject({ action: "update", write: { kind: "product", op: "update", groups: ["core"] } });
    expect(Object.keys(d.write?.payload ?? {})).toEqual(["core"]);
    expect((d.write?.after.owned as MappedProduct).priceDkk).toBe(79900); // the row as written keeps this shop's price
  });

  it("agreeing with no baseline yet records the baseline, with no catalogue write (R1-BASELINE-DROPPED-ON-ZERO-WRITE)", () => {
    const d = threeWay({ base: "none" });
    expect([d.action, d.refresh, d.write]).toEqual(["unchanged", ["core", "price"], undefined]);
    expect(threeWay({}).refresh).toEqual([]);
  });

  it.each([
    ["saw is a fallback the source now confirms", (fp: string) => ({ saw: null, wrote: fp })],
    ["saw is an older value the source has come back from", (fp: string) => ({ saw: "older", wrote: fp })],
    ["wrote is an older value, and the row here has moved to what the source sends", (fp: string) => ({ saw: fp, wrote: "older" })],
  ])("both sides agree while %s: the baseline is recorded anew, with no catalogue write", (_label, group) => {
    // Left as it is, the next run would misread a later edit here or a later change at the source.
    const d = threeWay({ base: { core: group(groupFp("product", "core", pick(sources().mapped.products, "101"))) } });
    expect([d.action, d.refresh, d.write]).toEqual(["unchanged", ["core"], undefined]);
  });

  it("decide › a local edit keeps the edit, and a group both sides agree on is still recorded", () => {
    const d = threeWay({ here: editedName, base: { price: OLD } });
    expect(d).toMatchObject({ action: "skip", reason: expect.stringMatching(/^localEdit:/), refresh: ["price"] });
    expect(d.write).toBeUndefined();
  });

  it("decide › an update writes the group that changed, and a group both sides agree on is still recorded", () => {
    expect(threeWay({ src: newPrice, base: { core: OLD } })).toMatchObject({ action: "update", refresh: ["core"], write: { groups: ["price"] } });
  });

  it("decide › a conflict records nothing: which side is right is the owner's to say", () => {
    expect(threeWay({ src: newName, here: editedName, base: { price: OLD } })).toMatchObject({ action: "conflict", refresh: [] });
  });

  it("decide › a write the gates refuse records nothing either", () => {
    const toUnknownCategory = (s: WooSnapshot) => {
      s.products[0].categories = [{ id: 88, slug: "ukendt" }];
    };
    expect(threeWay({ src: toUnknownCategory, base: { price: OLD } })).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^dependencyMissing:/), refresh: [] });
  });

  it("decide › local edit over fallback is skip (R5-CARRIED-FALLBACK-IN-BASELINE-ON-WRITE)", () => {
    // saw = null: what was written was our fallback, never a value the source confirmed.
    expect(threeWay({ here: editedName, base: "fallback" })).toMatchObject({ action: "skip", reason: expect.stringMatching(/^localEdit:/) });
    expect(threeWay({ src: newName, here: editedName, base: "fallback" }).action).toBe("skip");
    expect(threeWay({ src: newName, base: "fallback" }).action).toBe("update"); // untouched here: the source's value lands
  });

  it("decide › absent price never refreshes (R3-UNCHANGED-NOPRICE-BASELINE)", () => {
    // Here 0 kr, Woo sends no price: the price group is unknown — never compared, never recorded as the source's 0.
    const d = threeWay({ src: (s) => (s.products[0].prices.price = ""), here: (p) => ({ ...p, priceDkk: 0 }), base: "none" });
    expect([d.action, d.refresh]).toEqual(["unchanged", ["core"]]);
  });

  const zeroHere = (p: MappedProduct) => ({ ...p, priceDkk: 0 });
  const zeroAtSource = (s: WooSnapshot) => {
    s.products[0].prices.price = "0";
  };

  it("decide › a price the source drops to 0 is an update that writes the 0 (INV-10)", () => {
    const d = threeWay({ src: zeroAtSource });
    expect(d).toMatchObject({ action: "update", write: { kind: "product", op: "update", id: "p-101", groups: ["price"] } });
    expect(d.write?.payload).toEqual({ price: { priceDkk: 0 } });
    expect((d.write?.after.owned as MappedProduct).priceDkk).toBe(0);
  });

  it("decide › a 0 stored here is a value: recorded when the source agrees, an edit when it does not, and kept by a core update (INV-10)", () => {
    expect(threeWay({ src: zeroAtSource, here: zeroHere, base: "none" })).toMatchObject({ action: "unchanged", refresh: ["core", "price"] });
    expect(threeWay({ here: zeroHere })).toMatchObject({ action: "skip", reason: expect.stringMatching(/^localEdit:/) });
    const renamed = threeWay({
      here: zeroHere,
      src: (s) => {
        newName(s);
        s.products[0].prices.price = "";
      },
    });
    expect(renamed).toMatchObject({ action: "update", write: { groups: ["core"] } });
    expect((renamed.write?.after.owned as MappedProduct).priceDkk).toBe(0);
  });

  it("decide › yoast-less shop still refreshes (R5-CARRIED-FLAG-TOO-COARSE)", () => {
    // A group that is by design not ours this run (W21-live-4's Yoast group on a shop without Yoast) holds back no other group.
    const db = imported();
    const row = own(db, "product", "101");
    row.owned = { ...(row.owned as MappedProduct), priceDkk: 1 };
    const src: WooSrc = { ...sources().product("101"), states: { core: "confirmed", price: "notOwned" } };
    const d = decide(src, new WooView(db), undefined, EXACT);
    expect([d.action, d.refresh]).toEqual(["unchanged", ["core"]]);
  });
});

describe("decide — rows deleted, replaced or keyed elsewhere here (L3)", () => {
  it("a soft-deleted row is never updated, whatever the source says (R1R2-SOFT-DELETE-NOT-PROJECTED)", () => {
    const snap = wooSnapshot();
    snap.products[0].prices.price = "69900";
    const db = imported();
    const row = own(db, "product", "101");
    row.deletedAt = new Date("2026-10-01T00:00:00Z");
    const d = decide(sources(snap).product("101"), new WooView(db), entry("product", row.owned as MappedProduct, "p-101"), EXACT);
    expect(d).toMatchObject({ action: "skip", dbId: "p-101", reason: expect.stringMatching(/^deletedHere:/) });
    expect(d.write).toBeUndefined();
  });

  it("a row deleted here after a run imported it is not created again (LATENT-LOCAL-HARD-DELETE-RESURRECTED)", () => {
    const db = imported();
    db.categories = db.categories.filter((c) => c.externalId !== "12");
    const src = sources().category("12");
    expect(decide(src, new WooView(db), entry("category", src.row, "c-12"), null)).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere:/) });
    expect(decide(src, new WooView(db), undefined, null).action).toBe("create"); // never imported: a create
  });

  it("another row now holding the identity an earlier run wrote is a conflict", () => {
    const src = sources().category("12");
    expect(decide(src, new WooView(imported()), entry("category", src.row, "c-old"), null)).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^replacedHere: .*c-old.*c-12/) });
  });

  it("a permalink held in the OTHER table, in another spelling, is a conflict (R4-CROSS-TABLE-PERMALINK-CLAIM)", () => {
    const db: WooDbState = { categories: [...imported().categories, { id: "c-hand", source: null, externalId: null, slug: "ida", permalink: "/lamper/bordlamper/bordlampe-ida" }], products: [] };
    expect(decide(sources().product("101"), new WooView(db), undefined, EXACT)).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: permalink .* is taken by a hand-made category c-hand/) });
  });

  it("every row holding a key counts: the row itself, read last, hides no other holder", () => {
    const db = imported();
    const row = own(db, "product", "101");
    db.categories.push({ id: "c-hand", source: null, externalId: null, slug: "ida-kategori", permalink: row.permalink });
    const d = decide(sources().product("101"), new WooView(db), entry("product", row.owned as MappedProduct, "p-101"), EXACT);
    expect(d).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: permalink .* category c-hand/) });
  });

  it("a permalink with no path of its own is no key: two rows holding one do not collide", () => {
    const view = new WooView({ categories: [{ id: "c-hand", source: null, externalId: null, slug: "hand", permalink: "/?product=x" }], products: [] });
    expect(view.holder("product", { slug: "other", permalink: "/?page_id=2" })).toBeNull();
  });
});

describe("decide — whose row it is, and the keys it holds (L3, WooView)", () => {
  it("a slug is unique per table: the same slug on a category is no conflict for a product, and one on a product is", () => {
    const hand: WooDbRow = { id: "x-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null };
    const categories = imported().categories;
    expect(decide(sources().product("101"), new WooView({ categories: [...categories, hand], products: [] }), undefined, EXACT).action).toBe("create");
    expect(decide(sources().product("101"), new WooView({ categories, products: [hand] }), undefined, EXACT)).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: slug/) });
  });

  it("a row read without its owned fields is a conflict: never unchanged, never a write", () => {
    const db = imported();
    const row = own(db, "product", "101");
    const base = entry("product", row.owned as MappedProduct, "p-101");
    delete row.owned;
    const d = decide(sources().product("101"), new WooView(db), base, EXACT);
    expect(d).toMatchObject({ action: "conflict", dbId: "p-101", reason: expect.stringMatching(/^noProjection:/) });
    expect(d.write).toBeUndefined();
  });

  it.each(["csv", null])("a row with source %s under the same external id is not ours: not decided as ours, and no dependency (INV-15)", (source) => {
    const db = imported();
    const foreign = (id: string, externalId: string): WooDbRow => ({ id, source, externalId, slug: `other-${externalId}`, permalink: null, sku: null });
    db.categories = db.categories.map((c) => (c.externalId === "11" ? foreign("c-other", "11") : c));
    db.products = [foreign("p-other", "101")];
    const view = new WooView(db);
    expect(view.own("category", "11")).toBeUndefined();
    expect(view.own("product", "101")).toBeUndefined();
    expect(view.resolveCategory("11")).toBeNull();
    // Nothing of ours holds 101, and its category 11 does not resolve to the other row: no write can touch either.
    expect(decide(sources().product("101"), view, undefined, EXACT)).toMatchObject({ action: "blocked", reason: "dependencyMissing: its category 11 does not exist here" });
  });

  it("a key a recorded write gave up is free for the next row, and the key it took is held (WooView.record)", () => {
    const snap = wooSnapshot();
    Object.assign(snap.categories[0], { slug: "lighting", permalink: "https://shop.example.test/lighting/" }); // 10 gives up "lamper"…
    Object.assign(snap.categories[3], { slug: "lamper", permalink: "https://shop.example.test/lamper/" }); // …and 20 takes it over
    const s = sources(snap);
    const db = imported();
    const view = new WooView(db);
    const base = (id: string) => entry("category", own(db, "category", id).owned as MappedCategory, `c-${id}`);
    expect(decide(s.category("20"), view, base("20"), null)).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: slug "lamper" is taken by woocommerce category c-10/) });
    const renamed = decide(s.category("10"), view, base("10"), null);
    if (!renamed.write) throw new Error("no write");
    view.record(view.own("category", "10"), renamed.write.after);
    expect(decide(s.category("20"), view, base("20"), null).action).toBe("update");
    expect(view.holder("category", { slug: "lighting", permalink: null })?.by.id).toBe("c-10");
  });

  it("a write recorded in a preview holds every key it took for the rows after it, the permalink in either table", () => {
    const s = sources();
    const view = new WooView({ categories: [], products: [] });
    const lamper = decide(s.category("10"), view, undefined, null);
    if (!lamper.write) throw new Error("no write");
    view.record(undefined, lamper.write.after);
    expect(view.holder("category", { slug: "lamper", permalink: null })?.by.id).toBe("new:10");
    expect(view.holder("product", { slug: "other", permalink: "/lamper/" })?.by.id).toBe("new:10");
    const filed = new WooView({ categories: imported().categories, products: [] });
    const ida = decide(s.product("101"), filed, undefined, EXACT);
    if (!ida.write) throw new Error("no write");
    filed.record(undefined, ida.write.after);
    expect(filed.holder("product", { slug: "bordlampe-ida", permalink: null })?.by.id).toBe("new:101");
    expect(filed.holder("product", { slug: "other", permalink: null, sku: "IDA-1" })?.by.id).toBe("new:101");
    expect(filed.holder("category", { slug: "other", permalink: "/lamper/bordlamper/bordlampe-ida/" })?.by.id).toBe("new:101");
  });

  it("a recorded write takes the row as it was out of the view: its identity and its place in the tree", () => {
    const view = new WooView(imported());
    const before = view.own("category", "11"); // Lamper › Bordlamper › Messing
    if (!before) throw new Error("no row");
    expect(view.loops("c-10", "c-11")).toBe(true);
    view.record(before, { ...before, id: "c-new", externalId: "99", parentId: null });
    expect(view.own("category", "11")).toBeUndefined();
    expect(view.own("category", "99")?.id).toBe("c-new");
    expect(view.loops("c-10", "c-11")).toBe(false); // nothing above c-11 any more
  });

  it("a recorded write to a row that is not ours leaves our row's identity alone, though both carry one Woo id", () => {
    const db = imported();
    const foreign: WooDbRow = { id: "c-csv", source: "csv", externalId: "11", slug: "csv-kategori", permalink: null };
    const view = new WooView({ categories: [...db.categories, foreign], products: [] });
    view.record({ ...foreign, kind: "category" }, { ...foreign, kind: "category", slug: "renamed" });
    expect(view.own("category", "11")?.id).toBe("c-11");
  });

  it("a product recorded in a preview is no step of the parent walk: Woo numbers terms and posts apart, so a category and a product can both be new:20", () => {
    const view = new WooView({ categories: [{ id: "new:20", source: WOO_SOURCE, externalId: "20", slug: "a", permalink: null, parentId: "new:10" }], products: [] });
    expect(view.loops("new:10", "new:20")).toBe(true);
    view.record(undefined, { kind: "product", id: "new:20", source: WOO_SOURCE, externalId: "20", slug: "b", permalink: null });
    expect(view.loops("new:10", "new:20")).toBe(true);
  });
});

describe("decide — the gates of a write (L4)", () => {
  it("decide › a missing price blocks a create: no price is ever written as 0 (R1-NOPRICE-AS-ZERO)", () => {
    const snap = wooSnapshot();
    snap.products[0].prices.price = "";
    const d = decide(sources(snap).product("101"), new WooView({ categories: imported().categories, products: [] }), undefined, EXACT);
    expect(d).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^noPrice:/) });
    expect(d.write).toBeUndefined();
  });

  it("decide › a price of 0 is a price: it creates at 0, where a missing price blocks (INV-10)", () => {
    const snap = wooSnapshot();
    snap.products[0].prices.price = "0";
    const d = decide(sources(snap).product("101"), new WooView({ categories: imported().categories, products: [] }), undefined, EXACT);
    expect(d).toMatchObject({ action: "create", write: { kind: "product", op: "create", groups: ["core", "price"], payload: { priceDkk: 0 }, after: { owned: { priceDkk: 0 } } } });
  });

  it("a create reports every group it writes, since the baseline is recorded from these (spec §3F S6)", () => {
    const filed = new WooView({ categories: imported().categories, products: [] });
    expect(decide(sources().product("101"), filed, undefined, EXACT).write).toMatchObject({ kind: "product", op: "create", groups: ["core", "price"] });
    expect(decide(sources().category("10"), new WooView({ categories: [], products: [] }), undefined, null).write).toMatchObject({ kind: "category", op: "create", groups: ["core"] });
  });

  it("decide › stock gates apply to create only (R1-STOCK-GATE-ON-UPDATE)", () => {
    const create = (stock: ReadonlyMap<string, WooStock> | null) => decide(sources().product("101"), new WooView({ categories: imported().categories, products: [] }), undefined, stock);
    expect(create(new Map()).reason).toMatch(/^noExactStock:/);
    for (const s of [{ manage_stock: false }, { stock_quantity: null }, { stock_quantity: 1.5 }, { stock_quantity: 2 ** 40 }, { stock_quantity: -(2 ** 40) }]) {
      expect(create(stockOf({ "101": s })), JSON.stringify(s)).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^stockUntracked:/) });
    }
    expect(create(EXACT).write?.payload).toMatchObject({ stock: 5, priceDkk: 79900, categoryId: "c-11" });
    // A dry run that read no stock still says create, and has nothing to write.
    expect([create(null).action, create(null).write]).toEqual(["create", undefined]);

    const snap = wooSnapshot();
    snap.products[0].prices.price = "69900";
    const db = imported();
    const base = entry("product", own(db, "product", "101").owned as MappedProduct, "p-101");
    for (const stock of [new Map(), stockOf({ "101": { manage_stock: false } })]) {
      const update = decide(sources(snap).product("101"), new WooView(db), base, stock);
      expect(update.action).toBe("update");
      expect(update.write?.payload).not.toHaveProperty("stock");
    }
    // @ts-expect-error — an update payload has no stock key: what orders here sold stays sold (R1-STOCK-UPDATE-OVERWRITE).
    const noStock: UpdateProductPayload = { stock: 1 };
    expect(noStock).toBeDefined();
  });

  it("negative stock is created as 0, with a warning (R4-NEGATIVE-STOCK-CLAMP)", () => {
    const d = decide(sources().product("101"), new WooView({ categories: imported().categories, products: [] }), undefined, stockOf({ "101": { stock_quantity: -3 } }));
    expect(d.write?.payload).toMatchObject({ stock: 0 });
    expect(d.warnings).toContainEqual(expect.objectContaining({ code: "stockClamped", externalId: "101" }));
  });

  it("a sold-out product is an exact count too: stock 0 creates at 0, with no warning", () => {
    const d = decide(sources().product("101"), new WooView({ categories: imported().categories, products: [] }), undefined, stockOf({ "101": { manage_stock: true, stock_quantity: 0 } }));
    expect(d).toMatchObject({ action: "create", write: { kind: "product", op: "create", payload: { stock: 0 } } });
    expect(d.warnings).toEqual([]);
  });

  it("decide › withoutExactStock counts facts (R1-COUNTER-FROM-REASON-STRINGS)", () => {
    const snap = wooSnapshot();
    snap.products.push({ ...structuredClone(snap.products[0]), id: 104, slug: "ida-mini", sku: "MINI", permalink: "https://shop.example.test/lamper/bordlamper/ida-mini/" });
    const s = sources(snap);
    const products = ["101", "102", "103", "104"].map((id) => s.product(id, undefined, NO_VAT_BASIS)); // every product blocked at L2
    const rows = products.flatMap((p) => (p.kind === "product" ? [{ row: p.row, type: p.type }] : []));
    const stock = stockOf({ "104": { manage_stock: false } }); // 101: no answer; 102/103 are not simple
    const view = new WooView({ categories: imported().categories, products: [] });
    expect(products.map((p) => decide(p, view, undefined, stock).reason ?? "")).toEqual([
      expect.stringMatching(/^taxBasisUnknown/), expect.stringMatching(/^unsupportedType/), expect.stringMatching(/^unsupportedType/), expect.stringMatching(/^taxBasisUnknown/),
    ]);
    expect(withoutExactStock(rows, view, {}, stock)).toBe(2);
    const withIda = new WooView({ categories: imported().categories, products: [imported().products[0]] });
    expect(withoutExactStock(rows, withIda, {}, stock)).toBe(1); // already here: an update needs no stock
    expect(withoutExactStock(rows, withIda, { "104": entry("product", pick(s.mapped.products, "104"), "p-104") }, stock)).toBe(0); // imported once, deleted here
  });

  it("a refused parent leaves its child blocked, never a root (R5-REFUSED-PARENT-CREATE-REROOTS-CHILD)", () => {
    const s = sources();
    const view = new WooView({ categories: [], products: [] });
    const lamper = decide(s.category("10"), view, undefined, null);
    expect(lamper.action).toBe("create");
    // 10's write did not land: it is not in the view, so 11 does not resolve its parent.
    expect(decide(s.category("11"), view, undefined, null)).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 10 does not exist here" });
    if (!lamper.write) throw new Error("no write");
    view.record(undefined, lamper.write.after);
    expect(decide(s.category("11"), view, undefined, null).write?.payload).toMatchObject({ parentId: "new:10", source: WOO_SOURCE, externalId: "11" });
  });

  it("a move under a parent that does not exist here is blocked, and does not throw (R5-REFUSED-PARENT-UPDATE-THROWS)", () => {
    const snap = wooSnapshot();
    snap.categories[2].parent = 20; // Messing moves under Skærme…
    const db = imported();
    db.categories = db.categories.filter((c) => c.externalId !== "20"); // …which is not here
    const before = own(db, "category", "12").owned as MappedCategory;
    expect(decide(sources(snap).category("12"), new WooView(db), entry("category", before, "c-12"), null)).toMatchObject({ action: "blocked", reason: "dependencyMissing: parent 20 does not exist here" });
  });

  it("a price update needs no category: only a write of core does", () => {
    const snap = wooSnapshot();
    snap.products[0].prices.price = "69900";
    const db = imported();
    const row = own(db, "product", "101");
    const base = entry("product", row.owned as MappedProduct, "p-101");
    db.categories = db.categories.filter((c) => c.externalId !== "11"); // its primary category is gone here
    const d = decide(sources(snap).product("101"), new WooView(db), base, EXACT);
    expect(d).toMatchObject({ action: "update", write: { groups: ["price"] } });
    expect(d.write?.payload).toEqual({ price: { priceDkk: 69900 } });
  });

  it("a refused primary category blocks the product; a refused secondary one is dropped (R5-REFUSED-CATEGORY-FAILS-OR-MISFILES-PRODUCT)", () => {
    const without = (...ids: string[]) => new WooView({ categories: imported().categories.filter((c) => !ids.includes(c.externalId ?? "")), products: [] });
    const dropped = decide(sources().product("101"), without("12"), undefined, EXACT);
    expect(dropped.action).toBe("create");
    expect(dropped.warnings).toContainEqual(expect.objectContaining({ code: "extraCategoryDropped", detail: expect.stringMatching(/category 12/) }));
    expect(dropped.write?.payload).toMatchObject({ categoryId: "c-11", extraCategoryIds: ["c-10"] });
    expect(dropped.write?.after.owned).toMatchObject({ extraCategoryExternalIds: ["10"] });
    expect(decide(sources().product("101"), without("11"), undefined, EXACT)).toMatchObject({ action: "blocked", reason: "dependencyMissing: its category 11 does not exist here" });
  });

  it("a dropped secondary category is no change on the next run, with its warning, and the update after it exists adds it (R5-REFUSED-CATEGORY-FAILS-OR-MISFILES-PRODUCT)", () => {
    const s = sources();
    const all = imported().categories;
    const without12 = all.filter((c) => c.externalId !== "12");
    const created = decide(s.product("101"), new WooView({ categories: without12, products: [] }), undefined, EXACT);
    const written = created.write?.after.owned as MappedProduct;
    expect(written.extraCategoryExternalIds).toEqual(["10"]);
    const row: WooDbRow = { ...imported().products[0], owned: written };
    const base = entry("product", written, "p-101");
    const again = decide(s.product("101"), new WooView({ categories: without12, products: [row] }), base, EXACT);
    expect([again.action, again.refresh]).toEqual(["unchanged", []]);
    expect(again.warnings).toContainEqual(expect.objectContaining({ code: "extraCategoryDropped" }));
    expect(decide(s.product("101"), new WooView({ categories: all, products: [row] }), base, EXACT)).toMatchObject({ action: "update", write: { groups: ["core"], payload: { core: { extraCategoryIds: ["c-10", "c-12"] } } } });
  });

  it.each([
    ["a local edit", { edit: true, change: false, baseline: true }, "skip"],
    ["both sides changed", { edit: true, change: true, baseline: true }, "conflict"],
    ["no baseline", { edit: true, change: false, baseline: false }, "conflict"],
  ])("a dropped secondary category is said on a verdict that writes nothing too: %s", (_label, { edit, change, baseline }, action) => {
    const snap = wooSnapshot();
    if (change) snap.products[0].name = "Changed at the source";
    const db = imported();
    db.categories = db.categories.filter((c) => c.externalId !== "12");
    const row = own(db, "product", "101");
    const filed = { ...(row.owned as MappedProduct), extraCategoryExternalIds: ["10"] };
    row.owned = edit ? { ...filed, name: "Edited here" } : filed;
    const d = decide(sources(snap).product("101"), new WooView(db), baseline ? entry("product", filed, "p-101") : undefined, EXACT);
    expect(d.action).toBe(action);
    expect(d.warnings).toContainEqual(expect.objectContaining({ code: "extraCategoryDropped", externalId: "101" }));
  });

  it("a recorded move is what the next loop check walks: the move that would close a loop over it is refused (INV-12)", () => {
    const db = imported();
    const base = (id: string) => entry("category", own(db, "category", id).owned as MappedCategory, `c-${id}`);
    const snap = wooSnapshot();
    snap.categories[3].parent = 12; // Skærme moves under Messing, the bottom of Lamper's chain…
    snap.categories[0].parent = 20; // …and Lamper under Skærme.
    const s = sources(snap);
    const view = new WooView(db);
    expect(decide(s.category("10"), view, base("10"), null).action).toBe("update"); // Skærme has not moved yet
    const moved = decide(s.category("20"), view, base("20"), null);
    if (!moved.write) throw new Error("no write");
    view.record(view.own("category", "20"), moved.write.after);
    expect(decide(s.category("10"), view, base("10"), null)).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^parentLoop:/) });
  });

  it("a partial run cannot close a parent loop, and a refused move blocks the move that needed it (R2-PARENT-LOOP-PARTIAL-SCOPE, R3-REFUSED-MOVE-CLOSES-LOOP)", () => {
    const db = imported();
    const base = (id: string) => entry("category", own(db, "category", id).owned as MappedCategory, `c-${id}`);
    const snap = wooSnapshot();
    snap.categories[0].parent = 11; // the source flips Lamper › Bordlamper …
    snap.categories[1].parent = 0; // … to Bordlamper › Lamper
    const s = sources(snap);
    const view = new WooView(db);
    // Lamper alone (Bordlamper's move left out, or refused): under Bordlamper, which still sits under Lamper here.
    expect(decide(s.category("10"), view, base("10"), null)).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^parentLoop:/) });
    const bordlamper = decide(s.category("11"), view, base("11"), null);
    if (!bordlamper.write) throw new Error("no write");
    view.record(view.own("category", "11"), bordlamper.write.after);
    expect(decide(s.category("10"), view, base("10"), null).write?.payload).toEqual({ slug: "lamper", name: "Lamper", permalink: "/lamper/", description: "Alle lamper.", parentId: "c-11" });
  });

  /** A sync walk that never ends also stops the timer a test timeout runs on, so the run would hang instead of fail: `vm`'s timeout ends it, as an error. */
  const ending = <T>(walk: () => T): T => runInNewContext("walk()", { walk }, { timeout: 5_000 }) as T;

  it.each<[string, Record<string, string | null>, string | null, boolean]>([
    ["a loop above it that does not run through it", { b: "c", c: "b" }, "b", true],
    ["a parent that is its own parent", { b: "b" }, "b", true],
    ["a loop further up the chain", { b: "c", c: "d", d: "e", e: "d" }, "b", true],
    ["a chain that reaches a root, with a loop beside it", { b: "c", c: null, x: "y", y: "x" }, "b", false],
    ["a parent the view does not hold", { b: "gone" }, "b", false],
    ["no parent at all, with a loop elsewhere", { x: "y", y: "x" }, null, false],
  ])("the walk to the root of a row under %s ends, and says whether it repeated (INV-12, spec §3F S5)", (_label, parents, under, repeats) => {
    const categories = Object.entries(parents).map(([id, parentId]): WooDbRow => ({ id, source: WOO_SOURCE, externalId: id, slug: id, permalink: null, parentId }));
    const view = new WooView({ categories, products: [] });
    expect(ending(() => view.loops("a", under))).toBe(repeats);
  });

  it("a category filed under a chain that loops above it here is blocked, on a move and on a create", () => {
    const db = imported();
    own(db, "category", "10").parentId = "c-20"; // Lamper and Skærme hold each other here: no row below them is in the loop
    own(db, "category", "20").parentId = "c-10";
    const snap = wooSnapshot();
    snap.categories[2].parent = 20; // Messing moves under Skærme
    const moved = ending(() => decide(sources(snap).category("12"), new WooView(db), entry("category", own(db, "category", "12").owned as MappedCategory, "c-12"), null));
    expect(moved).toMatchObject({ action: "blocked", reason: "parentLoop: under 20 its chain of parents would never reach a root here" });
    expect(moved.write).toBeUndefined();
    const above = new WooView({ categories: db.categories.filter((c) => c.externalId === "10" || c.externalId === "20"), products: [] });
    const created = ending(() => decide(sources().category("11"), above, undefined, null));
    expect(created).toMatchObject({ action: "blocked", reason: "parentLoop: under 10 its chain of parents would never reach a root here" });
    expect(created.write).toBeUndefined();
  });

  it("no payload value is ever undefined, across a whole preview of the fixture shop (INV-2)", () => {
    const s = sources();
    const view = new WooView({ categories: [], products: [] });
    const writes: unknown[] = [];
    for (const src of [...s.mapped.categories.map((c) => s.category(c.externalId)), ...s.mapped.products.map((p) => s.product(p.externalId, "simple"))]) {
      const d = decide(src, view, undefined, stockOf({ "101": {}, "102": {}, "103": {} }));
      if (d.write) {
        writes.push(d.write.payload);
        view.record(undefined, d.write.after);
      }
    }
    expect(writes).toHaveLength(4 + 2); // 103 has no price: blocked
    const undefinedAt = (v: unknown, path: string): string[] =>
      v === undefined ? [path] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => undefinedAt(x, `${path}.${k}`)) : [];
    expect(writes.flatMap((w, i) => undefinedAt(w, `#${i}`))).toEqual([]);
  });
});

describe("the row as mapped, as written and as read back are one form (spec §3F S5; on real columns: woo-readback-db.test.ts)", () => {
  it("a category with no description is none in all three, so what is written fingerprints as what was intended", () => {
    const src = sources().category("11"); // the fixture's description is empty
    const d = decide(src, new WooView({ categories: imported().categories.filter((c) => c.externalId === "10"), products: [] }), undefined, null);
    expect(d.write?.payload).toMatchObject({ description: null });
    expect(d.write?.after.owned).toMatchObject({ description: null });
    const read = ownedCategory({ id: "c-11", source: WOO_SOURCE, externalId: "11", slug: "bordlamper", name: "Bordlamper", permalink: "/lamper/bordlamper/", description: null, parent: { id: "c-10", source: WOO_SOURCE, externalId: "10" } });
    expect(read && groupFp("category", "core", read)).toBe(groupFp("category", "core", src.row));
  });

  it("a category with a description writes the description as mapped", () => {
    const src = sources().category("10");
    expect(decide(src, new WooView({ categories: [], products: [] }), undefined, null).write?.payload).toMatchObject({ description: "Alle lamper." });
  });

  const linked = (id: string, externalId: string | null, source: string | null = WOO_SOURCE) => ({ id, source, externalId });
  const storedCategory = { ...linked("c-11", "11"), slug: "bordlamper", name: "Bordlamper", permalink: null, description: "Text", parent: linked("c-10", "10") };
  const storedProduct = {
    ...linked("p-101", "101"), slug: "ida", name: "Ida", permalink: null, sku: "IDA-1", priceDkk: 79900, description: "", answerSummary: "Answer", attributes: { tags: ["new"] },
    category: linked("c-11", "11"), extraCategories: [{ category: linked("c-12", "12") }, { category: linked("c-10", "10") }],
  };

  it("a row that is not ours has no owned fields, whatever its id says (INV-15)", () => {
    for (const not of [linked("x", "11", "csv"), linked("x", "11", null), linked("x", null)]) {
      expect(ownedCategory({ ...storedCategory, ...not })).toBeUndefined();
      expect(ownedProduct({ ...storedProduct, ...not })).toBeUndefined();
    }
    expect(ownedCategory(storedCategory)).toEqual({ externalId: "11", slug: "bordlamper", name: "Bordlamper", permalink: null, parentExternalId: "10", description: "Text" });
    expect(ownedProduct(storedProduct)).toEqual({
      externalId: "101", slug: "ida", name: "Ida", permalink: null, sku: "IDA-1", priceDkk: 79900, categoryExternalId: "11", extraCategoryExternalIds: ["10", "12"], description: "", answerSummary: "Answer", attributes: { tags: ["new"] },
    });
  });

  it("secondary categories read back in the mapper's order, whatever order the link table hands them over in", () => {
    const snap = wooSnapshot();
    snap.products[0].categories = [100, 20, 3, 11].map((id) => ({ id, slug: `c-${id}` })); // 100 sorts before 20 as text, after it as a number
    const mapped = pick(sources(snap).mapped.products, "101").extraCategoryExternalIds;
    for (const ids of [["3", "20", "100"], ["100", "20", "3"], ["20", "100", "3"]]) {
      const read = ownedProduct({ ...storedProduct, extraCategories: ids.map((id) => ({ category: linked(`c-${id}`, id) })) });
      expect(read?.extraCategoryExternalIds, ids.join()).toEqual(mapped);
    }
  });

  it("an empty text or JSON null, as other save paths store it, reads as the absence the mapper writes: no local edit", () => {
    expect(ownedCategory({ ...storedCategory, description: "" })).toMatchObject({ description: null });
    expect(ownedCategory({ ...storedCategory, description: null })).toMatchObject({ description: null });
    expect(ownedProduct({ ...storedProduct, answerSummary: "", attributes: null })).toMatchObject({ answerSummary: null, attributes: {} });
    expect(ownedProduct({ ...storedProduct, answerSummary: null })).toMatchObject({ answerSummary: null });
  });

  it("a 0 read back is a value, in the group state and the fingerprint, where no price is unknown (INV-10)", () => {
    const read = ownedProduct({ ...storedProduct, priceDkk: 0 });
    if (!read) throw new Error("not ours");
    expect(read.priceDkk).toBe(0);
    expect(groupStates("product", read)).toEqual({ core: "confirmed", price: "confirmed" });
    const none = { ...read, priceDkk: null };
    expect(groupStates("product", none)).toEqual({ core: "confirmed", price: "unknown" });
    expect(groupFp("product", "price", read)).not.toBe(groupFp("product", "price", none));
  });

  it("a link to a row that is not ours gets a name no Woo id can equal, so moving a row under it reads as an edit here", () => {
    expect(ownedCategory({ ...storedCategory, parent: linked("c-hand", "10", "csv") })).toMatchObject({ parentExternalId: "local:c-hand" });
    expect(ownedCategory({ ...storedCategory, parent: null })).toMatchObject({ parentExternalId: null });
    const product = ownedProduct({ ...storedProduct, category: linked("c-hand", null, null), extraCategories: [{ category: linked("c-hand-2", null, null) }] });
    expect(product).toMatchObject({ categoryExternalId: "local:c-hand", extraCategoryExternalIds: ["local:c-hand-2"] });
  });
});

describe("lib/woo — no non-null assertion (META-PATCH-PER-SYMPTOM)", () => {
  it("the lint config makes `!` an error in lib/woo and nowhere else", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const rule = async (file: string) => (await eslint.calculateConfigForFile(file)).rules?.["@typescript-eslint/no-non-null-assertion"];
    expect(await rule("lib/woo/decide.ts")).toEqual([2]);
    expect(await rule("lib/urls.ts")).not.toEqual([2]);
  }, 60_000);
});
