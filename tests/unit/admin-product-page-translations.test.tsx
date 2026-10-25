import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The product and CMS-page siblings of CAT-FORM-TRANSLATIONS-WIPE (the full
 * page → form → action walk is in admin-category-translations.test.tsx).
 *
 * Both edit pages handed their form no `translations`, so its English fields
 * opened empty, and both actions wrote the posted `{ en: … }` over the column:
 * a save erased the English copy and every other locale — and, on a page, the
 * `en.vibeHtml` the Vibe Sandbox and /api/admin/vibe/translate store there,
 * which the page form has no input for.
 *
 * prisma, requireAdmin, getFeatures, revalidatePath, the tool registry,
 * IndexNow and the AI SEO action are mocked; nothing touches a database.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findUnique: vi.fn(), update: vi.fn() },
    category: { findMany: vi.fn() },
    page: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }) }));
vi.mock("@/lib/brand", () => ({ getFeatures: vi.fn().mockResolvedValue({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({ invokeTool: vi.fn() }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: vi.fn() }));
vi.mock("@/app/admin/produkter/actions", () => ({ generateProductSEOAction: vi.fn() }));

const { default: EditProductPage } = await import("@/app/admin/produkter/[id]/page");
const { default: ProductForm } = await import("@/components/admin/ProductForm");
const { default: EditPagePage } = await import("@/app/admin/sider/[id]/page");
const { default: PageForm } = await import("@/components/admin/PageForm");
const { updateProduct, updatePage } = await import("@/app/admin/actions");

const PRODUCT_STORED = {
  en: { name: "Aviator", description: "Gold frame, green lens", tagline: "Since 1937" },
  de: { name: "Pilotenbrille", description: "Goldrahmen, grünes Glas" },
};
const PAGE_STORED = {
  en: { title: "About", body: "Who we are", vibeHtml: "<section>About us</section>" },
  de: { title: "Über uns", vibeHtml: "<section>Über uns</section>" },
};

beforeEach(() => {
  for (const model of Object.values(mocks.prisma)) for (const fn of Object.values(model)) fn.mockReset();
  mocks.prisma.product.findUnique.mockResolvedValue({
    id: "p1",
    name: "Pilotbrille",
    slug: "aviator",
    description: "Guldstel, grønt glas",
    priceDkk: 99900,
    images: "[]",
    stock: 3,
    categoryId: "c1",
    featured: false,
    attributes: null,
    variants: [],
    translations: PRODUCT_STORED,
  });
  mocks.prisma.product.update.mockResolvedValue({});
  mocks.prisma.category.findMany.mockResolvedValue([]);
  mocks.prisma.page.findUnique.mockResolvedValue({
    id: "g1",
    slug: "om-os",
    title: "Om os",
    body: "Hvem vi er",
    status: "published",
    translations: PAGE_STORED,
  });
  mocks.prisma.page.update.mockResolvedValue({ id: "g1", slug: "om-os", status: "published" });
});

/** The props of the first child of `page` rendered by `component`. */
function formProps(page: ReactElement, component: unknown): Record<string, unknown> {
  const children = (page.props as { children: unknown[] }).children;
  const form = children.find((child): child is ReactElement => isValidElement(child) && child.type === component);
  if (!form) throw new Error("the edit page renders no form");
  return form.props as Record<string, unknown>;
}

/** A browser posts every named field; the empty ones as "". */
function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const PRODUCT_FIELDS = {
  name: "Pilotbrille",
  slug: "aviator",
  description: "Guldstel, grønt glas",
  priceKr: "999",
  stock: "3",
  categoryId: "c1",
  ...Object.fromEntries(
    ["frameColor", "lensColor", "brand", "images", "attributes", "answerSummary", "faq", "useCases", "comparisonFacts"].map(
      (f) => [f, ""],
    ),
  ),
};

describe("product edit: translations survive a save", () => {
  it("the edit page hands the form the stored translations", async () => {
    const page = await EditProductPage({ params: Promise.resolve({ id: "p1" }) });
    const { product } = formProps(page, ProductForm) as { product: { translations?: unknown } };
    expect(product.translations).toEqual(PRODUCT_STORED);
  });

  it("an edited English name is saved; German and fields the form does not show stay", async () => {
    const posted = { en: { name: "Aviator Classic", description: "Gold frame, green lens" } };
    const result = await updateProduct("p1", formData({ ...PRODUCT_FIELDS, translations: JSON.stringify(posted) }));

    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.product.update.mock.calls[0][0].data.translations).toEqual({
      ...PRODUCT_STORED,
      en: { ...PRODUCT_STORED.en, name: "Aviator Classic" },
    });
  });
});

describe("CMS page edit: translations survive a save", () => {
  it("the edit page hands the form the stored translations", async () => {
    const page = await EditPagePage({ params: Promise.resolve({ id: "g1" }) });
    const { page: props } = formProps(page, PageForm) as { page: { translations?: unknown } };
    expect(props.translations).toEqual(PAGE_STORED);
  });

  it("a Vibe Sandbox save (it posts vibeHtml) wins in every locale: stale German vibe HTML goes, the posted English lands", async () => {
    const posted = { en: { title: "About us", body: "Vibe Page Layout", vibeHtml: "<section>New</section>" } };
    await updatePage(
      "g1",
      formData({ slug: "om-os", title: "Om os", body: "Vibe Page Layout", vibeHtml: "<section>Ny</section>", translations: JSON.stringify(posted) }),
    );
    expect(mocks.prisma.page.update.mock.calls[0][0].data.translations).toEqual({
      en: posted.en,
      de: { title: "Über uns" },
    });
  });

  it("a save from the page form keeps German and the English vibeHtml it has no input for", async () => {
    const posted = { en: { title: "About us", body: "Who we are" } };
    const result = await updatePage(
      "g1",
      formData({ slug: "om-os", title: "Om os", body: "Hvem vi er", translations: JSON.stringify(posted) }),
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.page.update.mock.calls[0][0].data.translations).toEqual({
      ...PAGE_STORED,
      en: { ...PAGE_STORED.en, title: "About us" },
    });
  });
});
