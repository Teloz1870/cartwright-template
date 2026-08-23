import { afterEach, describe, expect, it } from "vitest";
import { configuredPublicUrl } from "@/lib/public-url";

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe("configuredPublicUrl", () => {
  it("uses a valid configured deployment origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.example.test/path?ignored=yes";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://demo.example.test");
  });

  it("normalizes the fallback when configuration is absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
  });

  it("rejects malformed and non-http configuration", () => {
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
    process.env.NEXT_PUBLIC_APP_URL = "not a URL";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
  });
});
