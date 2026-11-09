import { describe, it, expect } from "vitest";
import { validateDiscountCode } from "@/lib/discount";

const NOW = new Date("2026-05-14T12:00:00Z");
const base = {
  code: "SOMMER10",
  type: "percent" as const,
  value: 10,
  validUntil: null,
  usageLimit: null,
  usageCount: 0,
  active: true,
};

describe("validateDiscountCode", () => {
  it("afviser ukendt kode", () => {
    expect(validateDiscountCode(null, NOW)).toEqual({ ok: false, reason: "Unknown discount code" });
  });
  it("accepterer en gyldig kode", () => {
    expect(validateDiscountCode(base, NOW)).toEqual({ ok: true, type: "percent", value: 10 });
  });
  it("afviser inaktiv kode", () => {
    expect(validateDiscountCode({ ...base, active: false }, NOW)).toEqual({
      ok: false,
      reason: "The discount code is not active",
    });
  });
  it("afviser udløbet kode", () => {
    expect(
      validateDiscountCode({ ...base, validUntil: new Date("2026-05-01T00:00:00Z") }, NOW),
    ).toEqual({ ok: false, reason: "The discount code has expired" });
  });
  it("accepterer kode der udløber i fremtiden", () => {
    expect(
      validateDiscountCode({ ...base, validUntil: new Date("2026-12-01T00:00:00Z") }, NOW),
    ).toEqual({ ok: true, type: "percent", value: 10 });
  });
  it("afviser opbrugt kode", () => {
    expect(
      validateDiscountCode({ ...base, usageLimit: 5, usageCount: 5 }, NOW),
    ).toEqual({ ok: false, reason: "The discount code has been fully used" });
  });
  it("accepterer kode under forbrugsgrænsen", () => {
    expect(
      validateDiscountCode({ ...base, usageLimit: 5, usageCount: 4 }, NOW),
    ).toEqual({ ok: true, type: "percent", value: 10 });
  });
});
