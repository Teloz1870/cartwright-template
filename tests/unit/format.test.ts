import { describe, it, expect } from "vitest";
import { formatPriceDkk } from "@/lib/format";

describe("formatPriceDkk", () => {
  it("formaterer hele kroner uden øredel", () => {
    expect(formatPriceDkk(29900)).toBe("299 kr");
  });
  it("formaterer beløb med tusindtalsseparator", () => {
    expect(formatPriceDkk(129900)).toBe("1.299 kr");
  });
  it("viser ører når beløbet ikke er helt", () => {
    expect(formatPriceDkk(29950)).toBe("299,50 kr");
  });
  it("håndterer nul", () => {
    expect(formatPriceDkk(0)).toBe("0 kr");
  });
});
