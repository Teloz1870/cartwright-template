import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CAT-FORM-TRANSLATIONS-WIPE — saving a category in /admin/kategorier must not
 * lose its stored translations.
 *
 * It did, on every webshop: the edit page handed the form no `translations`,
 * so the form's English fields started empty and its hidden `translations`
 * input posted `{ en: { name: "", … } }`; `updateCategory` then wrote that
 * over the column. One click on "Save category" erased the English copy and
 * every other locale the row held.
 *
 * The first test walks the whole path an untouched save takes — edit page →
 * form markup → hidden input → server action → the row written. prisma,
 * requireAdmin, revalidatePath, the tool registry and the AI SEO action are
 * mocked; nothing here touches a database or the network. `findUnique` answers
 * as Prisma does — only the row `where.id` names, narrowed to a `select` — so
 * an action that stopped selecting `translations` would merge into nothing.
 */

const mocks = vi.hoisted(() => ({
  prisma: { category: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({ invokeTool: vi.fn() }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: vi.fn() }));
vi.mock("@/app/admin/kategorier/actions", () => ({ generateCategorySEOAction: vi.fn() }));

const { default: EditCategoryPage } = await import("@/app/admin/kategorier/[id]/page");
const { default: CategoryForm } = await import("@/components/admin/CategoryForm");
const { updateCategory } = await import("@/app/admin/actions");

const STORED = {
  en: { name: "Sunglasses", description: "UV400 frames", descriptionLong: "## Why UV400" },
  de: { name: "Sonnenbrillen", description: "UV400-Gestelle" },
};

const ROW = {
  id: "c1",
  name: "Solbriller",
  slug: "solbriller",
  description: "UV400-stel",
  heroImage: null,
  heroVideo: null,
  descriptionLong: null,
  metaTitle: null,
  metaDescription: null,
  faq: null,
  translations: STORED,
};

/** `findUnique` as Prisma answers it: the row `where.id` names, narrowed to a `select`. */
function findUniqueOf(row: { id: string } & Record<string, unknown>) {
  return async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
    if (where.id !== row.id) return null;
    if (!select) return row;
    return Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
  };
}

beforeEach(() => {
  mocks.prisma.category.findUnique.mockReset().mockImplementation(findUniqueOf(ROW));
  mocks.prisma.category.update.mockReset().mockResolvedValue(ROW);
});

/** Every named field the form posts — a browser sends the empty ones as "". */
function categoryForm(translations: string): FormData {
  const fd = new FormData();
  fd.set("name", ROW.name);
  fd.set("slug", ROW.slug);
  fd.set("description", ROW.description);
  for (const field of ["heroImage", "heroVideo", "metaTitle", "metaDescription", "descriptionLong", "faq"]) {
    fd.set(field, "");
  }
  fd.set("translations", translations);
  return fd;
}

/** The `translations` the last `prisma.category.update` call wrote. */
function written(): unknown {
  return mocks.prisma.category.update.mock.calls.at(-1)?.[0].data.translations;
}

/** The value of the form's hidden `translations` input, as a browser would post it. */
function postedTranslations(form: ReactElement): string {
  const match = renderToStaticMarkup(form).match(/name="translations" value="([^"]*)"/);
  if (!match) throw new Error("no hidden translations input in the form markup");
  return match[1].replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

describe("saving a category in admin keeps its translations", () => {
  it("an untouched save writes back exactly what was stored — every locale", async () => {
    const page = await EditCategoryPage({ params: Promise.resolve({ id: "c1" }) });
    const children = (page.props as { children: unknown[] }).children;
    const form = children.find(
      (child): child is ReactElement => isValidElement(child) && child.type === CategoryForm,
    );
    if (!form) throw new Error("the edit page renders no CategoryForm");

    expect(await updateCategory("c1", categoryForm(postedTranslations(form)))).toEqual({ ok: true });
    expect(written()).toEqual(STORED);
  });

  it("an edited English field is saved; other locales and fields the form does not show stay", async () => {
    mocks.prisma.category.findUnique.mockImplementation(
      findUniqueOf({ ...ROW, translations: { ...STORED, en: { ...STORED.en, metaTitle: "Sunglasses | Shop" } } }),
    );
    const posted = { en: { name: "Shades", description: "UV400 frames", descriptionLong: "## Why UV400" } };

    await updateCategory("c1", categoryForm(JSON.stringify(posted)));

    expect(written()).toEqual({
      en: { name: "Shades", description: "UV400 frames", descriptionLong: "## Why UV400", metaTitle: "Sunglasses | Shop" },
      de: STORED.de,
    });
  });

  it("an emptied English field is cleared — and only that field", async () => {
    const posted = { en: { name: "Sunglasses", description: "", descriptionLong: "## Why UV400" } };

    await updateCategory("c1", categoryForm(JSON.stringify(posted)));

    expect(written()).toEqual({ ...STORED, en: { ...STORED.en, description: "" } });
  });

  it("a row whose column comes back as JSON text opens filled, so an untouched save keeps it", async () => {
    mocks.prisma.category.findUnique.mockImplementation(findUniqueOf({ ...ROW, translations: JSON.stringify(STORED) }));
    const page = await EditCategoryPage({ params: Promise.resolve({ id: "c1" }) });
    const children = (page.props as { children: unknown[] }).children;
    const form = children.find(
      (child): child is ReactElement => isValidElement(child) && child.type === CategoryForm,
    );
    if (!form) throw new Error("the edit page renders no CategoryForm");

    await updateCategory("c1", categoryForm(postedTranslations(form)));
    expect(written()).toEqual(STORED);
  });

  it("a save that posts no translations leaves the column alone", async () => {
    mocks.prisma.category.findUnique.mockImplementation(findUniqueOf({ ...ROW, translations: null }));

    await updateCategory("c1", categoryForm(""));

    expect(mocks.prisma.category.update).toHaveBeenCalledTimes(1);
    expect(written()).toBeUndefined();
  });
});

describe("mergeTranslations", () => {
  it("reads a row whose column came back as JSON text, as translatedField does", async () => {
    const { mergeTranslations } = await import("@/lib/translated-field");
    expect(mergeTranslations(JSON.stringify(STORED), { en: { name: "Shades" } })).toEqual({
      ...STORED,
      en: { ...STORED.en, name: "Shades" },
    });
  });

  it("a locale posted as something other than a bag of fields changes nothing", async () => {
    const { mergeTranslations } = await import("@/lib/translated-field");
    expect(mergeTranslations(STORED, { en: null, de: "x" })).toEqual(STORED);
    expect(mergeTranslations(STORED, { en: ["x"], de: '["y"]' })).toEqual(STORED);
    expect(mergeTranslations(STORED, '[{"name":"x"}]')).toEqual(STORED);
    expect(mergeTranslations(null, { en: null })).toEqual({});
  });

  it("a locale posted as JSON text with nothing stored lands parsed", async () => {
    const { mergeTranslations } = await import("@/lib/translated-field");
    expect(mergeTranslations(null, { en: '{"name":"Shades"}' })).toEqual({ en: { name: "Shades" } });
  });

  it("a posted __proto__ locale stays an own key and does not re-parent the result", async () => {
    const { mergeTranslations } = await import("@/lib/translated-field");
    const merged = mergeTranslations(STORED, JSON.parse('{"__proto__":{"name":"x"}}'));
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.hasOwn(merged ?? {}, "__proto__")).toBe(true);
    expect(merged?.de).toEqual(STORED.de);
  });
});
