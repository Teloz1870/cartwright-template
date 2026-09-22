/**
 * What a product specification may CONTAIN, and what every reader makes of it.
 *
 * The hole this locks: `lib/validation.ts` accepted string values only ("Kun
 * string-values for nu"), so the engine's OWN coffee seed (`roast: 2`,
 * `notes: ["bergamot", ...]` — industry-templates/coffee/seed-data.ts) could
 * not be written through the admin the engine ships with, while
 * `lib/products-csv.ts` had always accepted arbitrary JSON. Two write paths,
 * two answers.
 *
 * Scope note: this file covers the VALUE RULE and the read helpers. The admin
 * repeater that authors these values (`lib/product-spec-rows.ts`) and the PDP
 * spec table that renders them ship separately — see the tracks named in the
 * PR description — so nothing here asserts anything about a row editor.
 */
import { describe, expect, it } from "vitest";

import {
  displayAttributeValue,
  flattenPrimitiveAttributes,
  normalizeAttributeValue,
} from "@/lib/product-attributes";
import { productSchema } from "@/lib/validation";

/** Verbatim from industry-templates/coffee/seed-data.ts (Ethiopia Yirgacheffe). */
const COFFEE_SEED_ATTRIBUTES = {
  origin: "Ethiopia",
  strength: "bright",
  process: "Washed",
  roast: 2,
  notes: ["bergamot", "jasmine", "lemon"],
  weightG: 250,
} as const;

function parseAttributes(json: string) {
  const result = productSchema.safeParse({
    name: "Ethiopia Yirgacheffe",
    slug: "ethiopia-yirgacheffe",
    description: "A bright, floral washed Yirgacheffe.",
    priceKr: "139",
    stock: "10",
    categoryId: "cat_beans",
    attributes: json,
  });
  return result;
}

describe("product specifications — the write path (lib/validation.ts)", () => {
  it("accepts the engine's own coffee seed, numbers and lists included", () => {
    const result = parseAttributes(JSON.stringify(COFFEE_SEED_ATTRIBUTES));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attributes).toEqual(COFFEE_SEED_ATTRIBUTES);
  });

  it("accepts booleans", () => {
    const result = parseAttributes(JSON.stringify({ organic: true }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attributes).toEqual({ organic: true });
  });

  // Both negative cases assert the issue PATH, not just failure: the fixture
  // around them is shared, so "it failed" alone would also pass if the fixture
  // itself were invalid — which is exactly how the first draft of this file
  // went green while proving nothing.
  it("still rejects nested objects — every reader assumes a flat map", () => {
    const result = parseAttributes(JSON.stringify({ nested: { x: 1 } }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((i) => i.path.join("."))).toEqual(["attributes"]);
  });

  it("still rejects prototype-polluting keys", () => {
    const result = parseAttributes('{"__proto__": "x"}');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((i) => i.path.join("."))).toEqual(["attributes"]);
  });

  it("rejects invalid JSON", () => {
    const result = parseAttributes("{not json");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((i) => i.path.join("."))).toEqual(["attributes"]);
  });

  it("empty input still clears the blob", () => {
    const result = parseAttributes("");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attributes).toBeNull();
  });
});

describe("product specifications — the read paths", () => {
  it("the PDP formats numbers and lists that used to be dropped", () => {
    expect(displayAttributeValue(2)).toBe("2");
    expect(displayAttributeValue(["bergamot", "jasmine", "lemon"])).toBe(
      "bergamot, jasmine, lemon",
    );
    expect(displayAttributeValue(true)).toBe("true");
    expect(displayAttributeValue("Ethiopia")).toBe("Ethiopia");
  });

  it("the PDP shows nothing for empty or unrepresentable values", () => {
    expect(displayAttributeValue("   ")).toBeNull();
    expect(displayAttributeValue([])).toBeNull();
    expect(displayAttributeValue({ x: 1 })).toBeNull();
    expect(displayAttributeValue(null)).toBeNull();
  });

  it("machine surfaces keep the narrower primitive-only rule", () => {
    expect(flattenPrimitiveAttributes(COFFEE_SEED_ATTRIBUTES)).toEqual({
      origin: "Ethiopia",
      strength: "bright",
      process: "Washed",
      roast: "2",
      weightG: "250",
    });
    expect(flattenPrimitiveAttributes({ nested: { x: 1 } })).toBeUndefined();
    expect(flattenPrimitiveAttributes(null)).toBeUndefined();
  });

  it("normalizeAttributeValue signals rejection with undefined, not null", () => {
    expect(normalizeAttributeValue("x")).toBe("x");
    expect(normalizeAttributeValue(Number.NaN)).toBeUndefined();
    expect(normalizeAttributeValue([{ a: 1 }])).toBeUndefined();
  });
});


describe("product specifications — an empty list is allowed, on purpose", () => {
  it("accepts it, so a product that already stores one does not become unsaveable", () => {
    // The admin form's hidden input resubmits the stored blob verbatim, and
    // `lib/products-csv.ts`, sitepack restore, the scrape path and the Sheets
    // sync all JSON.parse straight into Prisma. Refusing `[]` therefore blocked
    // name/price/stock on any product that already had one — without the
    // merchant touching a single field. This assertion is the decision; the
    // eight lines of comment in lib/product-attributes.ts are only the reason.
    expect(parseAttributes(JSON.stringify({ notes: [], origin: "Ethiopia" })).success).toBe(true);
    expect(normalizeAttributeValue([])).toEqual([]);
  });

  it("still refuses a list with a non-primitive in it", () => {
    expect(normalizeAttributeValue([{ v: 1 }])).toBeUndefined();
    expect(parseAttributes(JSON.stringify({ notes: [{ v: 1 }] })).success).toBe(false);
  });
});
