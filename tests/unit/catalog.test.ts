import { describe, it, expect } from "vitest";
import { buildProductQuery } from "@/lib/catalog";

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
