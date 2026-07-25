import { describe, it, expect } from "vitest";
import { isSameOriginPath } from "@/lib/webmcp/paths";

describe("isSameOriginPath (WebMCP navigate guard)", () => {
  it("accepterer interne stier", () => {
    expect(isSameOriginPath("/produkter")).toBe(true);
    expect(isSameOriginPath("/produkter?q=oak")).toBe(true);
    expect(isSameOriginPath("/product/some-slug#reviews")).toBe(true);
  });
  it("afviser eksterne + protocol-relative + scheme-tricks", () => {
    expect(isSameOriginPath("//evil.com")).toBe(false);
    expect(isSameOriginPath("https://evil.com")).toBe(false);
    expect(isSameOriginPath("http://evil.com/x")).toBe(false);
    expect(isSameOriginPath("/\\evil.com")).toBe(false);
    expect(isSameOriginPath("javascript:alert(1)")).toBe(false);
  });
  it("afviser ikke-strenge + tom + relativ-uden-slash", () => {
    expect(isSameOriginPath("produkter")).toBe(false);
    expect(isSameOriginPath("")).toBe(false);
    expect(isSameOriginPath(undefined)).toBe(false);
    expect(isSameOriginPath(42)).toBe(false);
  });
});
