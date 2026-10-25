import { describe, it, expect } from "vitest";
import { buildProductQuery } from "@/lib/catalog";
import { CATEGORY_IN_LIST_MAX } from "@/lib/category-tree";
import { fitsPrismaSqlite } from "../helpers/prisma-binds";

describe("buildProductQuery", () => {
  it("returnerer tomt where og nyeste-sortering uden params", () => {
    const { where, orderBy } = buildProductQuery({});
    expect(where).toEqual({});
    expect(orderBy).toEqual({ createdAt: "desc" });
  });

  it("søger på navn, brand ELLER beskrivelse for ét ord", () => {
    // Beskrivelsen kom med: storefront-søgningen var den snævreste af husets
    // tre implementeringer og kiggede slet ikke i description, så "bright"
    // kunne ikke finde et produkt hvis beskrivelse ordret siger
    // "Bright, floral single-origin".
    const { where } = buildProductQuery({ q: "skagen" });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "skagen" } },
            { brand: { contains: "skagen" } },
            { description: { contains: "skagen" } },
          { slug: { contains: "skagen" } },
          ],
        },
      ],
    });
  });

  it("kræver ALLE ord ved flerordssøgning", () => {
    // Den målte fejl: `contains` på hele frasen gjorde søgningen
    // tegnsætnings-eksakt og ordre-følsom. "bright floral" gav 0 live, alene
    // fordi et komma stod imellem ordene i beskrivelsen.
    const { where } = buildProductQuery({ q: "bright single-origin" });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "bright" } },
            { brand: { contains: "bright" } },
            { description: { contains: "bright" } },
          { slug: { contains: "bright" } },
          ],
        },
        {
          OR: [
            { name: { contains: "single" } },
            { brand: { contains: "single" } },
            { description: { contains: "single" } },
          { slug: { contains: "single" } },
          ],
        },
        {
          OR: [
            { name: { contains: "origin" } },
            { brand: { contains: "origin" } },
            { description: { contains: "origin" } },
          { slug: { contains: "origin" } },
          ],
        },
      ],
    });
  });

  it("en søgning uden brugbare ord matcher INTET — ikke hele kataloget", () => {
    // Omvendt af den oprindelige beslutning her, og med vilje. PLP'en og
    // /api/products/search deler nu én matcher; JS-siden svarer 0 på sådan en
    // søgning. Lod vi PLP'en være ufiltreret, ville de to døre være uenige
    // igen — og at vise hele kataloget under overskriften "resultater for ☕"
    // fortæller både kunden og en crawler, at vi sælger det hele under det ord.
    expect(buildProductQuery({ q: "  ,  " }).where).toEqual({
      AND: [{ id: { in: [] } }],
    });
    expect(buildProductQuery({ q: "☕" }).where).toEqual({
      AND: [{ id: { in: [] } }],
    });
  });

  it("en TOM søgning filtrerer stadig ikke", () => {
    // Grænsen mellem de to: intet indtastet = intet filter.
    expect(buildProductQuery({ q: "" }).where).toEqual({});
    expect(buildProductQuery({}).where).toEqual({});
  });

  it("filtrerer på kategori-slug via relation", () => {
    const { where } = buildProductQuery({ kategori: "herre" });
    expect(where).toEqual({ category: { slug: "herre" } });
  });

  it("filtrerer på stelfarve, glasfarve og brand", () => {
    const { where } = buildProductQuery({
      stelfarve: "Sort",
      glasfarve: "Brun",
      brand: "Solir",
    });
    expect(where).toEqual({ frameColor: "Sort", lensColor: "Brun", brand: "Solir" });
  });

  it("konverterer prisinterval fra kroner til øre", () => {
    const { where } = buildProductQuery({ minPris: "300", maxPris: "800" });
    expect(where).toEqual({ priceDkk: { gte: 30000, lte: 80000 } });
  });

  it("ignorerer ugyldige prisværdier", () => {
    const { where } = buildProductQuery({ minPris: "abc" });
    expect(where).toEqual({});
  });

  it("oversætter sort-værdier", () => {
    expect(buildProductQuery({ sort: "pris-op" }).orderBy).toEqual({ priceDkk: "asc" });
    expect(buildProductQuery({ sort: "pris-ned" }).orderBy).toEqual({ priceDkk: "desc" });
    expect(buildProductQuery({ sort: "nyeste" }).orderBy).toEqual({ createdAt: "desc" });
  });

  it("kombinerer flere filtre", () => {
    const { where } = buildProductQuery({ kategori: "dame", brand: "Bølge", minPris: "500" });
    expect(where).toEqual({
      category: { slug: "dame" },
      brand: "Bølge",
      priceDkk: { gte: 50000 },
    });
  });
});

/**
 * A long query must not become a database error.
 *
 * Each token expands to an OR over four `contains` legs — four bind params —
 * and Prisma's SQLite/libSQL client refuses a query above 999 of them. So the
 * AND-over-tokens change introduced an input-length cliff on a public,
 * unauthenticated GET: measured, the last working query was 249 tokens and 250
 * threw P2029. Pasting a paragraph into a search box is not an attack, and the
 * single-`contains` clause this replaced could not care how long a query was.
 */
