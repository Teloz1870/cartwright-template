import { describe, expect, it } from "vitest";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";

describe("homeBreadcrumbLabel", () => {
  it("localizes the shipped template locales", () => {
    expect(homeBreadcrumbLabel("da")).toBe("Forside");
    expect(homeBreadcrumbLabel("en")).toBe("Home");
  });

  it("falls back to English 'Home' for any unmapped locale", () => {
    expect(homeBreadcrumbLabel("de")).toBe("Home");
    expect(homeBreadcrumbLabel("fr")).toBe("Home");
    expect(homeBreadcrumbLabel("")).toBe("Home");
  });
});
