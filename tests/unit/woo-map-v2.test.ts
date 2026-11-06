import { beforeAll, describe, expect, it, vi } from "vitest";

import { groupFp, groupStates, type GroupName, type WooKind } from "@/lib/woo/groups";
import { WOO_MAPPING_VERSION, htmlDecoder, mapWooCatalog, type HtmlDecode, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import type { WooSnapshot } from "@/lib/woo/types";
import { permalinkKey } from "@/lib/urls";
import { permalinkVariants } from "@/lib/woo/view";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-2a-1 — mapping v2 and its field groups: no price is never 0, the
 * projection owns no wp/v2 field, and each group fingerprints on its own.
 */

let decode: HtmlDecode;
beforeAll(async () => {
  decode = await htmlDecoder();
});

/** The fixture shop, edited, then mapped. */
const mappedWith = (edit: (snap: WooSnapshot) => void) => {
  const snap = wooSnapshot();
  edit(snap);
  return mapWooCatalog(snap, decode);
};

const ida = (price: string, minor = 2) => mappedWith((snap) => {
  Object.assign(snap.products[0].prices, { price, currency_minor_unit: minor });
});

describe("map v2", () => {
  it("map › absent price maps to null (R1-NOPRICE-AS-ZERO)", () => {
    for (const price of ["", "12.50", "-100", "abc", "4294967296", "9".repeat(30)]) {
      const { products, warnings } = ida(price);
      expect(products[0].priceDkk, price).toBeNull();
      expect(warnings, price).toContainEqual({ code: "noPrice", externalId: "101", detail: `price "${price}"` });
      expect(groupStates("product", products[0]).price, price).toBe("unknown");
    }
    expect(ida("79900").products[0].priceDkk).toBe(79900);
    expect(ida("799", 0).products[0].priceDkk).toBe(79900); // whole kroner, scaled
    expect(ida("1234", 3).products[0].priceDkk).toBe(123); // three decimals, rounded to øre
    expect(ida("0").products[0].priceDkk).toBe(0); // a real 0 is a price
    expect(ida("2147483647").products[0].priceDkk).toBe(2147483647); // the largest Int
    expect(ida("2147483648").products[0].priceDkk).toBeNull();
  });

  it("map › a category with no description maps to none, not to an empty string", () => {
    const { categories } = mapWooCatalog(wooSnapshot(), decode);
    expect(categories.map((c) => c.description)).toEqual(["Alle lamper.", null, null, null]);
  });

  it("map › secondary categories are sorted, wherever Woo lists them, as a read-back sorts them (spec §3A)", () => {
    // 11 stays primary wherever it is listed: its permalink is the deepest prefix of the product's.
    for (const ids of [[20, 12, 11, 10], [11, 20, 12, 10], [12, 10, 20, 11], [10, 11, 12, 20]]) {
      const [row] = mappedWith((s) => {
        s.products[0].categories = ids.map((id) => ({ id, slug: `c-${id}` }));
      }).products;
      expect([row.categoryExternalId, row.extraCategoryExternalIds], ids.join()).toEqual(["11", ["10", "12", "20"]]);
    }
  });

  it("map › a product filed nowhere has no category, not the text \"null\"", () => {
    const [row] = mappedWith((s) => {
      s.products[0].categories = [];
    }).products;
    expect([row.categoryExternalId, row.extraCategoryExternalIds]).toEqual([null, []]);
  });

  it("map › a category is primary only on a whole path prefix: /lamper is none of /lamper-led/ida", () => {
    const { products, warnings } = mappedWith((s) => {
      s.products[0].permalink = "https://shop.example.test/lamper-led/ida/";
      s.products[0].categories = [{ id: 20, slug: "sk%c3%a6rme" }, { id: 10, slug: "lamper" }];
    });
    expect(products[0].categoryExternalId).toBe("20"); // the first listed, and it says so
    expect(warnings).toContainEqual(expect.objectContaining({ code: "primaryCategoryFallback", externalId: "101" }));
  });

  it("map › a category the snapshot does not list is placed by the link on the product's own reference", () => {
    const [row] = mappedWith((s) => {
      s.products[0].permalink = "https://shop.example.test/outlet/ida/";
      s.products[0].categories = [{ id: 10, slug: "lamper" }, { id: 88, slug: "outlet", link: "https://shop.example.test/outlet/" }];
    }).products;
    expect(row.categoryExternalId).toBe("88");
  });

  it("map › a slug with nothing to keep becomes woo-<id>, with a warning", () => {
    const { products, warnings } = mappedWith((s) => {
      s.products[0].slug = "!!!";
    });
    expect(products[0].slug).toBe("woo-101");
    expect(warnings).toContainEqual({ code: "slugRewritten", externalId: "101", detail: "!!! → woo-101" });
  });

  it("map › a tag or term with no name is its slug, an attribute with no usable name attr-<id>, and a grouped product lists what it groups", () => {
    const { products } = mappedWith((s) => {
      Object.assign(s.products[0], { tags: [{ id: 41, slug: "nyhed" }], attributes: [{ id: 7, name: "!!!", terms: [{ id: 1, slug: "messing" }] }] });
    });
    expect(products[0].attributes).toEqual({ tags: ["nyhed"], "attr-7": ["messing"] });
    expect(products[2].attributes).toEqual({ groupedOf: ["101", "102"] });
  });

  it.each(["p", "page_id", "attachment_id", "post_type", "cat", "tag", "taxonomy", "term", "product", "product_cat", "product_tag", "product_brand"])(
    "map › a plain permalink, ?%s=, has no path of its own under any install path",
    (name) => {
      const { products, warnings } = mappedWith((s) => {
        s.products[0].permalink = `https://shop.example.test/wordpress/?${name}=1`;
      });
      expect(products[0].permalink).toBeNull();
      expect(warnings).toContainEqual(expect.objectContaining({ code: "permalinkUnset", externalId: "101" }));
    },
  );

  it("map › a permalink with no path at all has none; a query no plain permalink uses keeps its path", () => {
    const at = (permalink: string) => mappedWith((s) => {
      s.products[0].permalink = permalink;
    }).products[0].permalink;
    expect(at("https://shop.example.test/")).toBeNull();
    expect(at("https://shop.example.test/lamper/ida/?utm_source=x")).toBe("/lamper/ida/");
  });

  it("map › a summary stops at 500 UTF-16 units, as the admin's limit counts them, and never inside an emoji", () => {
    const summary = (short_description: string) => {
      const snap = wooSnapshot();
      snap.products[0].short_description = short_description;
      return mapWooCatalog(snap, decode).products[0].answerSummary;
    };
    expect(summary(`${"a".repeat(499)}😀 more`)).toBe("a".repeat(499)); // the pair straddles the limit: all of it goes
    expect(summary(`${"a".repeat(498)}😀 more`)).toBe(`${"a".repeat(498)}😀`); // the pair ends on the limit: it stays
    expect(summary("😀".repeat(300))).toBe("😀".repeat(250));
    expect(summary("a".repeat(600))).toBe("a".repeat(500));
    expect(summary("a".repeat(500))).toBe("a".repeat(500));
  });

  it.each([["a lone high surrogate", "\ud83d"], ["a lone low surrogate", "\ude00"], ["a NUL", "\0"]])("map › %s, wherever Woo sends text, maps to U+FFFD, as a column holds it", (_, bad) => {
    const sent = `a${bad}b`;
    const clean = "a\uFFFDb";
    const snap = wooSnapshot();
    Object.assign(snap.products[0], {
      name: sent, description: sent, short_description: sent, sku: sent, permalink: `/lamper/${sent}/`,
      tags: [{ id: 41, slug: "nyhed", name: sent }], attributes: [{ id: 7, name: "Materiale", terms: [{ id: 1, slug: "messing", name: sent }] }],
    });
    Object.assign(snap.categories[0], { name: sent, description: sent, permalink: `/lamper-${sent}/` });
    const { categories, products } = mapWooCatalog(snap, decode);
    expect(products[0]).toMatchObject({ name: clean, description: clean, answerSummary: clean, sku: clean, permalink: `/lamper/${clean}/`, attributes: { tags: [clean], materiale: [clean] } });
    expect(categories[0]).toMatchObject({ name: clean, description: clean, permalink: `/lamper-${clean}/` });
    // Every string a mapped row holds, whatever field a later mapping adds.
    const strings: string[] = [];
    JSON.stringify([categories, products], (key: string, value: unknown) => {
      strings.push(key);
      if (typeof value === "string") strings.push(value);
      return value;
    });
    expect(strings.length).toBeGreaterThan(40);
    expect(strings.filter((s) => !s.isWellFormed() || s.includes("\0"))).toEqual([]);
  });

  it("map › v2 projection has no wp fields (R4-CARRIED-FIELD-ADVANCES-BASELINE)", () => {
    expect(WOO_MAPPING_VERSION).toBe(2);
    const full = mapWooCatalog(wooSnapshot(), decode).products;
    const bare = wooSnapshot();
    bare.wpProducts = [];
    bare.meta.wpProducts = { complete: false, total: 3, fetched: 0 };
    for (const p of full) {
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(["status"]));
      expect(p).not.toHaveProperty("metaTitle");
      expect(p).not.toHaveProperty("metaDescription");
    }
    // Whether wp/v2 answered changes no group: nothing it sends is a value this importer owns.
    expect(mapWooCatalog(bare, decode).products.map((p) => [groupFp("product", "core", p), groupFp("product", "price", p)])).toEqual(
      full.map((p) => [groupFp("product", "core", p), groupFp("product", "price", p)]),
    );
  });
});

