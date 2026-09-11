import { describe, it, expect } from "vitest";
import { redactSensitive } from "@/lib/audit";

describe("redactSensitive — pattern-baseret følsom-data-fjernelse", () => {
  it("redacter klassiske felter", () => {
    expect(redactSensitive({ password: "hemmeligt" })).toEqual({
      password: "[REDACTED]",
    });
    expect(redactSensitive({ apiKey: "sk-..." })).toEqual({
      apiKey: "[REDACTED]",
    });
    expect(redactSensitive({ cardNumber: "4111..." })).toEqual({
      cardNumber: "[REDACTED]",
    });
  });

  it("case-insensitive matching", () => {
    expect(redactSensitive({ PASSWORD: "x", ApiKey: "y" })).toEqual({
      PASSWORD: "[REDACTED]",
      ApiKey: "[REDACTED]",
    });
  });

  it("matcher substring (anthropicApiKey, accessToken etc.)", () => {
    const input = {
      anthropicApiKey: "sk-ant-...",
      stripeSecretKey: "sk_live_...",
      accessToken: "tok_...",
      authToken: "abc",
      webhookSecret: "whsec",
      privateKey: "rsa",
    };
    const out = redactSensitive(input) as Record<string, string>;
    expect(out.anthropicApiKey).toBe("[REDACTED]");
    expect(out.stripeSecretKey).toBe("[REDACTED]");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(out.authToken).toBe("[REDACTED]");
    expect(out.webhookSecret).toBe("[REDACTED]");
    expect(out.privateKey).toBe("[REDACTED]");
  });

  it("recurser ind i nested objekter", () => {
    const input = {
      user: { name: "Anders", password: "x" },
      payment: { cvc: "123", amount: 100 },
    };
    const out = redactSensitive(input) as {
      user: { name: string; password: string };
      payment: { cvc: string; amount: number };
    };
    expect(out.user.name).toBe("Anders");
    expect(out.user.password).toBe("[REDACTED]");
    expect(out.payment.cvc).toBe("[REDACTED]");
    expect(out.payment.amount).toBe(100);
  });

  it("recurser ind i arrays", () => {
    const out = redactSensitive([
      { password: "x", name: "a" },
      { password: "y", name: "b" },
    ]) as Array<{ password: string; name: string }>;
    expect(out[0].password).toBe("[REDACTED]");
    expect(out[0].name).toBe("a");
    expect(out[1].password).toBe("[REDACTED]");
  });

  it("ikke-objekter passerer urørt", () => {
    expect(redactSensitive("hello")).toBe("hello");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBe(null);
    expect(redactSensitive(undefined)).toBe(undefined);
  });

  it("redacter IKKE normale felter", () => {
    const input = { name: "Anders", email: "a@b.dk", slug: "test", price: 100 };
    expect(redactSensitive(input)).toEqual(input);
  });

  it("redacter try-on billedfelter", () => {
    const input = {
      faceImage: "raw-face",
      selfiePng: "raw-selfie",
      userPhoto: "raw-photo",
      imageBytes: "raw-bytes",
      productSlug: "aviator",
    };

    expect(redactSensitive(input)).toEqual({
      faceImage: "[REDACTED]",
      selfiePng: "[REDACTED]",
      userPhoto: "[REDACTED]",
      imageBytes: "[REDACTED]",
      productSlug: "aviator",
    });
  });
});
