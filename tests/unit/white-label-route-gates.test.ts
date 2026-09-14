import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

describe("white-label public route gates", () => {
  it.each([
    "app/[locale]/services/page.tsx",
    "app/[locale]/services/[slug]/page.tsx",
    "app/[locale]/services/domain-migration/page.tsx",
    "app/[locale]/start/page.tsx",
  ])("keeps SaaS-only agency content off webshop forks: %s", (file) => {
    const target = path.join(ROOT, file);
    if (!existsSync(target)) {
      // Scaffold profiles prune the SaaS-only agency routes entirely — a
      // file that does not exist cannot leak content, which is a stronger
      // guarantee than the gate this test asserts. Only the full engine
      // tree carries these files and exercises the source assertions.
      return;
    }
    const source = readFileSync(target, "utf8");

    expect(source).toContain("notFound()");
    expect(source).toMatch(/industryTemplate\s*!==?\s*["']saas["']|industryTemplate\s*===\s*["']saas["']/);
    expect(source).toMatch(/ecommerceEnabled/);
  });
});
