/**
 * A page that can answer 404 decides that before the response starts streaming
 * (SOFT-404-PDP-PLP).
 *
 * A streamed response commits to `200` the moment a Suspense fallback renders
 * (node_modules/next/dist/docs: loading.md "Status codes", the streaming
 * guide's HTTP contract). The PDP and the category page sat under a route-level
 * `loading.tsx` — a boundary around the WHOLE page — so their `notFound()` ran
 * after the 200 and a missing product or category was a `noindex` page served
 * with 200: measured live on demo.cartwright.app and Solbrillen 2026-10-24, for
 * Googlebot too. Google reports those as soft 404s, and a migration's
 * redirect check cannot see a broken product address.
 *
 * Two halves, because neither alone is enough:
 *
 *  - The tree. No `loading.*` file may sit in the directory of, or any
 *    directory above, a page that calls `notFound()` (the page itself or the
 *    plugin module it mounts). This is what catches the route-level
 *    `loading.tsx` coming back — or an `app/[locale]/loading.tsx`, which would
 *    soft-404 every route at once. It reads files, so it is a structural pin:
 *    it cannot see a `<Suspense>` some layout above opens by hand.
 *  - The pages. Driven for real against a fake Prisma: a missing slug throws
 *    out of the default export itself — before it has returned any boundary —
 *    and a found one comes back as the page's own `<Suspense>`, the found row
 *    already handed to the detail inside it.
 *
 * Out of scope on purpose: `redirect()`. `/produkter` keeps its route-level
 * `loading.tsx`, so its website-mode bounce to `/` is a streamed meta-refresh,
 * not a 307 — known and covered by the e2e gate test in tests/e2e/shop.spec.ts.
 * No unit test sees the HTTP status itself; the before/after `curl` is in the
 * commit that added this file.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Suspense, isValidElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";

const ROOT = resolve(__dirname, "../..");
const APP = join(ROOT, "app");
const posix = (abs: string) => relative(ROOT, abs).split(sep).join("/");
/** The mirror exclude list never reaches a scaffold (same probe as repo-hygiene.test.ts). */
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));

