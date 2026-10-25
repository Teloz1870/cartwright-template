/**
 * ARG2: a design pack that frames the product page (DesignPack.webshop.pdpLayout
 * — halo, crema) is handed the product's name and description in the page's
 * language, the copy the page body itself renders. It used to get the raw row,
 * so crema's crumb on /en read the Danish base name above an English page.
 *
 * The route is driven for real (the pattern of pdp-category-breadcrumb.test.ts)
 * with the active design mocked to a pack whose `pdpLayout` is a stub, and the
 * returned element tree is read for the `product` the stub is given.
 *
 * Locales come from the shop's own `brand.config.ts` (tests/unit ships in
 * scaffolds, which are single-locale `["en"]`): the translated cases skip when
 * there is no second locale.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPageBody } from "../helpers/page-body";

import { brand } from "@/brand.config";

type Row = Record<string, unknown> & { slug: string; deletedAt: Date | null };

function FakeLayout(props: { product: unknown; children: ReactNode }) {
  return props.children;
}

const mocks = vi.hoisted(() => {
  const rows: Row[] = [];
  const state: { locale: string; design: unknown; override: string | null } = {
    locale: "",
    design: null,
    override: null,
  };
  const findOne = vi.fn(async ({ where }: { where: { slug?: string } }) => rows.find((r) => r.slug === where.slug) ?? null);
  return {
    rows,
    state,
    prisma: {
      product: { findUnique: findOne, findFirst: findOne, findMany: vi.fn(async () => []) },
      category: { findMany: vi.fn(async () => []) },
    },
    getBrand: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => mocks.state.design }));
vi.mock("@/lib/genome/read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/genome/read")>()),
  readEntityCopy: async (_kind: string, _id: string, _field: string, fallback: string) =>
    mocks.state.override ?? fallback,
}));
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

const LOCALE = brand.defaultLocale;
/** A locale this shop publishes that is NOT its source language, or undefined
 *  (a single-locale scaffold). `OTHER!` only inside `whenMultiLocale`. */
const OTHER = brand.locales.find((l) => l !== brand.defaultLocale);
const whenMultiLocale = OTHER ? it : it.skip;

const row = (slug: string, extra: Partial<Row> = {}): Row => ({
  id: `p-${slug}`,
  slug,
  sku: null,
  name: slug.toUpperCase(),
  description: "Base description",
  priceDkk: 9900,
  stock: 3,
  images: "[]",
  brand: null,
  attributes: { origin: "Base origin" },
  permalink: "/te/sencha/",
  categoryId: null,
  category: null,
  variants: [],
  translations: null,
  deletedAt: null,
  ...extra,
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
    tree,
    layout: tree.find((el) => el.type === FakeLayout)?.props.product as Record<string, unknown> | undefined,
  };
}

beforeEach(() => {
  mocks.rows.splice(0);
  mocks.state.design = { webshop: { pdpLayout: FakeLayout } };
  mocks.state.override = null;
  mocks.getBrand.mockResolvedValue({
    ecommerceEnabled: true,
    defaultLocale: brand.defaultLocale,
    url: "https://shop.dk",
    storeName: "Shop",
    locales: [...brand.locales],
    features: {},
    metadata: { description: "Shop description" },
    policies: { currency: "DKK", country: "DK", shippingDefaultDkk: 0, returnDays: 14 },
    uiLabels: { categoryAllProductsBreadcrumb: "All products" },
  });
});

describe("the product a design's pdpLayout is handed", () => {
  it("in the shop's own language it is the row, field for field", async () => {
    const sencha = row("sencha");
    mocks.rows.push(sencha);
    const { layout } = await render("sencha");
    expect(layout).toStrictEqual({ ...sencha });
    expect(layout?.translations).toBe(sencha.translations);
    expect(layout?.attributes).toBe(sencha.attributes);
  });

  whenMultiLocale("on another locale it carries the translated name and description", async () => {
    const translations = { [OTHER!]: { name: "Sencha EN", description: "Desc EN" } };
    mocks.rows.push(row("sencha", { translations }));
    const { layout } = await render("sencha", OTHER!);
    expect(layout?.name).toBe("Sencha EN");
    expect(layout?.description).toBe("Desc EN");
    // The rest stays raw: a pack localizes attributes from the bag itself.
    expect(layout?.translations).toBe(translations);
    expect(layout?.attributes).toStrictEqual({ origin: "Base origin" });
    expect(layout?.permalink).toBe("/te/sencha/");
    expect(layout?.slug).toBe("sencha");
  });

  whenMultiLocale("on another locale with no translation stored it keeps the base copy", async () => {
    mocks.rows.push(row("sencha", { translations: { [OTHER!]: { name: "" } } }));
    const { layout } = await render("sencha", OTHER!);
    expect(layout?.name).toBe("SENCHA");
    expect(layout?.description).toBe("Base description");
  });

  it("a product with no description keeps null, not an empty string", async () => {
    mocks.rows.push(row("sencha", { description: null }));
    const { layout } = await render("sencha");
    expect(layout?.description).toBeNull();
  });

  it("with genomeEntityCopy on it gets the voiced description the page body shows", async () => {
    mocks.getBrand.mockResolvedValue({ ...(await mocks.getBrand()), features: { genomeEntityCopy: true } });
    mocks.state.override = "Voiced description";
    mocks.rows.push(row("sencha"));
    const { tree, layout } = await render("sencha");
    expect(layout?.description).toBe("Voiced description");
    expect(tree.some((el) => el.type === "p" && el.props.children === "Voiced description")).toBe(true);
  });

  it("without a pack layout the page renders no frame", async () => {
    mocks.state.design = null;
    mocks.rows.push(row("sencha"));
    const { tree, layout } = await render("sencha");
    expect(layout).toBeUndefined();
    expect(tree.length).toBeGreaterThan(0);
  });
});
