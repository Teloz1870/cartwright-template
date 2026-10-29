/**
 * WP2-r1′ on the product page: the breadcrumb — visible trail and
 * BreadcrumbList JSON-LD — runs Home › All products › every ancestor of the
 * product's category › the category › the product.
 *
 * The route is driven for real (the pattern of pdp-jsonld-sku.test.ts) and the
 * returned element tree is read for what the page hands `<Breadcrumbs>` and
 * `<JsonLd>`. A product in a top-level category — every product of a shop that
 * nests none — must not even pay for the tree query, and its trail is compared
 * against literals written from origin/main's code path, key order included.
 *
 * Locales come from the shop's own `brand.config.ts` (tests/unit ships in
 * scaffolds, which are single-locale `["en"]`): the page is driven in the
 * default locale, and the translated-ancestor case skips when there is no
 * second one.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { renderPageBody } from "../helpers/page-body";

import { brand } from "@/brand.config";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";

type Cat = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  permalink: null;
  translations: Record<string, { name: string }> | null;
};
type Row = Record<string, unknown> & { slug: string; deletedAt: Date | null; category: Cat | null };

const mocks = vi.hoisted(() => {
  const rows: Row[] = [];
  const cats: Cat[] = [];
  const state = { locale: "", treeFails: false };
  const findOne = vi.fn(async ({ where }: { where: { slug?: string } }) => rows.find((r) => r.slug === where.slug) ?? null);
  return {
    rows,
    cats,
    state,
    prisma: {
      product: { findUnique: findOne, findFirst: findOne, findMany: vi.fn(async () => []) },
      category: {
        // Like the database: only the selected columns come back.
        findMany: vi.fn(async (args: { select: Record<string, boolean> }) => {
          if (state.treeFails) throw new Error("no such column: Category.parentId");
          return cats.map((c) =>
            Object.fromEntries(
              Object.keys(args.select).filter((k) => args.select[k]).map((k) => [k, c[k as keyof Cat]]),
            ),
          );
        }),
      },
    },
    getBrand: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => mocks.state.locale,
}));

const page = await import("@/app/[locale]/product/[slug]/page");

/** The shop's source language — what every page below renders in unless told otherwise. */
const LOCALE = brand.defaultLocale;
/** A locale this shop publishes that is NOT its source language, or undefined
 *  (a single-locale scaffold). `OTHER!` only inside `whenMultiLocale`. */
const OTHER = brand.locales.find((l) => l !== brand.defaultLocale);
/** Skip, loudly: with one locale there is no translation branch to exercise. */
const whenMultiLocale = OTHER ? it : it.skip;

const cat = (id: string, name: string, parentId: string | null): Cat => ({
  id,
  slug: id,
  name,
  parentId,
  permalink: null,
  translations: null,
});

const product = (slug: string, category: Cat | null): Row => ({
  id: `p-${slug}`,
  slug,
  sku: null,
  name: slug.toUpperCase(),
  description: "",
  priceDkk: 9900,
  stock: 3,
  images: "[]",
  brand: null,
  attributes: null,
  permalink: null,
  categoryId: category?.id ?? null,
  category,
  variants: [],
  translations: null,
  deletedAt: null,
});

type El = { type: unknown; props: Record<string, unknown> };

function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}

async function render(slug: string, locale: string = LOCALE) {
  mocks.state.locale = locale;
  const tree = elements(await renderPageBody(page.default({ params: Promise.resolve({ slug, locale }) })));
  return {
    crumbs: tree.find((el) => el.type === Breadcrumbs)?.props.items,
    breadcrumbList: tree
      .filter((el) => el.type === JsonLd)
      .map((el) => el.props.data as Record<string, unknown>)
      .find((d) => d["@type"] === "BreadcrumbList"),
  };
}

const homeStep = (locale: string) => ({
  "@type": "ListItem",
  position: 1,
  name: homeBreadcrumbLabel(locale),
  item: "https://shop.dk",
});
const allStep = (locale: string) => ({
  "@type": "ListItem",
  position: 2,
  name: "All products",
  item: `https://shop.dk/${locale}/produkter`,
});
const HOME = homeStep(LOCALE);
const ALL = allStep(LOCALE);

beforeEach(() => {
  mocks.rows.splice(0);
  mocks.cats.splice(0);
  mocks.state.treeFails = false;
  mocks.prisma.category.findMany.mockClear();
  mocks.getBrand.mockResolvedValue({
    ecommerceEnabled: true,
    defaultLocale: brand.defaultLocale,
    url: "https://shop.dk",
    storeName: "Shop",
    locales: [...brand.locales],
    features: { breadcrumbs: true },
    metadata: { description: "Shop description" },
    policies: { currency: "DKK", country: "DK", shippingDefaultDkk: 0, returnDays: 14 },
    uiLabels: { categoryAllProductsBreadcrumb: "All products" },
  });
});