const PAGE_FILE = /^page(\.static)?\.(tsx|ts|jsx|js)$/;
const LOADING_FILE = /^loading\.(tsx|ts|jsx|js)$/;
const CALLS_NOT_FOUND = /\bnotFound\s*\(/;
const PLUGIN_SPECIFIER = /\bfrom\s+["'](@\/plugins\/[^"']+)["']/g;

function walkPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, out);
    else if (PAGE_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

/** The page's own source plus every plugin module it mounts (`export { default } from "@/plugins/…"`). */
function sourcesOf(page: string): string[] {
  const own = readFileSync(page, "utf8");
  const mounted = [...own.matchAll(PLUGIN_SPECIFIER)].flatMap(([, spec]) => {
    const base = join(ROOT, spec.slice("@/".length));
    const file = [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx")].find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    );
    return file ? [readFileSync(file, "utf8")] : [];
  });
  return [own, ...mounted];
}

/** Every `loading.*` in the page's directory or a directory above it, up to and including `app/`. */
function loadingFilesAbove(page: string): string[] {
  const found: string[] = [];
  for (let dir = dirname(page); ; dir = dirname(dir)) {
    for (const name of readdirSync(dir)) if (LOADING_FILE.test(name)) found.push(posix(join(dir, name)));
    if (dir === APP) return found;
  }
}

describe("no route-level loading boundary above a page that answers 404", () => {
  const pages = walkPages(APP);
  const notFoundPages = pages.filter((page) => sourcesOf(page).some((src) => CALLS_NOT_FOUND.test(src)));

  it("walks a meaningful set of pages (the rule is not vacuous)", () => {
    expect(notFoundPages.length, "no page under app/ calls notFound()").toBeGreaterThan(0);
    // Existence-guarded: a scaffold may have pruned either route and must stay green.
    for (const route of ["app/[locale]/product/[slug]/page.tsx", "app/[locale]/category/[slug]/page.tsx"]) {
      if (existsSync(join(ROOT, route))) expect(notFoundPages.map(posix)).toContain(route);
    }
    if (isEngineCheckout) {
      expect(notFoundPages.map(posix)).toEqual(
        expect.arrayContaining([
          "app/[locale]/product/[slug]/page.tsx",
          "app/[locale]/category/[slug]/page.tsx",
          "app/[locale]/info/[slug]/page.tsx",
          // A plugin mount: the notFound() lives in plugins/blog, not the route file.
          "app/[locale]/blog/[slug]/page.tsx",
        ]),
      );
    }
  });

  it("the detector sees a loading file where one exists", () => {
    // /produkter keeps its route-level loading.tsx (it never answers 404), so
    // the lookup has something real to find wherever the route still ships.
    const plp = join(APP, "[locale]", "produkter", "page.tsx");
    if (!existsSync(join(APP, "[locale]", "produkter", "loading.tsx"))) return;
    expect(loadingFilesAbove(plp)).toEqual(["app/[locale]/produkter/loading.tsx"]);
  });

  it("finds none above any of them", () => {
    const offenders = notFoundPages.flatMap((page) =>
      loadingFilesAbove(page).map((loading) => `${posix(page)} sits under ${loading}`),
    );
    expect(
      offenders,
      "a loading.* boundary streams a 200 before notFound() runs — put a <Suspense> inside the page, after the lookup",
    ).toEqual([]);
  });
});

// ─── The pages, driven ──────────────────────────────────────────────────────

type Row = { id: string; slug: string; deletedAt: Date | null };

const mocks = vi.hoisted(() => {
  const products: Row[] = [];
  const categories: Row[] = [];
  const bySlug = (rows: Row[]) =>
    vi.fn(async ({ where }: { where: { slug: string; deletedAt?: null } }) =>
      rows.find((r) => r.slug === where.slug && !("deletedAt" in where && r.deletedAt !== null)) ?? null,
    );
  return {
    products,
    categories,
    prisma: {
      product: { findFirst: bySlug(products), findMany: vi.fn(async () => []) },
      category: { findUnique: bySlug(categories), findMany: vi.fn(async () => []) },
    },
    getBrand: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => brand.defaultLocale,
}));

const params = (slug: string) => Promise.resolve({ slug, locale: brand.defaultLocale });

const ROUTES = [
  {
    name: "the PDP",
    file: "app/[locale]/product/[slug]/page.tsx",
    load: () => import("@/app/[locale]/product/[slug]/page"),
    skeleton: async () => (await import("@/app/[locale]/product/[slug]/product-skeleton")).ProductSkeleton,
    rowProp: "product",
  },
  {
    name: "the category page",
    file: "app/[locale]/category/[slug]/page.tsx",
    load: () => import("@/app/[locale]/category/[slug]/page"),
    skeleton: async () => (await import("@/app/[locale]/category/[slug]/category-skeleton")).CategorySkeleton,
    rowProp: "category",
  },
] as const;

for (const route of ROUTES) {
  describe.skipIf(!existsSync(join(ROOT, route.file)))(`${route.name} decides its status before any boundary`, () => {
    type PageModule = Awaited<ReturnType<(typeof route)["load"]>>;
    let page: PageModule;
    let skeleton: unknown;
    // The page module pulls in the whole storefront graph; a cold transform
    // takes longer than one test's 5 s, so it is loaded once, up front.
    beforeAll(async () => {
      page = await route.load();
      skeleton = await route.skeleton();
    }, 60_000);

    beforeEach(() => {
      mocks.products.splice(0, mocks.products.length, { id: "p1", slug: "mug", deletedAt: null });
      mocks.categories.splice(0, mocks.categories.length, { id: "c1", slug: "mug", deletedAt: null });
      mocks.getBrand.mockResolvedValue({ ecommerceEnabled: true, defaultLocale: brand.defaultLocale });
    });

    it("a missing slug throws notFound out of the default export itself", async () => {
      // Rejects from page.default — not from a component inside a boundary it
      // returned — so the not-found lands before the shell is sent.
      await expect(page.default({ params: params("no-such-slug") })).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("a found slug comes back as the page's own <Suspense>, the row already looked up", async () => {
      const node = await page.default({ params: params("mug") });
      expect(isValidElement(node) && node.type === Suspense, "the page must return its boundary").toBe(true);
      const props = (node as { props: { fallback: unknown; children: unknown } }).props;
      expect(isValidElement(props.fallback) && props.fallback.type).toBe(skeleton);
      const detail = props.children as { props: Record<string, { slug?: string } | undefined> };
      expect(detail.props[route.rowProp]?.slug).toBe("mug");
    });

    it("website mode redirects out of the default export too (a real redirect, not a streamed one)", async () => {
      mocks.getBrand.mockResolvedValue({ ecommerceEnabled: false, defaultLocale: brand.defaultLocale });
      await expect(page.default({ params: params("mug") })).rejects.toThrow("NEXT_REDIRECT");
    });
  });
}
