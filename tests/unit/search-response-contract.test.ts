import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The brew recommendation reads fields off `/api/products/search` responses.
 * This test asserts it can only read fields the route actually EMITS.
 *
 * It exists because of a real defect that every other kind of test missed.
 * `resolveRecommendation` mapped `packSizeGrams` from the search response; the
 * route never sent it (the size lives inside `attributes.weightG`). The unit
 * test passed, because its fixture supplied the field — it was testing a shape
 * the production route does not produce, so on the live demo every answer
 * silently degraded to "pack size unknown" while the suite stayed green.
 *
 * A fixture can lie about the shape. The route's own source cannot, so that is
 * what this reads.
 */
const ROUTE = readFileSync(join(process.cwd(), "app/api/products/search/route.ts"), "utf8");
const CONSUMER = readFileSync(
  join(process.cwd(), "designs/crema/webshop/BrewWebMcpTools.tsx"),
  "utf8",
);

/** Keys of the object literal the route maps each product into. */
function emittedFields(): Set<string> {
  const start = ROUTE.indexOf("const formattedProducts = products.map((p) => {");
  if (start < 0) throw new Error("the route's response map moved — update this test's anchor");
  const returnStart = ROUTE.indexOf("return {", start);
  const body = ROUTE.slice(returnStart, ROUTE.indexOf("};", returnStart));
  const fields = new Set<string>();
  for (const m of body.matchAll(/^\s{6}([a-zA-Z][a-zA-Z0-9]*):/gm)) fields.add(m[1]);
  return fields;
}

/** Fields the brew tool reads off a raw search row (`p.<field>`). */
function consumedFields(): Set<string> {
  // The window starts at the FUNCTION, not at the candidates map.
  //
  // It used to start at `const candidates: CandidateProduct[] =`, and a read of
  // `p.categorySlug` — a field the route does not send — sat one line above
  // that anchor and sailed through. This test exists precisely to catch a
  // consumer reading a field the route never emits, and it missed one by a
  // single line. Anchoring at the function start covers every `p.<field>` read
  // in it, wherever a future one lands.
  const start = CONSUMER.indexOf("async function resolveRecommendation");
  if (start < 0) throw new Error("the brew tool's resolver moved — update this test's anchor");
  const body = CONSUMER.slice(start, CONSUMER.indexOf("}));", start));
  const fields = new Set<string>();
  for (const m of body.matchAll(/\bp\.([a-zA-Z][a-zA-Z0-9]*)/g)) fields.add(m[1]);
  return fields;
}

describe("the search route emits every field the brew tool consumes", () => {
  it("emits packSizeGrams — the field the live defect proved missing", () => {
    expect(emittedFields()).toContain("packSizeGrams");
  });

  it("leaves no consumed field unemitted", () => {
    const emitted = emittedFields();
    const missing = [...consumedFields()].filter((f) => !emitted.has(f));
    expect(missing, `read from a search row but never sent by the route: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("parses a non-trivial field set (guards against the regexes matching nothing)", () => {
    // Without this, deleting the whole response body would make the test above
    // pass vacuously — an empty set is a subset of everything.
    expect(emittedFields().size).toBeGreaterThan(5);
    expect(consumedFields().size).toBeGreaterThan(2);
  });
});

/**
 * The route resolves a locale for the URLs it returns. Every localisable thing
 * in the same response has to use it — the defect that started this work was
 * an English page showing "119,00 kr.", and a response that localises its
 * links while leaving its prices in the currency's default language reproduces
 * exactly that, one layer down.
 */
describe("the resolved locale reaches everything localisable in the response", () => {
  it("formats the money with it, not just the URL", () => {
    // Locale AND currency: the response localises its links, so leaving
    // either behind puts the agent in a different language or a different
    // currency than the page it is reading.
    expect(ROUTE).toMatch(/agentMoney\(p\.priceDkk,\s*locale,\s*currency\)/);
  });

  it("builds the product URL with it (the half that was already right)", () => {
    expect(ROUTE).toMatch(/\$\{brand\.url\}\/\$\{locale\}\/product\//);
  });
});

describe("legacy price and currency still name the same money", () => {
  it("derives both legacy fields from the converted unitPrice", () => {
    expect(ROUTE).toContain("price: unitPrice.amountMinor");
    expect(ROUTE).toContain("currency: unitPrice.currency");
    expect(ROUTE).toContain("basePriceMinor: p.priceDkk");
    expect(ROUTE).toContain("baseCurrency: brand.policies.currency");
  });
});

/**
 * The pack-size KEY, not just the field name.
 *
 * The contract test above compares field names, which is one layer too shallow
 * for this one: `packSizeOf` reads a key out of the free-form attributes bag,
 * and if that key were hardcoded here while the design pack renamed its own
 * vocabulary, the route would keep emitting `packSizeGrams` — name intact,
 * every value null. Green test, dead feature, exactly the degradation the file
 * was written to commemorate.
 */
describe("the route reads the pack size through the shared key", () => {
  it("references the constant rather than spelling the key out", () => {
    // Assert the READ SITE, not merely the presence of the name. Checking
    // `toContain("PACK_SIZE_ATTRIBUTE")` was satisfied by the surviving import
    // line alone — and the negative below forbade only DOT access, while the
    // code reads through a bracket off a Record cast. So inlining
    // `["weightG"]` and leaving the import passed all three assertions,
    // tsc and lint, and would have degraded every live pack size to null the
    // day the vocabulary was renamed.
    expect(ROUTE).toMatch(/\[\s*PACK_SIZE_ATTRIBUTE\s*\]/);
    expect(ROUTE, "a literal key here can drift from the vocabulary that owns it")
      .not.toMatch(/["'.]weightG\b/);
  });

  it("imports it from the CORE, not from a design pack", () => {
    // A pruned `light` scaffold has no designs/crema, so a core route
    // importing from it would not build (tests/unit/design-deep-imports).
    expect(ROUTE).toMatch(/PACK_SIZE_ATTRIBUTE[^;]*from "@\/lib\/product-attributes"/);
  });
});
