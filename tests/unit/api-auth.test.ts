import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  extractBearerToken,
} from "@/lib/api-auth";

describe("api-auth — pure helpers", () => {
  it("generateApiKey returnerer plaintext med 'sb_live_' prefix og hash der matcher", () => {
    const { plaintext, hash } = generateApiKey();
    expect(plaintext.startsWith("sb_live_")).toBe(true);
    expect(plaintext.length).toBeGreaterThan(20);
    expect(hash).toBe(hashApiKey(plaintext));
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("generateApiKey producerer entropisk forskellige keys hver gang", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hashApiKey er deterministisk", () => {
    const fixed = "sb_live_AAA";
    expect(hashApiKey(fixed)).toBe(hashApiKey(fixed));
  });

  it("extractBearerToken parser 'Authorization: Bearer X'", () => {
    const req = new Request("http://x", {
      headers: { Authorization: "Bearer sb_live_secret123" },
    });
    expect(extractBearerToken(req)).toBe("sb_live_secret123");
  });

  it("extractBearerToken er case-insensitiv på Bearer-keyword", () => {
    const req = new Request("http://x", {
      headers: { authorization: "bearer foo" },
    });
    expect(extractBearerToken(req)).toBe("foo");
  });

  it("extractBearerToken returnerer null hvis ingen header", () => {
    expect(extractBearerToken(new Request("http://x"))).toBeNull();
  });

  it("extractBearerToken returnerer null hvis ikke Bearer-format", () => {
    const req = new Request("http://x", {
      headers: { Authorization: "Basic AAA=" },
    });
    expect(extractBearerToken(req)).toBeNull();
  });
});
