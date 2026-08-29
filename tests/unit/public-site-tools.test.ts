import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), queryRaw: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { page: { findMany: mocks.findMany, findFirst: mocks.findFirst }, $queryRaw: mocks.queryRaw } }));

describe("public site tools", () => {
  beforeEach(() => vi.resetAllMocks());

  it("list_pages enforces published status in the database query", async () => {
    mocks.findMany.mockResolvedValue([{ slug: "about", title: "About", metaDescription: null, updatedAt: new Date(0) }]);
    const { listPublicPages } = await import("@/lib/tools/site");
    const result = await listPublicPages.handler({ locale: "en" }, { actor: "system:test" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "published" } }));
    expect(result).toEqual([expect.objectContaining({ slug: "about", url: "/en/about" })]);
  });

  it("get_page cannot return a draft because status is part of findFirst", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const { getPublicPage } = await import("@/lib/tools/site");
    await expect(getPublicPage.handler({ slug: "secret-draft", locale: "en" }, { actor: "system:test" })).resolves.toEqual({ found: false, slug: "secret-draft" });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "secret-draft", status: "published" } }));
  });

  it("maps a published page to a strict public DTO", async () => {
    mocks.findFirst.mockResolvedValue({
      slug: "privacy",
      title: "Privacy",
      body: "Published policy",
      bodyFormat: null,
      heroImage: null,
      metaTitle: "Privacy policy",
      metaDescription: "How data is handled",
      updatedAt: new Date("2026-08-23T12:00:00.000Z"),
      // Backing-page implementation/admin fields must not cross the public tool.
      showInNav: 0,
      navOrder: 99,
      // The BAG itself is an implementation field and never crosses the
      // boundary. Its per-locale VALUES do — but only for a locale this shop
      // publishes, which `de` is not (brand.locales is ["da","en"]). So the
      // requested `en` takes the translation branch, finds nothing, and the
      // base column wins.
      translations: { de: { title: "Datenschutz" } },
      vibeHtml: "<main>raw takeover</main>",
      layoutJson: '{"sections":[]}',
    });
    const { getPublicPage } = await import("@/lib/tools/site");
    const result = await getPublicPage.handler(
      { slug: "privacy", locale: "en" },
      { actor: "system:test" },
    );

    expect(result).toEqual({
      slug: "privacy",
      title: "Privacy",
      body: "Published policy",
      bodyFormat: null,
      heroImage: null,
      metaTitle: "Privacy policy",
      metaDescription: "How data is handled",
      updatedAt: "2026-08-23T12:00:00.000Z",
    });
    expect(Object.keys(result as object)).not.toContain("translations");
    expect(getPublicPage.output?.safeParse(result).success).toBe(true);
  });

  it("supports pre-draft databases only when Page.status is the missing column", async () => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValue([{ slug: "about", title: "About", metaDescription: null, updatedAt: new Date(0) }]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(listPublicPages.handler({ locale: "en" }, { actor: "system:test" })).resolves.toEqual([
      expect.objectContaining({ slug: "about", url: "/en/about" }),
    ]);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("parameterizes the slug when reading from a pre-draft database", async () => {
    mocks.findFirst.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValue([{ slug: "about", title: "About", body: "Our story", metaDescription: null, updatedAt: new Date(0) }]);
    const { getPublicPage } = await import("@/lib/tools/site");
    await expect(getPublicPage.handler({ slug: "about", locale: "en" }, { actor: "system:test" })).resolves.toEqual(
      expect.objectContaining({ slug: "about", body: "Our story" }),
    );
    expect(mocks.queryRaw.mock.calls[0]?.[1]).toBe("about");
  });

  it("never hides unrelated database failures behind the legacy fallback", async () => {
    mocks.findMany.mockRejectedValue(new Error("connection refused"));
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(listPublicPages.handler({ locale: "en" }, { actor: "system:test" })).rejects.toThrow("connection refused");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

/**
 * The `locale` argument decided the URL a page was announced under long before
 * it decided the words. An agent that asks for `da` and is handed the source
 * language cannot tell — it just quotes the wrong language to a customer.
 *
 * The secondary locale is DERIVED from `brand.locales`, not typed. Hardcoding
 * `"en"` was true only while the engine's own default was `da`: on the
 * single-locale `["en"]` shop `create-cartwright` actually produces, `en` IS
 * the default, `translatedField` short-circuits to the base column, and five
 * assertions here failed on a scaffold that had done nothing wrong. A shop
 * with no second locale cannot exercise a translation branch at all, so those
 * cases skip — stated, never silently.
 * Only `title` and `body` are translated — the two fields lib/translations.ts
 * actually writes; the meta fields pass through verbatim.
 */
describe("public site tools answer in the locale they were asked for", () => {
  beforeEach(() => vi.resetAllMocks());

  /** A locale this shop publishes that is NOT its source language, or undefined. */
  const SECONDARY = brand.locales.find((l) => l !== brand.defaultLocale);
  /** Skip, loudly: with one locale there is no translation branch to exercise. */
  const whenMultiLocale = SECONDARY ? it : it.skip;

  const translated = {
    slug: "brewing",
    title: "Sådan brygger vi",
    body: "Vores metode.",
    bodyFormat: null,
    heroImage: null,
    metaTitle: "Sådan brygger vi — Northbound",
    metaDescription: "Noter fra baren.",
    updatedAt: new Date("2026-08-23T12:00:00.000Z"),
    showInNav: 1,
    navOrder: 1,
    // Keyed on the derived locale, so the bag always holds the language the
    // assertions ask for — whatever this shop's second locale happens to be.
    translations: SECONDARY
      ? { [SECONDARY]: { title: "How we brew", body: "Our method." } }
      : {},
    vibeHtml: null,
    layoutJson: null,
  };

  whenMultiLocale("list_pages returns the requested locale's title", async () => {
    mocks.findMany.mockResolvedValue([translated]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "How we brew" })]);
  });

  /** Regression guard (passes against the pre-fix code by construction). */
  it("list_pages keeps the source text when no locale is asked for", async () => {
    mocks.findMany.mockResolvedValue([translated]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(listPublicPages.handler({}, { actor: "system:test" })).resolves.toEqual([
      expect.objectContaining({ title: "Sådan brygger vi" }),
    ]);
  });

  it("list_pages selects the translation bag it needs", async () => {
    mocks.findMany.mockResolvedValue([]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ translations: true }),
      }),
    );
  });

  whenMultiLocale("get_page returns the requested locale's title and body", async () => {
    mocks.findFirst.mockResolvedValue(translated);
    const { getPublicPage } = await import("@/lib/tools/site");
    const result = await getPublicPage.handler(
      { slug: "brewing", locale: SECONDARY },
      { actor: "system:test" },
    );
    expect(result).toEqual(
      expect.objectContaining({ title: "How we brew", body: "Our method." }),
    );
    expect(getPublicPage.output?.safeParse(result).success).toBe(true);
  });

  whenMultiLocale("get_page falls back to the source text field by field", async () => {
    mocks.findFirst.mockResolvedValue({
      ...translated,
      // Only the title was ever translated: the body must stay readable in the
      // source language rather than collapsing to an empty string.
      translations: { en: { title: "How we brew" } },
    });
    const { getPublicPage } = await import("@/lib/tools/site");
    await expect(
      getPublicPage.handler({ slug: "brewing", locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual(
      expect.objectContaining({ title: "How we brew", body: "Vores metode." }),
    );
  });

  /**
   * These tools are anonymous and the locale is a KEY into the translation bag.
   * A bag can carry locales the shop never publishes — a sitepack import copies
   * the whole bag verbatim — so an unclamped key would let a caller enumerate
   * unpublished copy. `de` is absent from brand.locales (["da","en"]).
   */
  it("refuses to read a locale this shop does not publish", async () => {
    mocks.findFirst.mockResolvedValue(translated);
    mocks.findMany.mockResolvedValue([translated]);
    const { getPublicPage, listPublicPages } = await import("@/lib/tools/site");

    await expect(
      getPublicPage.handler({ slug: "brewing", locale: "de" }, { actor: "system:test" }),
    ).resolves.toEqual(
      expect.objectContaining({ title: "Sådan brygger vi", body: "Vores metode." }),
    );
    await expect(
      listPublicPages.handler({ locale: "de" }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "Sådan brygger vi" })]);
  });

  /**
   * The legacy `$queryRaw` fallbacks bypass Prisma's JSON deserialisation, so
   * SQLite hands the column back as TEXT. Reading it as an object meant those
   * installations silently never translated at all.
   */
  whenMultiLocale("reads a translation bag that came back from raw SQL as text", async () => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValue([
      {
        slug: "brewing",
        title: "Sådan brygger vi",
        metaDescription: null,
        updatedAt: new Date(0),
        translations: JSON.stringify({ en: { title: "How we brew" } }),
      },
    ]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "How we brew" })]);
  });

  /**
   * `Page.translations` (2026-05-24) predates `Page.status` (2026-06-14), so a
   * database old enough to need the fallback normally has it — but an even
   * older one does not, and the fallback exists to keep THAT database serving.
   * It must degrade to source text, never turn into a 500.
   *
   * The error strings here are the ones real drivers emit, not an invented
   * shape: SQLite names an UNQUALIFIED column (the raw query wrote it bare),
   * Postgres says `column "x" does not exist`. Asserting against a fabricated
   * `main.Page.translations` would have passed while the guard stayed dead.
   */
  it.each([
    ["sqlite, unqualified", "SQLITE_ERROR: no such column: translations"],
    ["postgres", 'column "translations" does not exist'],
  ])("still serves a database that predates the translations column (%s)", async (_label, message) => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce([
        { slug: "brewing", title: "Sådan brygger vi", metaDescription: null, updatedAt: new Date(0) },
      ]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "Sådan brygger vi" })]);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });

  /**
   * The measured shape of the OLDEST supported database (Prisma 7 + libSQL over
   * a real SQLite file): SQLite blames the FIRST unresolvable column in the
   * SELECT LIST, not the one in the WHERE clause. So once `translations` joined
   * the select, a pre-draft table stopped complaining about `Page.status` and
   * started complaining about `Page.translations` — and a status-only guard
   * rethrew, killing a fallback that worked before. llms.txt and the sitemap
   * catch it (they silently lose every CMS page); this tool does not (500).
   */
  it("recognises a pre-draft database that blames the newly selected column", async () => {
    mocks.findMany.mockRejectedValue(
      new Error(
        "Database error. Code: `1`. Message: `SQLITE_ERROR: no such column: main.Page.translations`",
      ),
    );
    mocks.queryRaw
      .mockRejectedValueOnce(
        new Error(
          "Raw query failed. Code: `1`. Message: `SQLITE_ERROR: no such column: translations`",
        ),
      )
      .mockResolvedValueOnce([
        { slug: "brewing", title: "Sådan brygger vi", metaDescription: null, updatedAt: new Date(0) },
      ]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "Sådan brygger vi" })]);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });

  it("does not mistake a real database failure for a missing column", async () => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).rejects.toThrow("connection refused");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  /**
   * SQLite's double-quoted-string misfeature means a raw
   * `SELECT "translations"` against a table without that column can return the
   * LITERAL text `translations` instead of erroring at all. A non-JSON bag must
   * degrade to source text, not blow up.
   */
  it("degrades to source text when the bag is not parseable JSON", async () => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValueOnce([
      {
        slug: "brewing",
        title: "Sådan brygger vi",
        metaDescription: null,
        updatedAt: new Date(0),
        translations: "translations",
      },
    ]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(
      listPublicPages.handler({ locale: SECONDARY }, { actor: "system:test" }),
    ).resolves.toEqual([expect.objectContaining({ title: "Sådan brygger vi" })]);
  });
});
