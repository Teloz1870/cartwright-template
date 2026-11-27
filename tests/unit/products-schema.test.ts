import { describe, it, expect } from "vitest";
import { productsJsonSchema } from "@/industry-templates/products-schema";

const validRow = {
  name: "Aviator Black",
  slug: "aviator-black",
  description: "Klassisk aviator i sort metal.",
  priceDkk: 79900, // ØRE (799 DKK)
  images: ["https://cdn.example.com/aviator-black-1.jpg"],
  stock: 12,
  categorySlug: "solbriller",
};

describe("productsJsonSchema (Track 1C)", () => {
  it("accepterer en valid række", () => {
    const result = productsJsonSchema.safeParse([validRow]);
    expect(result.success).toBe(true);
  });

  it("accepterer optional eyewear-felter (frameColor, lensColor, brand, featured)", () => {
    const result = productsJsonSchema.safeParse([
      {
        ...validRow,
        frameColor: "black",
        lensColor: "smoke",
        brand: "AcmeOptics",
        featured: true,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepterer flere rækker", () => {
    const result = productsJsonSchema.safeParse([
      validRow,
      { ...validRow, slug: "aviator-gold", name: "Aviator Gold" },
    ]);
    expect(result.success).toBe(true);
  });

  it("afviser slug med store bogstaver med per-row path", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, slug: "Aviator-Black" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("slug"));
      expect(issue).toBeDefined();
      expect(issue?.path[0]).toBe(0);
      expect(issue?.path[1]).toBe("slug");
    }
  });

  it("afviser slug med specialtegn", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, slug: "aviator black!" },
    ]);
    expect(result.success).toBe(false);
  });

  it("afviser tom slug", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, slug: "" },
    ]);
    expect(result.success).toBe(false);
  });

  it("afviser non-int priceDkk (float)", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, priceDkk: 79900.5 },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("priceDkk"));
      expect(issue).toBeDefined();
    }
  });

  it("afviser non-int priceDkk (string)", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, priceDkk: "799" as unknown as number },
    ]);
    expect(result.success).toBe(false);
  });

  it("afviser negativ priceDkk", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, priceDkk: -100 },
    ]);
    expect(result.success).toBe(false);
  });

  it("afviser manglende required-felter", () => {
    const { slug, ...withoutSlug } = validRow;
    void slug;
    const result = productsJsonSchema.safeParse([withoutSlug]);
    expect(result.success).toBe(false);
  });

  it("afviser non-array root", () => {
    const result = productsJsonSchema.safeParse(validRow);
    expect(result.success).toBe(false);
  });

  it("afviser non-url i images", () => {
    const result = productsJsonSchema.safeParse([
      { ...validRow, images: ["not-a-url"] },
    ]);
    expect(result.success).toBe(false);
  });

  it("rapporterer fejl pr. række med korrekt index", () => {
    const result = productsJsonSchema.safeParse([
      validRow,
      { ...validRow, slug: "BAD-SLUG" },
      validRow,
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === 1 && i.path[1] === "slug",
      );
      expect(issue).toBeDefined();
    }
  });
});
