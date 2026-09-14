// The next/font/google test shim must resolve ANY font name — an AI building
// a custom design pack picks whatever display font fits the brand (DESIGN.md
// taste rule 3), and the suite must not crash because that font wasn't in a
// hardcoded list. Regression: Cormorant_Garamond broke the whole suite with
// "TypeError: Cormorant_Garamond is not a function".
import { describe, expect, it } from "vitest";
// Two fonts deliberately NOT in any hardcoded shim list.
import { Cormorant_Garamond, UnifrakturMaguntia } from "next/font/google";
// A font that WAS in the original hardcoded list — must keep working identically.
import { Inter } from "next/font/google";

describe("tests/shims/next-font", () => {
  it("resolves arbitrary font names the shim has never heard of", () => {
    expect(typeof Cormorant_Garamond).toBe("function");
    expect(typeof UnifrakturMaguntia).toBe("function");
    const result = Cormorant_Garamond({ subsets: ["latin"], weight: "400" });
    expect(result).toEqual({ className: "", variable: "", style: { fontFamily: "" } });
  });

  it("resolves names that are not even real Google fonts (dynamic import)", async () => {
    const mod = (await import("next/font/google")) as Record<string, unknown>;
    const Made_Up_Display = mod["Made_Up_Display_Font_9000"] as (
      opts?: unknown,
    ) => { className: string };
    expect(typeof Made_Up_Display).toBe("function");
    expect(Made_Up_Display({ subsets: ["latin"] }).className).toBe("");
  });

  it("keeps the previously hardcoded named exports working identically", () => {
    expect(typeof Inter).toBe("function");
    expect(Inter({ subsets: ["latin"] })).toEqual({
      className: "",
      variable: "",
      style: { fontFamily: "" },
    });
  });
});
