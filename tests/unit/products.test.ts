import { describe, it, expect } from "vitest";
import { parseProductImages } from "@/lib/products";

describe("parseProductImages", () => {
  it("parser en JSON-array-streng til et array af URLs", () => {
    const result = parseProductImages('["https://a.dk/1.jpg","https://a.dk/2.jpg"]');
    expect(result).toEqual(["https://a.dk/1.jpg", "https://a.dk/2.jpg"]);
  });

  it("returnerer tomt array for ugyldig JSON", () => {
    expect(parseProductImages("ikke json")).toEqual([]);
  });

  it("returnerer tomt array for tom streng", () => {
    expect(parseProductImages("")).toEqual([]);
  });
});
