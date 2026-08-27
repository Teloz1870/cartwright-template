import { describe, it, expect } from "vitest";
import { formatPriceDkk } from "@/lib/format";

// formatPriceDkk now delegates to a locale-aware Intl currency formatter
// (da-DK / DKK -> "299,00 kr."). Intl inserts a non-breaking space before the
// symbol, so we match with \s (which also matches U+00A0) to stay stable
// across ICU versions.
describe("formatPriceDkk", () => {
  it("formaterer hele kroner med to decimaler (Intl currency)", () => {
    expect(formatPriceDkk(29900)).toMatch(/^299,00\skr\.$/);
  });
  it("formaterer beloeb med tusindtalsseparator", () => {
    expect(formatPriceDkk(129900)).toMatch(/^1\.299,00\skr\.$/);
  });
  it("viser oerer naar beloebet ikke er helt", () => {
    expect(formatPriceDkk(29950)).toMatch(/^299,50\skr\.$/);
  });
  it("haandterer nul", () => {
    expect(formatPriceDkk(0)).toMatch(/^0,00\skr\.$/);
  });
});
