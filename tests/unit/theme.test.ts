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

// ───────────────────────────────────────────────────────────────────────────
// Track 1B (v0.16.0): ExtendedTheme — fonts + radius som strict superset
// ───────────────────────────────────────────────────────────────────────────

const validPalette = {
  accent: "#1e3f5a",
  accentDeep: "#0f2438",
  cream: "#f4efe6",
  sand: "#e8e1d3",
  ink: "#1a1a1a",
  muted: "#726d62",
};

describe("parseThemeJson — fonts/radius (Track 1B)", () => {
  it("regression: 6-key palette parses identisk efter udvidelse", () => {
    const parsed = parseThemeJson(JSON.stringify(validPalette));
    expect(parsed).toMatchObject(validPalette);
  });

  it("accepterer valid fonts.sans og fonts.mono", () => {
    const json = JSON.stringify({
      ...validPalette,
      fonts: { sans: "Inter, sans-serif", mono: "JetBrains Mono, monospace" },
    });
    const parsed = parseThemeJson(json) as unknown as {
      fonts?: { sans?: string; mono?: string };
    };
    expect(parsed).not.toBeNull();
    expect(parsed?.fonts?.sans).toBe("Inter, sans-serif");
    expect(parsed?.fonts?.mono).toBe("JetBrains Mono, monospace");
  });

  it("accepterer valid radius (md/lg/xl)", () => {
    const json = JSON.stringify({
      ...validPalette,
      radius: { md: "8px", lg: "12px", xl: "1.5rem" },
    });
    const parsed = parseThemeJson(json) as unknown as {
      radius?: { md?: string; lg?: string; xl?: string };
    };
    expect(parsed).not.toBeNull();
    expect(parsed?.radius?.md).toBe("8px");
    expect(parsed?.radius?.xl).toBe("1.5rem");
  });

  it("dropper KUN fonts hvis fonts indeholder injection (`}`), beholder colors", () => {
    const json = JSON.stringify({
      ...validPalette,
      fonts: { sans: "Inter} body{display:none;" },
    });
    const parsed = parseThemeJson(json) as unknown as {
      accent: string;
      fonts?: { sans?: string };
    };
    expect(parsed).not.toBeNull();
    expect(parsed?.accent).toBe(validPalette.accent);
    expect(parsed?.fonts?.sans).toBeUndefined();
  });

  it("dropper bad radius men beholder colors", () => {
    const json = JSON.stringify({
      ...validPalette,
      radius: { md: "javascript:alert(1)" },
    });
    const parsed = parseThemeJson(json) as unknown as {
      accent: string;
      radius?: { md?: string };
    };
    expect(parsed).not.toBeNull();
    expect(parsed?.accent).toBe(validPalette.accent);
    expect(parsed?.radius?.md).toBeUndefined();
  });

  it("dropper individuelle bad sub-værdier men beholder valide", () => {
    const json = JSON.stringify({
      ...validPalette,
      fonts: { sans: "Inter", mono: "Bad}font" },
      radius: { md: "8px", lg: "not-a-unit", xl: "1rem" },
    });
    const parsed = parseThemeJson(json) as unknown as {
      fonts?: { sans?: string; mono?: string };
      radius?: { md?: string; lg?: string; xl?: string };
    };
    expect(parsed?.fonts?.sans).toBe("Inter");
    expect(parsed?.fonts?.mono).toBeUndefined();
    expect(parsed?.radius?.md).toBe("8px");
    expect(parsed?.radius?.lg).toBeUndefined();
    expect(parsed?.radius?.xl).toBe("1rem");
  });

  it("fortsat null hvis et required color-felt mangler (selv med fonts)", () => {
    const json = JSON.stringify({
      ...validPalette,
      muted: undefined,
      fonts: { sans: "Inter" },
    });
    expect(parseThemeJson(json)).toBeNull();
  });
});

describe("themeToInlineCss — fonts/radius emit (Track 1B)", () => {
  it("regression: 6-key palette uden fonts/radius emitter IKKE font/radius tokens", () => {
    const css = themeToInlineCss(validPalette);
    expect(css).not.toContain("--font-sans");
    expect(css).not.toContain("--font-mono");
    expect(css).not.toContain("--radius-sol-md");
    expect(css).not.toContain("--radius-sol-lg");
    expect(css).not.toContain("--radius-sol-xl");
  });

  it("emitter --font-sans og --font-mono kun når fonts er tilstede", () => {
    const css = themeToInlineCss({
      ...validPalette,
      fonts: { sans: "Inter, sans-serif", mono: "Menlo, monospace" },
    } as Parameters<typeof themeToInlineCss>[0]);
    expect(css).toContain("--font-sans: Inter, sans-serif");
    expect(css).toContain("--font-mono: Menlo, monospace");
  });

  it("emitter kun den font-side der er sat (sans alene)", () => {
    const css = themeToInlineCss({
      ...validPalette,
      fonts: { sans: "Inter" },
    } as Parameters<typeof themeToInlineCss>[0]);
    expect(css).toContain("--font-sans: Inter");
    expect(css).not.toContain("--font-mono");
  });

  it("emitter --radius-sol-md/lg/xl kun når radius er tilstede", () => {
    const css = themeToInlineCss({
      ...validPalette,
      radius: { md: "8px", lg: "12px", xl: "20px" },
    } as Parameters<typeof themeToInlineCss>[0]);
    expect(css).toContain("--radius-sol-md: 8px");
    expect(css).toContain("--radius-sol-lg: 12px");
    expect(css).toContain("--radius-sol-xl: 20px");
  });

  it("regression: præcis output for 6-key palette uden udvidelser", () => {
    // Sikrer at studio + alle 3 canaries renders byte-identisk efter Track 1B
    // når deres themeJson kun har 6 colors.
    const css = themeToInlineCss(validPalette);
    expect(css).toBe(`:root {
  --color-sol-accent: #1e3f5a;
  --color-sol-accent-deep: #0f2438;
  --color-sol-cream: #f4efe6;
  --color-sol-sand: #e8e1d3;
  --color-sol-ink: #1a1a1a;
  --color-sol-muted: #726d62;
}`);
  });
});
