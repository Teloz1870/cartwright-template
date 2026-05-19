import { describe, it, expect } from "vitest";
import { buildProductQuery } from "@/lib/catalog";

describe("buildProductQuery", () => {
  it("returnerer tomt where og nyeste-sortering uden params", () => {
    const { where, orderBy } = buildProductQuery({});
    expect(where).toEqual({});
    expect(orderBy).toEqual({ createdAt: "desc" });
  });

  it("søger på navn eller brand for q", () => {
    const { where } = buildProductQuery({ q: "skagen" });
    expect(where).toEqual({
      OR: [
        { name: { contains: "skagen" } },
        { brand: { contains: "skagen" } },
      ],
    });
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
