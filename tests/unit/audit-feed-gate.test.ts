import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";

/**
 * brand.website.showAuditFeed gates every surface that exposes the ENGINE
 * changelog on a shop's storefront: the footer's "Audit feed" link, the
 * announcement bar's aiLink, the /changelog route itself, and its sitemap
 * entry. Default true (engine + canaries unchanged); a shop that sets false
 * must lose ALL of them — a gated link with an ungated route (or vice
 * versa) is half a gate. Source-scanned because the components are async
 * server components on Prisma; the defect is re-introducible only in source.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const has = (p: string) => existsSync(join(process.cwd(), p));

/**
 * `app/[locale]/changelog` and `app/[locale]/cartwright` are engine-only
 * (`scaffold/engine-only.ts`): the CLI removes them from a customer's scaffold,
 * while `tests/unit` still ships to light/full. Reading a deleted route file
 * unconditionally would turn a correct scaffold red while every engine gate
 * stayed green — the #550/#551/#572 class, one directory over. The cases that
 * assert on OUR route files skip when the route is gone; the cases about the
 * shipped components (footer, bar, sitemap) keep running everywhere.
 */

describe("showAuditFeed gates every engine-changelog surface", () => {
  it("defaults to true (engine + canaries unchanged)", () => {
    expect(brand.website.showAuditFeed).toBe(true);
  });

  it("footer + announcement bar render the links only when on — and locale-prefixed", () => {
    const footer = read("components/Footer.tsx");
    expect(footer).toMatch(/showAuditFeed[\s\S]{0,200}\/changelog/);
    const bar = read("components/AnnouncementBar.tsx");
    expect(bar).toMatch(/showAuditFeed[\s\S]{0,400}\/changelog/);
    // The bare `/changelog` href bounced the visitor out of their locale.
    expect(bar).not.toContain('href="/changelog"');
    expect(bar).toContain("`/${locale}/changelog`");
  });

  it.skipIf(!has("app/[locale]/changelog/page.tsx"))("the route 404s and the sitemap entry disappears when off", () => {
    expect(read("app/[locale]/changelog/page.tsx")).toMatch(
      /if \(!brand\.website\.showAuditFeed\) notFound\(\)/,
    );
    expect(read("app/sitemap.ts")).toMatch(/showAuditFeed[\s\S]{0,200}\/changelog/);
  });
});

describe("engine marketing stays off webshop storefronts", () => {
  it.skipIf(!has("app/[locale]/cartwright/page.tsx"))("/[locale]/cartwright gates on ecommerceEnabled", () => {
    const src = read("app/[locale]/cartwright/page.tsx");
    expect(src).toMatch(/if \(brand\.ecommerceEnabled\) notFound\(\)/);
  });
});
