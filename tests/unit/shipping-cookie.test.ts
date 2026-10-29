import { beforeAll, describe, it, expect, vi } from "vitest";
import {
  encodeShippingCookie,
  decodeShippingCookie,
  buildShippingCookieHeader,
  SHIPPING_COOKIE_NAME,
} from "@/lib/shipping-cookie";

const sampleShipping = {
  name: "Kenni Madsen",
  address: "Vesterbrogade 12",
  zip: "1620",
  city: "København V",
};

beforeAll(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-pepper-secret";
});

describe("shipping-cookie roundtrip", () => {
  it("encrypt + decrypt giver oprindelig data", () => {
    const encoded = encodeShippingCookie(sampleShipping);
    expect(encoded).toBeTruthy();
    expect(encoded).not.toContain("Vesterbrogade");
    const decoded = decodeShippingCookie(encoded);
    expect(decoded).toMatchObject(sampleShipping);
    expect(decoded?.storedAt).toBeTypeOf("number");
  });

  it("decode returnerer null for tampered cookie", () => {
    const encoded = encodeShippingCookie(sampleShipping);
    const tampered = encoded.slice(0, -4) + "XXXX";
    expect(decodeShippingCookie(tampered)).toBeNull();
  });

  it("decode returnerer null for tomt input", () => {
    expect(decodeShippingCookie(undefined)).toBeNull();
    expect(decodeShippingCookie("")).toBeNull();
  });

  it("decode returnerer null for korrupt base64", () => {
    expect(decodeShippingCookie("not-valid-base64-or-encrypted-content!!!")).toBeNull();
  });

  it("decode returnerer null hvis storedAt er > 30 dage gammel", () => {
    const encoded = encodeShippingCookie(sampleShipping);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    expect(decodeShippingCookie(encoded)).toBeNull();
    vi.useRealTimers();
  });

  it("buildShippingCookieHeader inkluderer HttpOnly + SameSite=Lax", () => {
    const header = buildShippingCookieHeader("encoded-data");
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Max-Age=2592000/);
    expect(header).toContain(SHIPPING_COOKIE_NAME);
  });

  it("Secure flag IKKE sat i dev mode", () => {
    const original = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "test" });
    try {
      const header = buildShippingCookieHeader("encoded-data");
      expect(header).not.toMatch(/Secure/);
    } finally {
      Object.assign(process.env, { NODE_ENV: original });
    }
  });
});
