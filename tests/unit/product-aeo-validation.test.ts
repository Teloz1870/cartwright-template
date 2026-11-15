import { describe, it, expect } from "vitest";
import { productSchema } from "@/lib/validation";

/** Minimum gyldigt produkt-form-objekt (alle felter som strings, som FormData). */
function base(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Product",
    slug: "test-product",
    description: "A valid description over ten characters.",
    priceKr: "299",
    stock: "5",
    categoryId: "cat1",
    ...overrides,
  };
}

describe("productSchema — AEO felter", () => {
  it("parser uden AEO-felter (alle optional → tom/null)", () => {
    const r = productSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.answerSummary).toBe("");
      expect(r.data.faq).toBeUndefined();
      expect(r.data.useCases).toBeNull();
      expect(r.data.comparisonFacts).toBeNull();
    }
  });

  it("accepterer en gyldig faq JSON-array", () => {
    const faq = '[{"q":"Spørgsmål?","a":"Svar."}]';
    const r = productSchema.safeParse(base({ faq }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.faq).toBe(faq);
  });

  it("afviser faq der ikke er en JSON-array", () => {
    const r = productSchema.safeParse(base({ faq: '{"q":"x","a":"y"}' }));
    expect(r.success).toBe(false);
  });

  it("afviser faq med ugyldig JSON", () => {
    const r = productSchema.safeParse(base({ faq: "ikke json" }));
    expect(r.success).toBe(false);
  });

  it("parser gyldige useCases til et typed array", () => {
    const r = productSchema.safeParse(
      base({ useCases: '[{"title":"Daglig brug","description":"Til hver dag."}]' }),
    );
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.useCases).toEqual([
        { title: "Daglig brug", description: "Til hver dag." },
      ]);
  });

  it("afviser useCases der mangler description", () => {
    const r = productSchema.safeParse(base({ useCases: '[{"title":"Kun titel"}]' }));
    expect(r.success).toBe(false);
  });

  it("afviser useCases der ikke er en array", () => {
    const r = productSchema.safeParse(base({ useCases: '{"title":"x","description":"y"}' }));
    expect(r.success).toBe(false);
  });

  it("parser gyldige comparisonFacts til et objekt", () => {
    const r = productSchema.safeParse(
      base({ comparisonFacts: '{"vs_standard":"Bedre","weight":"let"}' }),
    );
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.comparisonFacts).toEqual({ vs_standard: "Bedre", weight: "let" });
  });

  it("afviser comparisonFacts som array", () => {
    const r = productSchema.safeParse(base({ comparisonFacts: "[]" }));
    expect(r.success).toBe(false);
  });

  it("afviser comparisonFacts med ikke-string værdi", () => {
    const r = productSchema.safeParse(base({ comparisonFacts: '{"a":1}' }));
    expect(r.success).toBe(false);
  });

  it("afviser comparisonFacts med farlig prototype-key", () => {
    const r = productSchema.safeParse(base({ comparisonFacts: '{"__proto__":"x"}' }));
    expect(r.success).toBe(false);
  });

  it("afviser answerSummary over 500 tegn", () => {
    const r = productSchema.safeParse(base({ answerSummary: "a".repeat(501) }));
    expect(r.success).toBe(false);
  });

  it("accepterer answerSummary inden for grænsen", () => {
    const r = productSchema.safeParse(base({ answerSummary: "Et kort svar-først lead." }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.answerSummary).toBe("Et kort svar-først lead.");
  });
});