describe("field groups", () => {
  it("fingerprint a group's own fields only, per kind and group, in 32 hex characters", () => {
    const [p] = mapWooCatalog(wooSnapshot(), decode).products;
    const core = groupFp("product", "core", p);
    expect(core).toMatch(/^[0-9a-f]{32}$/);
    expect(groupFp("product", "core", { ...p, priceDkk: 1 })).toBe(core); // price is its own group
    expect(groupFp("product", "price", { ...p, priceDkk: 1 })).not.toBe(groupFp("product", "price", p));
    expect(groupFp("product", "core", { ...p, name: "x" })).not.toBe(core);
    expect(groupFp("product", "core", Object.fromEntries(Object.entries(p).reverse()) as typeof p)).toBe(core); // key order is not a change
    const [c] = mapWooCatalog(wooSnapshot(), decode).categories;
    expect(groupStates("category", c)).toEqual({ core: "confirmed" });
  });

  /** Every field a mapped row owns, with a value it does not hold in the fixture. */
  const OWNED: [WooKind, GroupName, string, unknown][] = [
    ["category", "core", "slug", "new"],
    ["category", "core", "name", "New"],
    ["category", "core", "permalink", "/new/"],
    ["category", "core", "parentExternalId", "99"],
    ["category", "core", "description", "New text"],
    ["product", "core", "slug", "new"],
    ["product", "core", "name", "New"],
    ["product", "core", "permalink", "/new/"],
    ["product", "core", "sku", "NEW-1"],
    ["product", "core", "categoryExternalId", "99"],
    ["product", "core", "extraCategoryExternalIds", ["99"]],
    ["product", "core", "description", "New text"],
    ["product", "core", "answerSummary", "New answer"],
    ["product", "core", "attributes", { colour: ["black"] }],
    ["product", "price", "priceDkk", 1],
  ];
  const fixtureRow = (kind: WooKind): MappedCategory | MappedProduct => {
    const { categories, products } = mapWooCatalog(wooSnapshot(), decode);
    return kind === "category" ? categories[0] : products[0];
  };

  it.each(OWNED)("a %s's %s group moves when %s changes", (kind, group, field, value) => {
    const row = fixtureRow(kind);
    expect(groupFp(kind, group, { ...row, [field]: value })).not.toBe(groupFp(kind, group, row));
  });

  it("every field a mapped row holds, but its identity, is in a group", () => {
    for (const kind of ["category", "product"] as const) {
      const fields = OWNED.filter(([k]) => k === kind).map(([, , field]) => field);
      expect(Object.keys(fixtureRow(kind)).filter((f) => f !== "externalId").sort()).toEqual(fields.sort());
    }
  });

  it("the mapping version is in the fingerprint: a bump moves every group", async () => {
    const row = fixtureRow("product");
    /** The fingerprints of `row` with the mapping at `version`. */
    const at = async (version: number) => {
      vi.resetModules();
      vi.doMock("@/lib/woo/map-catalog", async (original) => ({ ...(await original<typeof import("@/lib/woo/map-catalog")>()), WOO_MAPPING_VERSION: version }));
      const fresh = await import("@/lib/woo/groups");
      vi.doUnmock("@/lib/woo/map-catalog");
      vi.resetModules();
      return [fresh.groupFp("product", "core", row), fresh.groupFp("product", "price", row)];
    };
    const now = await at(WOO_MAPPING_VERSION);
    expect(now).toEqual([groupFp("product", "core", row), groupFp("product", "price", row)]); // the control
    const bumped = await at(WOO_MAPPING_VERSION + 1);
    expect(bumped[0]).not.toBe(now[0]);
    expect(bumped[1]).not.toBe(now[1]);
  });

  it("the kind is in the fingerprint: a category and a product with the same fields never share one", () => {
    const same = { externalId: "1", slug: "x", name: "X", permalink: null, description: null } as MappedCategory & MappedProduct;
    expect(groupFp("category", "core", same)).not.toBe(groupFp("product", "core", same));
  });

  it("the group is in the fingerprint: two groups over the same fields never share one", () => {
    const none = { externalId: "1" } as MappedProduct; // no field of either group: the name of the group is all that is left
    expect(groupFp("product", "core", none)).not.toBe(groupFp("product", "price", none));
  });

  it("key order inside attributes is no change, as a JSON column may hand it back in another order; a value is", () => {
    const row = fixtureRow("product");
    const attributes = { tags: ["new"], material: ["brass"] };
    const fp = groupFp("product", "core", { ...row, attributes });
    expect(groupFp("product", "core", { ...row, attributes: { material: ["brass"], tags: ["new"] } })).toBe(fp);
    expect(groupFp("product", "core", { ...row, attributes: { ...attributes, material: ["steel"] } })).not.toBe(fp);
    // …at any depth: a JSON column holds whatever was saved there, an object inside a list too.
    const nested = (x: unknown) => groupFp("product", "core", { ...row, attributes: { x } as unknown as Record<string, string[]> });
    expect(nested([{ b: 1, a: 2 }])).toBe(nested([{ a: 2, b: 1 }]));
  });

  it("a key holding undefined is no key: JSON has no undefined, so a row read back cannot hold one", () => {
    const row = fixtureRow("product");
    const attributes = { tags: ["new"] };
    const gone = { ...attributes, material: undefined } as unknown as Record<string, string[]>;
    expect(groupFp("product", "core", { ...row, attributes: gone })).toBe(groupFp("product", "core", { ...row, attributes }));
  });
});

describe("permalink variants", () => {
  it("every stored spelling of one address, all sharing its permalinkKey", () => {
    const raw = "https://shop.example.test/sk%c3%a6rme/lampes%c3%a6t-duo/";
    const variants = permalinkVariants(raw);
    expect(variants).toEqual(expect.arrayContaining([
      raw, "/skærme/lampesæt-duo", "/skærme/lampesæt-duo/", "/sk%C3%A6rme/lampes%C3%A6t-duo", "/sk%c3%a6rme/lampes%c3%a6t-duo/",
    ]));
    expect(new Set(variants.map(permalinkKey))).toEqual(new Set(["/skærme/lampesæt-duo"]));
    expect(permalinkVariants("/?product=x")).toEqual(["/?product=x"]); // no path: only itself
  });
});