describe("en meget lang søgning bliver ikke til en databasefejl", () => {
  const legsPerToken = 4; // name, brand, description, slug

  it("kapper token-antallet langt under Prismas parametergrænse", () => {
    const q = Array.from({ length: 400 }, (_, i) => `ord${i}`).join(" ");
    const and = buildProductQuery({ q }).where.AND as unknown[];
    expect(and.length).toBeLessThanOrEqual(32);
    expect(and.length * legsPerToken).toBeLessThan(999);
  });

  it("kapper OGSÅ når ordene er ens (dedupe før cap)", () => {
    const and = buildProductQuery({ q: Array(400).fill("kaffe").join(" ") })
      .where.AND as unknown[];
    expect(and.length).toBe(1);
  });

  it("rører ikke en normal søgning", () => {
    // Grænsen må ikke ændre adfærd for noget et menneske faktisk skriver.
    // Bindestregen splitter: bright | floral | single | origin.
    const and = buildProductQuery({ q: "bright floral single-origin" })
      .where.AND as unknown[];
    expect(and.length).toBe(4);
  });

  it("beholder de FØRSTE ord, ikke tilfældige", () => {
    const q = ["kaffe", ...Array.from({ length: 100 }, (_, i) => `x${i}`)].join(" ");
    const and = buildProductQuery({ q }).where.AND as Array<{ OR: Array<{ name?: { contains: string } }> }>;
    expect(and[0].OR[0].name?.contains).toBe("kaffe");
  });
});

/**
 * WP2-r1′-b: `/produkter?kategori=<parent>` lists its subcategories' products,
 * like the category page. The page hands its category rows in; the query
 * stays a pure function of them.
 */
describe("the category filter follows the category tree", () => {
  const cat = (id: string, parentId: string | null) => ({ id, parentId, slug: `${id}-slug` });
  const FLAT = [cat("c-tea", null), cat("c-coffee", null)];
  const NESTED = [cat("c-hegn", null), cat("c-komposit", "c-hegn"), cat("c-type1", "c-komposit")];

  it("a flat shop's filter is the exact where it was without the tree, key order included", () => {
    const params = { q: "sencha", kategori: "c-tea-slug", brand: "Leaf", minPris: "10" };
    // Written from origin/main's buildProductQuery (before the tree).
    const main = {
      AND: [
        {
          OR: [
            { name: { contains: "sencha" } },
            { brand: { contains: "sencha" } },
            { description: { contains: "sencha" } },
            { slug: { contains: "sencha" } },
          ],
        },
      ],
      category: { slug: "c-tea-slug" },
      brand: "Leaf",
      priceDkk: { gte: 1000 },
    };
    expect(JSON.stringify(buildProductQuery(params, FLAT).where)).toBe(JSON.stringify(main));
    // The PLP passes no rows when it has no filter or the category read failed.
    expect(JSON.stringify(buildProductQuery(params).where)).toBe(JSON.stringify(main));
  });

  it("a parent's filter takes in every category below it, by id", () => {
    const { where } = buildProductQuery({ kategori: "c-hegn-slug" }, NESTED);
    expect(where).toStrictEqual({ categoryId: { in: ["c-hegn", "c-komposit", "c-type1"] } });
  });

  it("a leaf, an unknown slug and no rows keep the relation clause", () => {
    expect(buildProductQuery({ kategori: "c-type1-slug" }, NESTED).where).toStrictEqual({
      category: { slug: "c-type1-slug" },
    });
    expect(buildProductQuery({ kategori: "nope" }, NESTED).where).toStrictEqual({
      category: { slug: "nope" },
    });
    expect(buildProductQuery({ kategori: "c-hegn-slug" }, []).where).toStrictEqual({
      category: { slug: "c-hegn-slug" },
    });
  });

  it("no kategori: the tree changes nothing", () => {
    expect(buildProductQuery({ brand: "Leaf" }, NESTED).where).toStrictEqual({ brand: "Leaf" });
  });

  // CATEGORY-IN-LIST-BIND-LIMIT: the busiest catalogue query — the longest
  // search it keeps (32 tokens × 4 legs) and every other filter — must still
  // fit beside the largest `in` list, and a wider subtree must not grow it.
  const everyFilter = (kategori: string) => ({
    q: Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "),
    kategori,
    brand: "Leaf",
    stelfarve: "black",
    glasfarve: "grey",
    minPris: "1",
    maxPris: "2",
  });
  const wide = (n: number) => [cat("c-root", null), ...Array.from({ length: n }, (_, i) => cat(`c${i}`, "c-root"))];

  it("the largest `in` list still leaves room for the longest search and every other filter", () => {
    const { where } = buildProductQuery(everyFilter("c-root-slug"), wide(CATEGORY_IN_LIST_MAX - 1));
    expect((where.categoryId as { in: string[] }).in).toHaveLength(CATEGORY_IN_LIST_MAX);
    expect(fitsPrismaSqlite(where)).toBe(true);
  });

  it("a subtree of 2,000 categories keeps the same query under the bind ceiling", () => {
    const { where } = buildProductQuery(everyFilter("c-root-slug"), wide(2000));
    expect(where.categoryId).toBeUndefined();
    expect(where.category).toBeDefined();
    expect(fitsPrismaSqlite(where)).toBe(true);
  });
});
