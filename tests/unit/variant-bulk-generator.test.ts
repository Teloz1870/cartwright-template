import { describe, expect, it } from "vitest";

/**
 * ULTRAPLAN-lite UL3 regression: cartesian-product + SKU-template-rendering
 * pinnes som ren funktion her, så fremtidige ændringer i VariantsAdmin
 * BulkGenerator ikke ved et uheld brækker SKU-generering eller skipper
 * kombinationer.
 *
 * Den faktiske impl findes i components/admin/VariantsAdmin.tsx — vi
 * duplikerer den her med samme signatur. Hvis impl ændres, opdater begge.
 */

function cartesianProduct(
  attributeSets: Array<{ key: string; values: string[] }>,
): Array<Record<string, string>> {
  if (attributeSets.length === 0) return [];
  let result: Array<Record<string, string>> = [{}];
  for (const { key, values } of attributeSets) {
    const next: Array<Record<string, string>> = [];
    for (const partial of result) {
      for (const value of values) {
        next.push({ ...partial, [key]: value });
      }
    }
    result = next;
  }
  return result;
}

function renderSkuTemplate(
  template: string,
  attrs: Record<string, string>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = attrs[key.trim()] ?? "";
    return value
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });
}

describe("cartesianProduct", () => {
  it("returnerer tom array når input er tom", () => {
    expect(cartesianProduct([])).toEqual([]);
  });

  it("én akse genererer én række pr værdi", () => {
    const result = cartesianProduct([{ key: "color", values: ["red", "blue"] }]);
    expect(result).toEqual([{ color: "red" }, { color: "blue" }]);
  });

  it("to akser genererer cross-product i deterministisk rækkefølge", () => {
    const result = cartesianProduct([
      { key: "height", values: ["1m", "2m"] },
      { key: "width", values: ["3m", "4m"] },
    ]);
    expect(result).toEqual([
      { height: "1m", width: "3m" },
      { height: "1m", width: "4m" },
      { height: "2m", width: "3m" },
      { height: "2m", width: "4m" },
    ]);
  });

  it("3 akser → samtlige kombinationer (panel-hegn-realistisk skala)", () => {
    const result = cartesianProduct([
      { key: "h", values: ["1m", "2m", "3m"] },
      { key: "w", values: ["2m", "3m"] },
      { key: "c", values: ["galv", "sort"] },
    ]);
    expect(result).toHaveLength(3 * 2 * 2); // = 12
    // Verificer unikke kombinationer
    const keys = result.map((r) => `${r.h}-${r.w}-${r.c}`);
    expect(new Set(keys).size).toBe(12);
  });
});

describe("renderSkuTemplate", () => {
  it("erstatter {key}-tokens med slugified values", () => {
    expect(
      renderSkuTemplate("ph-{h}x{w}", { h: "1m", w: "2m" }),
    ).toBe("ph-1mx2m");
  });

  it("normaliserer dansk æ/ø/å til ASCII (æ→ae, ø→o, å→a)", () => {
    expect(
      renderSkuTemplate("var-{farve}", { farve: "grå" }),
    ).toBe("var-gra");
    expect(
      renderSkuTemplate("var-{type}", { type: "rød" }),
    ).toBe("var-rod");
    expect(
      renderSkuTemplate("var-{type}", { type: "tæppe" }),
    ).toBe("var-taeppe");
  });

  it("strip whitespace og bevarer bindestreger", () => {
    expect(
      renderSkuTemplate("p-{h}-{w}", { h: "1.5 m", w: "2 m" }),
    ).toBe("p-1-5-m-2-m");
  });

  it("tom value giver tom slot (kan resultere i invalid sku)", () => {
    expect(
      renderSkuTemplate("p-{a}-{b}", { a: "x", b: "" }),
    ).toBe("p-x-");
  });
});
