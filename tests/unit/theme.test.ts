import { describe, expect, it } from "vitest";
import { isValidHex, parseThemeJson, themeToInlineCss } from "@/lib/theme";

/**
 * ULTRAPLAN-lite UL6 regression: theme-utilities skal validere hex,
 * parse DB-JSON robust og generere korrekt CSS-vars-output.
 */

describe("isValidHex", () => {
  it("accepterer #rrggbb og #rgb", () => {
    expect(isValidHex("#1a2b3c")).toBe(true);
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("#FFFFFF")).toBe(true);
  });

  it("afviser invalid formats", () => {
    expect(isValidHex("1a2b3c")).toBe(false);   // mangler #
    expect(isValidHex("#1a2b3")).toBe(false);   // 5 chars
    expect(isValidHex("#1a2b3cz")).toBe(false); // non-hex
    expect(isValidHex("")).toBe(false);
    expect(isValidHex("blue")).toBe(false);
  });
});

describe("parseThemeJson", () => {
  it("returnerer null for null/undefined/empty", () => {
    expect(parseThemeJson(null)).toBeNull();
    expect(parseThemeJson(undefined)).toBeNull();
    expect(parseThemeJson("")).toBeNull();
  });

  it("returnerer null for invalid JSON", () => {
    expect(parseThemeJson("not json")).toBeNull();
    expect(parseThemeJson("{not valid}")).toBeNull();
  });

  it("returnerer null hvis et required-felt mangler", () => {
    const incomplete = JSON.stringify({
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      // mangler muted
    });
    expect(parseThemeJson(incomplete)).toBeNull();
  });

  it("returnerer null hvis et felt har invalid hex", () => {
    const bad = JSON.stringify({
      accent: "not-a-color",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    });
    expect(parseThemeJson(bad)).toBeNull();
  });

  it("returnerer parsed palette når alle 6 hex er valide", () => {
    const valid = JSON.stringify({
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    });
    expect(parseThemeJson(valid)).toEqual({
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    });
  });
});

describe("themeToInlineCss", () => {
  it("genererer :root-block med alle 6 CSS-variabler", () => {
    const css = themeToInlineCss({
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    });
    expect(css).toContain(":root {");
    expect(css).toContain("--color-sol-accent: #1e3f5a");
    expect(css).toContain("--color-sol-accent-deep: #0f2438");
    expect(css).toContain("--color-sol-cream: #f4efe6");
    expect(css).toContain("--color-sol-sand: #e8e1d3");
    expect(css).toContain("--color-sol-ink: #1a1a1a");
    expect(css).toContain("--color-sol-muted: #726d62");
  });
});
