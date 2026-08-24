import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

describe("white-label public route gates", () => {
  it.each([
    "app/[locale]/services/page.tsx",
    "app/[locale]/services/[slug]/page.tsx",
    "app/[locale]/services/domain-migration/page.tsx",
    "app/[locale]/start/page.tsx",
  ])("keeps SaaS-only agency content off webshop forks: %s", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");

    expect(source).toContain("notFound()");
    expect(source).toMatch(/industryTemplate\s*!==?\s*["']saas["']|industryTemplate\s*===\s*["']saas["']/);
    expect(source).toMatch(/ecommerceEnabled/);
  });
});
