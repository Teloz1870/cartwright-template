import { afterEach, describe, expect, it, vi } from "vitest";

import { brand as shippedBrand } from "@/brand.config";

/**
 * URL5-a — a stored `permalink` reaches every link the engine builds.
 *
 * `tests/unit/no-raw-product-href.test.ts` pins the call sites by their text:
 * every `productHref`/`categoryHref` call hands over `{ slug, permalink }` from
 * one entity. Text cannot see the query behind a call, though. A call site
 * reading `p.permalink` from a `select` that never asked for it gets
 * `undefined` from Prisma, links the pattern, and the shop has two addresses
 * for one product again — with every test green. So the routes with an
 * explicit `select` are run here against a fake database that hands back only
 * the fields the query selected, the way Prisma does.
 *
 * The other half: with `urls.permalinks` off (every canary, every scaffold)
 * the stored permalink changes nothing, so filling the column is inert.
 */

const L: string = shippedBrand.defaultLocale;
const at = new Date("2026-10-01T00:00:00Z");

const FULL: Record<string, Record<string, unknown>[]> = {
  category: [{ slug: "hegn", permalink: "/hegn/", name: "Hegn" }],
  product: [
    {
      slug: "komposit-x",
      permalink: "/hegn/komposithegn/komposit-x/",
      name: "Komposit X",
      createdAt: at,
      priceDkk: 100_00,
      stock: 3,
      variants: [],
    },
  ],
};

/** Prisma returns only what `select` names; a query without `select` returns the row. */
function pick(row: Record<string, unknown>, select?: Record<string, unknown>) {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).filter((k) => k in row).map((k) => [k, row[k]]));
}

function fakePrisma() {
  return new Proxy(
    {},
    {
      get: (_target, model) => ({
        findMany: (args?: { select?: Record<string, unknown> }) => {
          const rows = (FULL[String(model)] ?? []).map((r) => pick(r, args?.select));
          // The shape `prisma.x.findMany(...).catch(...)` needs.
          return Promise.resolve(rows);
        },
        aggregate: () => Promise.resolve({ _min: { priceDkk: 100_00 }, _max: { priceDkk: 100_00 }, _count: { _all: 1 } }),
        count: () => Promise.resolve((FULL[String(model)] ?? []).length),
      }),
    },
  );
}

async function mockShop(permalinks: boolean) {
  vi.resetModules();
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({
    ...actual,
    brand: {
      ...actual.brand,
      ecommerceEnabled: true,
      mode: "webshop",
      features: { ...actual.brand.features, webshop: true, blog: false },
      urls: { permalinks, trailingSlash: false, localePrefix: "always" },
    },
  }));
  vi.doMock("@/lib/db", () => ({ prisma: fakePrisma() }));
}

afterEach(() => {
  vi.doUnmock("@/brand.config");
  vi.doUnmock("@/lib/db");
  vi.resetModules();
});

async function sitemapPaths(): Promise<string[]> {
  const { default: sitemap } = await import("@/app/sitemap");
  return (await sitemap()).map((entry) => new URL(entry.url).pathname);
}

async function pricingMarkdown(): Promise<string> {
  const { GET } = await import("@/app/pricing.md/route");
  return (await GET()).text();
}

describe("URL5-a — the sitemap lists a migrated entity at its permalink", () => {
  // `trailingSlash` is off here, so the stored `/hegn/` is linked bare (`applyTrailingSlash`).
  it("permalinks on: the product and the category are listed at their stored addresses, never at the pattern", async () => {
    await mockShop(true);
    const paths = await sitemapPaths();
    expect(paths).toContain(`/${L}/hegn/komposithegn/komposit-x`);
    expect(paths).toContain(`/${L}/hegn`);
    expect(paths).not.toContain(`/${L}/product/komposit-x`);
    expect(paths).not.toContain(`/${L}/category/hegn`);
  });

  it("permalinks off: the stored permalink is inert, the pattern is listed", async () => {
    await mockShop(false);
    const paths = await sitemapPaths();
    expect(paths).toContain(`/${L}/product/komposit-x`);
    expect(paths).toContain(`/${L}/category/hegn`);
    expect(paths.some((p) => p.includes("komposithegn"))).toBe(false);
  });
});

describe("URL5-a — /pricing.md links a migrated product at its permalink", () => {
  it("permalinks on: the table row links the permalink", async () => {
    await mockShop(true);
    const md = await pricingMarkdown();
    expect(md).toContain(`/${L}/hegn/komposithegn/komposit-x)`);
    expect(md).not.toContain(`/${L}/product/komposit-x)`);
  });

  it("permalinks off: the table row links the pattern", async () => {
    await mockShop(false);
    const md = await pricingMarkdown();
    expect(md).toContain(`/${L}/product/komposit-x)`);
  });
});
