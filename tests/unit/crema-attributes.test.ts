/**
 * Crema coffee-attribute parser — the never-guess contract.
 *
 * The KZ-port rule these tests pin: a field that is missing or doesn't parse
 * yields null/[] (the caller omits the element) — never a fabricated value.
 * The per-kg helper must return null rather than a wrong figure.
 */
import { describe, expect, it } from "vitest";
import { brand } from "../../brand.config";
import { parseAgentReport } from "../../designs/crema/agent-report";
import {
  parseCoffeeAttributes,
  parseLocalizedCoffeeAttributes,
  perKgOere,
} from "../../designs/crema/webshop/attributes";
import { localizedAttributes } from "../../lib/product-attributes";

describe("parseCoffeeAttributes", () => {
  it("parses a fully populated coffee attribute object", () => {
    expect(
      parseCoffeeAttributes({
        origin: "Etiopien",
        process: "Vasket",
        roast: 2,
        notes: ["bergamot", "fersken"],
        weightG: 250,
      }),
    ).toEqual({
      origin: "Etiopien",
      process: "Vasket",
      roast: 2,
      notes: ["bergamot", "fersken"],
      weightG: 250,
    });
  });

  it("returns the empty shape for null/undefined/non-objects/arrays", () => {
    const empty = {
      roast: null,
      origin: null,
      process: null,
      notes: [],
      weightG: null,
    };
    expect(parseCoffeeAttributes(null)).toEqual(empty);
    expect(parseCoffeeAttributes(undefined)).toEqual(empty);
    expect(parseCoffeeAttributes(42)).toEqual(empty);
    expect(parseCoffeeAttributes(["roast"])).toEqual(empty);
    expect(parseCoffeeAttributes("not json")).toEqual(empty);
  });

  it("tolerates a JSON-string column value (defensive leg)", () => {
    expect(
      parseCoffeeAttributes('{"roast":"3","weightG":"250"}'),
    ).toMatchObject({ roast: 3, weightG: 250 });
  });

  it("never guesses roast: out-of-range or non-integer → null", () => {
    expect(parseCoffeeAttributes({ roast: 0 }).roast).toBeNull();
    expect(parseCoffeeAttributes({ roast: 5 }).roast).toBeNull();
    expect(parseCoffeeAttributes({ roast: 2.5 }).roast).toBeNull();
    expect(parseCoffeeAttributes({ roast: "dark" }).roast).toBeNull();
  });

  it("never guesses weight: zero/negative/non-numeric → null", () => {
    expect(parseCoffeeAttributes({ weightG: 0 }).weightG).toBeNull();
    expect(parseCoffeeAttributes({ weightG: -250 }).weightG).toBeNull();
    expect(parseCoffeeAttributes({ weightG: "et kvart kilo" }).weightG).toBeNull();
  });

  it("keeps only non-empty string notes and trims them", () => {
    expect(
      parseCoffeeAttributes({ notes: [" karamel ", "", 7, null, "nød"] }).notes,
    ).toEqual(["karamel", "nød"]);
  });
});

describe("localizedAttributes", () => {
  const product = {
    attributes: { origin: "Etiopien", process: "Vasket", roast: 2, weightG: 250 },
    translations: {
      xx: { attributes: { origin: "Ethiopia", process: "Washed" } },
    },
  };

  it("returns the base object untouched on the base locale", () => {
    expect(localizedAttributes(product, brand.defaultLocale)).toBe(
      product.attributes,
    );
  });

  it("merges the locale override OVER the base — locale-neutral keys survive", () => {
    expect(localizedAttributes(product, "xx")).toEqual({
      origin: "Ethiopia",
      process: "Washed",
      roast: 2,
      weightG: 250,
    });
  });

  it("falls back to the base when the locale has no attributes override", () => {
    expect(localizedAttributes(product, "yy")).toBe(product.attributes);
    expect(
      localizedAttributes({ attributes: { roast: 3 }, translations: null }, "xx"),
    ).toEqual({ roast: 3 });
  });

  it("threads through the coffee parser (parseLocalizedCoffeeAttributes)", () => {
    expect(parseLocalizedCoffeeAttributes(product, "xx")).toMatchObject({
      origin: "Ethiopia",
      process: "Washed",
      roast: 2,
      weightG: 250,
    });
  });
});

describe("parseAgentReport", () => {
  it("accepts a well-formed is-agentic report", () => {
    expect(
      parseAgentReport({
        score: 80,
        report_url: "https://is-agentic.com/scan/demo.cartwright.app/da",
        score_label: "Ready with a few material gaps",
      }),
    ).toEqual({
      score: 80,
      reportUrl: "https://is-agentic.com/scan/demo.cartwright.app/da",
    });
  });

  it("rejects out-of-range, non-integer or missing scores (never a wrong number)", () => {
    const url = { report_url: "https://is-agentic.com/scan/x" };
    expect(parseAgentReport({ ...url, score: 101 })).toBeNull();
    expect(parseAgentReport({ ...url, score: -1 })).toBeNull();
    expect(parseAgentReport({ ...url, score: 79.5 })).toBeNull();
    expect(parseAgentReport({ ...url, score: "80" })).toBeNull();
    expect(parseAgentReport(url)).toBeNull();
    expect(parseAgentReport(null)).toBeNull();
  });

  it("rejects a report_url outside is-agentic.com (score and link must agree)", () => {
    expect(
      parseAgentReport({ score: 80, report_url: "https://evil.example/scan" }),
    ).toBeNull();
  });
});

describe("perKgOere", () => {
  it("computes the honest per-kg price when weight is known", () => {
    // 250 g bag at 89 kr → 356 kr/kg (all in øre).
    expect(perKgOere(8900, 250)).toBe(35600);
  });

  it("omits the line (null) without a weight or a positive price", () => {
    expect(perKgOere(8900, null)).toBeNull();
    expect(perKgOere(0, 250)).toBeNull();
  });
});
