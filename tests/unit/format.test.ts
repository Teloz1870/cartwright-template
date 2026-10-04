import { describe, it, expect } from "vitest";
import { formatPrice, formatPriceDkk } from "@/lib/format";

// formatPriceDkk now delegates to a locale-aware Intl currency formatter
// (da-DK / DKK -> "299,00 kr."). Intl inserts a non-breaking space before the
// symbol, so we match with \s (which also matches U+00A0) to stay stable
// across ICU versions.
describe("formatPriceDkk", () => {
  for (const [label, amount] of [
    ["hele base-enheder", 29900],
    ["tusindtalsseparator", 129900],
    ["minor units", 29950],
    ["nul", 0],
  ] as const) {
    it(`delegerer ${label} til den konfigurerede base-valuta`, () => {
      expect(formatPriceDkk(amount)).toBe(formatPrice(amount));
    });
  }
});