describe("a product in a top-level category — byte-identical to origin/main", () => {
  beforeEach(() => {
    const tea = cat("tea", "Tea", null);
    mocks.cats.push(tea);
    mocks.rows.push(product("sencha", tea), product("loose", null));
  });

  it("emits the same BreadcrumbList, key order included, and skips the tree query", async () => {
    const { breadcrumbList } = await render("sencha");
    // origin/main: app/[locale]/product/[slug]/page.tsx, home → all → category → product.
    const main = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        HOME,
        ALL,
        { "@type": "ListItem", position: 3, name: "Tea", item: `https://shop.dk/${LOCALE}/category/tea` },
        { "@type": "ListItem", position: 4, name: "SENCHA", item: `https://shop.dk/${LOCALE}/product/sencha` },
      ],
    };
    expect(JSON.stringify(breadcrumbList)).toBe(JSON.stringify(main));
    expect(mocks.prisma.category.findMany).not.toHaveBeenCalled();
  });

  it("hands <Breadcrumbs> the same four steps", async () => {
    const { crumbs } = await render("sencha");
    expect(crumbs).toStrictEqual([
      { label: HOME.name, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Tea", href: `/${LOCALE}/category/tea` },
      { label: "SENCHA" },
    ]);
  });

  it("a product without a category keeps its three steps", async () => {
    const { breadcrumbList, crumbs } = await render("loose");
    expect(JSON.stringify(breadcrumbList?.itemListElement)).toBe(
      JSON.stringify([
        HOME,
        ALL,
        { "@type": "ListItem", position: 3, name: "LOOSE", item: `https://shop.dk/${LOCALE}/product/loose` },
      ]),
    );
    expect(crumbs).toHaveLength(3);
    expect(mocks.prisma.category.findMany).not.toHaveBeenCalled();
  });
});

describe("a product in a leaf of a 3-level tree", () => {
  beforeEach(() => {
    const leaf = cat("type-1", "Type 1", "komposithegn");
    mocks.cats.push(cat("hegn", "Hegn", null), cat("komposithegn", "Komposithegn", "hegn"), leaf);
    mocks.rows.push(product("panel", leaf));
  });

  it("walks the whole chain, visible and JSON-LD alike", async () => {
    const { crumbs, breadcrumbList } = await render("panel");
    expect(crumbs).toStrictEqual([
      { label: HOME.name, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Hegn", href: `/${LOCALE}/category/hegn` },
      { label: "Komposithegn", href: `/${LOCALE}/category/komposithegn` },
      { label: "Type 1", href: `/${LOCALE}/category/type-1` },
      { label: "PANEL" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      HOME,
      ALL,
      { "@type": "ListItem", position: 3, name: "Hegn", item: `https://shop.dk/${LOCALE}/category/hegn` },
      { "@type": "ListItem", position: 4, name: "Komposithegn", item: `https://shop.dk/${LOCALE}/category/komposithegn` },
      { "@type": "ListItem", position: 5, name: "Type 1", item: `https://shop.dk/${LOCALE}/category/type-1` },
      { "@type": "ListItem", position: 6, name: "PANEL", item: `https://shop.dk/${LOCALE}/product/panel` },
    ]);
    expect(mocks.prisma.category.findMany).toHaveBeenCalledTimes(1);
  });

  it("reads the tree with the columns both trails need", async () => {
    await render("panel");
    // Literal keys, not CATEGORY_TREE_SELECT: a column dropped from the
    // constant must fail here, not be compared with itself.
    expect(mocks.prisma.category.findMany).toHaveBeenCalledWith({
      select: { id: true, parentId: true, slug: true, name: true, permalink: true, translations: true },
    });
  });

  whenMultiLocale("on another locale the ancestors are translated and link in that locale", async () => {
    mocks.cats.find((c) => c.id === "hegn")!.translations = { [OTHER!]: { name: "Fences" } };
    const { crumbs, breadcrumbList } = await render("panel", OTHER!);
    expect(crumbs).toStrictEqual([
      { label: homeBreadcrumbLabel(OTHER!), href: `/${OTHER}` },
      { label: "All products", href: `/${OTHER}/produkter` },
      { label: "Fences", href: `/${OTHER}/category/hegn` },
      // No translation stored: the base name, still linked in the page's locale.
      { label: "Komposithegn", href: `/${OTHER}/category/komposithegn` },
      { label: "Type 1", href: `/${OTHER}/category/type-1` },
      { label: "PANEL" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      homeStep(OTHER!),
      allStep(OTHER!),
      { "@type": "ListItem", position: 3, name: "Fences", item: `https://shop.dk/${OTHER}/category/hegn` },
      { "@type": "ListItem", position: 4, name: "Komposithegn", item: `https://shop.dk/${OTHER}/category/komposithegn` },
      { "@type": "ListItem", position: 5, name: "Type 1", item: `https://shop.dk/${OTHER}/category/type-1` },
      { "@type": "ListItem", position: 6, name: "PANEL", item: `https://shop.dk/${OTHER}/product/panel` },
    ]);
  });
});

describe("a failed tree query renders the trail as it was before the tree", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.treeFails = true;
    const leaf = cat("type-1", "Type 1", "komposithegn");
    mocks.cats.push(cat("hegn", "Hegn", null), cat("komposithegn", "Komposithegn", "hegn"), leaf);
    mocks.rows.push(product("panel", leaf));
  });

  afterEach(() => consoleError.mockRestore());

  it("home → all → the category → the product, visible and JSON-LD alike", async () => {
    const { crumbs, breadcrumbList } = await render("panel");
    expect(crumbs).toStrictEqual([
      { label: HOME.name, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Type 1", href: `/${LOCALE}/category/type-1` },
      { label: "PANEL" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      HOME,
      ALL,
      { "@type": "ListItem", position: 3, name: "Type 1", item: `https://shop.dk/${LOCALE}/category/type-1` },
      { "@type": "ListItem", position: 4, name: "PANEL", item: `https://shop.dk/${LOCALE}/product/panel` },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "[product] category tree failed, falling back to []:",
      expect.any(Error),
    );
  });
});
