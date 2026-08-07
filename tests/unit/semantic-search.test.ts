import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Hul A — hybrid semantisk søgning. Tester rangerings-matematikken (ægte
 * cosineSimilarity fra `ai`) + de bløde fallbacks der garanterer "ingen
 * regression". prisma + embedQuery er mocket; query-/produkt-vektorer er
 * 3-dim for læsbarhed.
 */

const mocks = vi.hoisted(() => ({
  embedQuery: vi.fn(),
  embedTexts: vi.fn(),
  resolveEmbedder: vi.fn(),
  isPostgresDriver: vi.fn(() => false),
  prisma: {
    productEmbedding: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/ai/embeddings", () => ({
  embedQuery: mocks.embedQuery,
  embedTexts: mocks.embedTexts,
  resolveEmbedder: mocks.resolveEmbedder,
}));
vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
  isPostgresDriver: mocks.isPostgresDriver,
}));

import { hybridRankProducts } from "@/lib/search/semantic";
import { productEmbeddingText } from "@/lib/search/product-embeddings";

const MODEL = "google:text-embedding-004";

beforeEach(() => {
  mocks.embedQuery.mockReset();
  mocks.prisma.productEmbedding.findMany.mockReset();
  mocks.prisma.$queryRaw.mockReset();
  // Default: Turso/SQLite-stien (TS-cosine). Postgres-grenen testes separat.
  mocks.isPostgresDriver.mockReset().mockReturnValue(false);
});

describe("hybridRankProducts — semantisk ordering", () => {
  it("rangerer den semantisk nærmeste vektor først", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.productEmbedding.findMany.mockResolvedValue([
      { productId: "a", vectorJson: JSON.stringify([0, 1, 0]) }, // cosine 0
      { productId: "b", vectorJson: JSON.stringify([1, 0, 0]) }, // cosine 1
    ]);

    const ranked = await hybridRankProducts(
      "noget",
      [
        { id: "a", haystack: "alpha" },
        { id: "b", haystack: "beta" },
      ],
      10,
    );

    expect(ranked).toEqual(["b", "a"]);
  });

  it("respekterer limit", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.productEmbedding.findMany.mockResolvedValue([
      { productId: "a", vectorJson: JSON.stringify([1, 0, 0]) },
      { productId: "b", vectorJson: JSON.stringify([0.9, 0.1, 0]) },
      { productId: "c", vectorJson: JSON.stringify([0, 1, 0]) },
    ]);

    const ranked = await hybridRankProducts(
      "x",
      [
        { id: "a", haystack: "" },
        { id: "b", haystack: "" },
        { id: "c", haystack: "" },
      ],
      2,
    );

    expect(ranked).toHaveLength(2);
    expect(ranked).toEqual(["a", "b"]);
  });
});

describe("hybridRankProducts — leksikalsk boost", () => {
  it("løfter et eksakt frase-match over en semantisk uafgjort", async () => {
    // Begge produkter er semantisk neutrale (cosine 0 mod query), men 'a' har
    // frasen i sit haystack → phrase-boost skubber den øverst.
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.productEmbedding.findMany.mockResolvedValue([
      { productId: "a", vectorJson: JSON.stringify([0, 1, 0]) },
      { productId: "b", vectorJson: JSON.stringify([0, 1, 0]) },
    ]);

    const ranked = await hybridRankProducts(
      "blue mug",
      [
        { id: "a", haystack: "en flot blue mug i keramik" },
        { id: "b", haystack: "rød flaske" },
      ],
      10,
    );

    expect(ranked?.[0]).toBe("a");
  });
});

describe("hybridRankProducts — bløde fallbacks (ingen regression)", () => {
  it("returnerer null på tom query (kalder ikke embedding)", async () => {
    const ranked = await hybridRankProducts("   ", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
  });

  it("returnerer null når ingen embedding-provider er konfigureret", async () => {
    mocks.embedQuery.mockResolvedValue(null);
    const ranked = await hybridRankProducts("noget", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
  });

  it("returnerer null når kataloget ikke er embeddet endnu", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.productEmbedding.findMany.mockResolvedValue([]);
    const ranked = await hybridRankProducts("noget", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
  });

  it("ignorerer vektorer med forkert dimension (model-mismatch)", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.productEmbedding.findMany.mockResolvedValue([
      { productId: "a", vectorJson: JSON.stringify([1, 0]) }, // forkert dim
    ]);
    const ranked = await hybridRankProducts("noget", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
  });
});

describe("hybridRankProducts — Postgres/pgvector-gren (Hul A-2)", () => {
  beforeEach(() => {
    mocks.isPostgresDriver.mockReturnValue(true);
  });

  it("rangerer via $queryRaw (cosine-afstand) + leksikalsk boost — paritet med TS", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    // ANN-laget returnerer id + cosine-afstand (mindre = tættere). 'b' tættest.
    mocks.prisma.$queryRaw.mockResolvedValue([
      { productId: "b", distance: 0.0 }, // sem 1.0
      { productId: "a", distance: 1.0 }, // sem 0.0
    ]);

    const ranked = await hybridRankProducts(
      "noget",
      [
        { id: "a", haystack: "alpha" },
        { id: "b", haystack: "beta" },
      ],
      10,
    );

    expect(mocks.prisma.$queryRaw).toHaveBeenCalled();
    // Postgres-grenen rører ALDRIG TS-findMany-stien.
    expect(mocks.prisma.productEmbedding.findMany).not.toHaveBeenCalled();
    expect(ranked).toEqual(["b", "a"]);
  });

  it("lader leksikalsk boost vippe en semantisk uafgjort", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    // Lige tætte (samme afstand) → phrase-boost på 'a' afgør.
    mocks.prisma.$queryRaw.mockResolvedValue([
      { productId: "a", distance: 0.5 },
      { productId: "b", distance: 0.5 },
    ]);

    const ranked = await hybridRankProducts(
      "blue mug",
      [
        { id: "a", haystack: "en flot blue mug i keramik" },
        { id: "b", haystack: "rød flaske" },
      ],
      10,
    );

    expect(ranked?.[0]).toBe("a");
  });

  it("falder blødt til leksikalsk (null) når ANN-queryen intet returnerer", async () => {
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    const ranked = await hybridRankProducts("noget", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
  });

  it("falder blødt til leksikalsk (null) når ANN-queryen fejler (manglende kolonne/extension)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.embedQuery.mockResolvedValue({ vector: [1, 0, 0], modelId: MODEL });
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('type "vector" does not exist'));
    const ranked = await hybridRankProducts("noget", [{ id: "a", haystack: "x" }], 5);
    expect(ranked).toBeNull();
    errSpy.mockRestore();
  });
});

describe("productEmbeddingText", () => {
  it("samler navn, brand, kategori, beskrivelse og attribut-værdier", () => {
    const text = productEmbeddingText({
      id: "p1",
      name: "Aviator solbrille",
      brand: "Ray-Ban",
      description: "Klassisk pilot-model",
      attributes: { frameColor: "guld", lensColor: "grøn", size: 58 },
      category: { name: "Solbriller" },
    });
    expect(text).toContain("Aviator solbrille");
    expect(text).toContain("Ray-Ban");
    expect(text).toContain("Solbriller");
    expect(text).toContain("Klassisk pilot-model");
    expect(text).toContain("guld");
    expect(text).toContain("58");
  });

  it("håndterer manglende felter uden at fejle", () => {
    const text = productEmbeddingText({
      id: "p2",
      name: "Bare et navn",
      brand: null,
      description: null,
      attributes: null,
      category: null,
    });
    expect(text).toBe("Bare et navn");
  });
});
