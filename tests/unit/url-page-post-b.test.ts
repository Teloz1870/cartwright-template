import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes (as in url5b-serve-permalinks.test.ts):
// next-intl's middleware runs for real behind proxy.ts below.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

/**
 * URL-PAGE-POST-b — a published CMS page whose `permalink` is set answers at
 * that address (the proxy rewrites it to the page's route), and the sitemap,
 * the canonical/hreflang and the links name that same address — through one
 * rule (`servedPagePermalinks` + `pageHref`). A draft, a trust alias and a page
 * that shares its permalink with a product or a category are not served there,
 * and every surface keeps the old address for them. With no page permalink
 * (every shop today) or the option off, nothing changes.
 *
 * The fake database applies the `where` the code sends, so a dropped filter
 * shows up as a served draft, not as a different query object.
 */

type Row = { slug: string; permalink: string | null; status?: string; deletedAt?: Date | null };
const rows = vi.hoisted(() => ({
  pages: [] as Row[],
  categories: [] as Row[],
  products: [] as Row[],
  pageReads: 0,
  pageError: null as Error | null,
}));

type Where = { permalink?: { not: null }; status?: string; deletedAt?: null };
function applyWhere(list: Row[], where: Where = {}): Row[] {
  return list.filter((row) =>
    Object.entries(where).every(([key, wanted]) => {
      const value = row[key as keyof Row];
      if (key === "permalink") return value !== null && value !== undefined;
      return value === wanted;
    }),
  );
}
const pick = (list: Row[]) => list.map(({ slug, permalink }) => ({ slug, permalink }));

function fakePrisma() {
  return {
    category: { findMany: async (q: { where?: Where } = {}) => pick(applyWhere(rows.categories, q.where)) },
    product: {
      findMany: async (q: { where?: Where } = {}) =>
        applyWhere(rows.products, q.where).map((r) => ({ ...pick([r])[0], createdAt: new Date("2026-11-01T00:00:00Z") })),
    },
    page: {
      findMany: async (q: { where?: Where } = {}) => {
        rows.pageReads++;
        if (rows.pageError) throw rows.pageError;
        return pick(applyWhere(rows.pages, q.where));
      },
    },
    post: { findMany: async () => [] },
    redirect: { findMany: async () => [] },
  };
}

function fixture(): void {
  rows.pages = [
    { slug: "levering", status: "published", permalink: "/levering-og-fragt/" },
    // Stored non-ASCII, asked for percent-encoded.
    { slug: "aebler", status: "published", permalink: "/æbler/" },
    // A slug the rewrite has to encode (an importer is not held to [a-z0-9-]).
    { slug: "æble og pære", status: "published", permalink: "/frugt/" },
    // A draft legal page: /info/terms shows the built-in text; its old address is not served.
    { slug: "terms", status: "draft", permalink: "/handelsbetingelser/" },
    // Trust aliases keep their predictable route, in any case.
    { slug: "about", status: "published", permalink: "/om-virksomheden/" },
    { slug: "Privacy", status: "published", permalink: "/privat/" },
    // Collisions: the catalogue wins.
    { slug: "hegn-info", status: "published", permalink: "/hegn/komposithegn" },
    { slug: "type-1-info", status: "published", permalink: "/hegn/type-1/" },
    { slug: "kontaktinfo", status: "published", permalink: null },
  ];
  rows.categories = [{ slug: "komposit", permalink: "/hegn/komposithegn/" }];
  rows.products = [{ slug: "type-1", permalink: "/hegn/type-1", status: "active", deletedAt: null }];
}

/** The page summaries the sitemap reads (published only, as listPublishedPageSummaries does). */
const summaries = () =>
  rows.pages
    .filter((p) => p.status === "published")
    .map((p) => ({ slug: p.slug, title: p.slug, metaDescription: null, updatedAt: new Date("2026-11-02T00:00:00Z"), translations: null }));

const MODS = [
  "@/lib/db",
  "@/brand.config",
  "@/lib/brand",
  "@/lib/public-pages",
  "@/lib/theme",
  "@/lib/annotate/server",
  "@/lib/i18n-dynamic",
  "next/server",
  "next-auth",
  "@/lib/auth.config",
];

afterEach(() => {
  for (const mod of MODS) vi.doUnmock(mod);
  rows.pages = [];
  rows.categories = [];
  rows.products = [];
  rows.pageReads = 0;
  rows.pageError = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

const ORIGIN = "https://shop.example";

/** brand.config with these URL options and locales da + en; the database is the fake above. */
async function setup(urls: Record<string, unknown>) {
  vi.resetModules();
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  vi.doMock("@/brand.config", () => ({
    ...actual,
    brand: { ...actual.brand, locales: ["da", "en"], defaultLocale: "da", urls },
  }));
  vi.doMock("@/lib/db", () => ({ prisma: fakePrisma() }));
}

describe("the map: published pages join it, the catalogue wins a shared key", () => {
  it("reads published, non-alias pages with their stored spelling; a page that loses is logged", async () => {
    fixture();
    await setup({ permalinks: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { readPermalinkMap, servedPagePermalinks } = await import("@/lib/permalinks/resolve-request");
    const map = await readPermalinkMap();
    expect({ ...map }).toEqual({
      "/levering-og-fragt": { kind: "page", slug: "levering", permalink: "/levering-og-fragt/" },
      "/æbler": { kind: "page", slug: "aebler", permalink: "/æbler/" },
      "/frugt": { kind: "page", slug: "æble og pære", permalink: "/frugt/" },
      "/hegn/komposithegn": { kind: "category", slug: "komposit" },
      "/hegn/type-1": { kind: "product", slug: "type-1" },
    });
    expect([...servedPagePermalinks(map)]).toEqual([
      ["levering", "/levering-og-fragt/"],
      ["aebler", "/æbler/"],
      ["æble og pære", "/frugt/"],
    ]);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual([
      '[permalinks] page "hegn-info" is not served at /hegn/komposithegn: the category "komposit" holds it too and wins.',
      '[permalinks] page "type-1-info" is not served at /hegn/type-1: the product "type-1" holds it too and wins.',
    ]);
  });

  it("with no page permalink the map is the product/category map, and nothing is logged", async () => {
    fixture();
    rows.pages = rows.pages.map((p) => ({ ...p, permalink: null }));
    await setup({ permalinks: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { readPermalinkMap } = await import("@/lib/permalinks/resolve-request");
    expect({ ...(await readPermalinkMap()) }).toEqual({
      "/hegn/komposithegn": { kind: "category", slug: "komposit" },
      "/hegn/type-1": { kind: "product", slug: "type-1" },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("a database without Page.permalink still serves its product and category permalinks", async () => {
    fixture();
    await setup({ permalinks: true });
    rows.pageError = new Error("SQLITE_ERROR: no such column: main.Page.permalink");
    const { readPermalinkMap } = await import("@/lib/permalinks/resolve-request");
    expect(Object.keys(await readPermalinkMap())).toEqual(["/hegn/komposithegn", "/hegn/type-1"]);
    // Any other failure still fails the read (the proxy then keeps its last map).
    rows.pageError = new Error("connection reset");
    await expect(readPermalinkMap()).rejects.toThrow("connection reset");
  });
});

describe("resolvePermalinkRewrite: the route a served permalink is rewritten to", () => {
  const routing = { locales: ["da", "en"], defaultLocale: "da" } as const;

  it.each(["da", "en"])("a page lands on /info/<slug> in %s", async (locale) => {
    const { resolvePermalinkRewrite } = await import("@/lib/permalinks/resolve-request");
    const map = { "/levering-og-fragt": { kind: "page" as const, slug: "levering", permalink: "/levering-og-fragt/" } };
    expect(resolvePermalinkRewrite(`/${locale}/levering-og-fragt/`, map, routing)).toEqual({
      path: `/${locale}/info/levering`,
      locale,
    });
  });

  it("every slug is encoded: a page's, a product's and a category's (space, æ, ?, #)", async () => {
    const { resolvePermalinkRewrite } = await import("@/lib/permalinks/resolve-request");
    const map = {
      "/a": { kind: "page" as const, slug: "æble og pære", permalink: "/a/" },
      "/b": { kind: "product" as const, slug: "æble og pære" },
      "/c": { kind: "category" as const, slug: "a?b#c" },
    };
    const encoded = encodeURIComponent("æble og pære");
    expect(encoded).toBe("%C3%A6ble%20og%20p%C3%A6re");
    expect(resolvePermalinkRewrite("/da/a", map, routing)).toEqual({ path: `/da/info/${encoded}`, locale: "da" });
    expect(resolvePermalinkRewrite("/da/b", map, routing)).toEqual({ path: `/da/product/${encoded}`, locale: "da" });
    expect(resolvePermalinkRewrite("/en/c", map, routing)).toEqual({ path: "/en/category/a%3Fb%23c", locale: "en" });
  });
});

type Handler = (req: NextRequest) => Promise<Response> | Response;

async function loadProxy(urls: Record<string, unknown>): Promise<Handler> {
  await setup(urls);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  return (await import("@/proxy")).default as unknown as Handler;
}

const call = (proxy: Handler, path: string) =>
  proxy(Object.assign(new NextRequest(new URL(path, ORIGIN)), { auth: null }));
const rewriteOf = (res: Response) => res.headers.get("x-middleware-rewrite")?.replace(ORIGIN, "") ?? null;
const localeOf = (res: Response) => res.headers.get("x-middleware-request-x-next-intl-locale");

describe("the proxy serves a published page at its permalink", () => {
  it("in both locales, with and without the slash, and a percent-encoded request too", async () => {
    fixture();
    const proxy = await loadProxy({ permalinks: true });
    const en = await call(proxy, "/en/levering-og-fragt/");
    expect(rewriteOf(en)).toBe("/en/info/levering");
    expect(localeOf(en)).toBe("en");
    expect(rewriteOf(await call(proxy, "/da/levering-og-fragt"))).toBe("/da/info/levering");
    expect(rewriteOf(await call(proxy, `/da/${encodeURIComponent("æbler")}/`))).toBe("/da/info/aebler");
    expect(rewriteOf(await call(proxy, "/da/frugt/"))).toBe(`/da/info/${encodeURIComponent("æble og pære")}`);
  });

  it("not a draft's, not a trust alias's; a shared key goes to the product or the category", async () => {
    fixture();
    const proxy = await loadProxy({ permalinks: true });
    for (const path of ["/da/handelsbetingelser/", "/da/om-virksomheden/", "/en/privat/"]) {
      expect(rewriteOf(await call(proxy, path)), path).toBeNull();
    }
    expect(rewriteOf(await call(proxy, "/da/hegn/komposithegn/"))).toBe("/da/category/komposit");
    expect(rewriteOf(await call(proxy, "/da/hegn/type-1/"))).toBe("/da/product/type-1");
  });

  it("off: the page table is never read and nothing is rewritten", async () => {
    fixture();
    const proxy = await loadProxy({ permalinks: false });
    expect(rewriteOf(await call(proxy, "/da/levering-og-fragt/"))).toBeNull();
    expect(rows.pageReads).toBe(0);
    const { loadServedPagePermalinks } = await import("@/lib/permalinks/resolve-request");
    expect((await loadServedPagePermalinks()).size).toBe(0);
    expect(rows.pageReads).toBe(0);
  });
});

describe("pageHref: the address a page is linked at", () => {
  it("with no permalink, the object form is the string form byte for byte, on or off", async () => {
    for (const urls of [{ permalinks: false }, { permalinks: true }, { permalinks: true, trailingSlash: true }]) {
      await setup(urls);
      const { pageHref } = await import("@/lib/urls");
      for (const locale of ["da", "en", "{locale}"]) {
        for (const slug of ["levering", "about", "om-os", "contact", "privacy", "terms", "constructor"]) {
          expect(pageHref({ slug, permalink: null }, locale), `${slug} ${locale}`).toBe(pageHref(slug, locale));
        }
      }
    }
  });

  it("a served permalink is linked with the option on, the pattern with it off", async () => {
    await setup({ permalinks: true });
    const on = await import("@/lib/urls");
    expect(on.pageHref({ slug: "levering", permalink: "/levering-og-fragt/" }, "en")).toBe("/en/levering-og-fragt");
    expect(on.pageHref({ slug: "levering", permalink: "/levering-og-fragt/" }, "{locale}")).toBe("/{locale}/levering-og-fragt");
    await setup({ permalinks: false });
    const off = await import("@/lib/urls");
    expect(off.pageHref({ slug: "levering", permalink: "/levering-og-fragt/" }, "da")).toBe("/da/info/levering");
  });
});

const BRAND = {
  url: `${ORIGIN}/`,
  locales: ["da", "en"],
  ecommerceEnabled: true,
  features: { blog: false, mcpPublic: false },
  website: { showAuditFeed: false },
  storeName: "Shop",
};

async function sitemapUrls(urls: Record<string, unknown>) {
  await setup(urls);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-28T00:00:00Z"));
  vi.doMock("@/lib/brand", () => ({ getBrand: async () => BRAND }));
  vi.doMock("@/lib/public-pages", () => ({ listPublishedPageSummaries: async () => summaries() }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { default: sitemap } = await import("@/app/sitemap");
  return sitemap();
}

describe("the sitemap lists a served page at its permalink", () => {
  it("in both locales; a draft is absent, a shadowed or permalink-less page keeps /info/<slug>", async () => {
    fixture();
    const urls = (await sitemapUrls({ permalinks: true })).map((e) => e.url);
    for (const locale of ["da", "en"]) {
      expect(urls).toContain(`${ORIGIN}/${locale}/levering-og-fragt`);
      expect(urls).not.toContain(`${ORIGIN}/${locale}/info/levering`);
      expect(urls).toContain(`${ORIGIN}/${locale}/æbler`);
      expect(urls).toContain(`${ORIGIN}/${locale}/frugt`);
      expect(urls).toContain(`${ORIGIN}/${locale}/info/hegn-info`);
      expect(urls).toContain(`${ORIGIN}/${locale}/info/type-1-info`);
      expect(urls).toContain(`${ORIGIN}/${locale}/info/kontaktinfo`);
    }
    expect(urls.some((u) => u.includes("handelsbetingelser") || u.includes("om-virksomheden") || u.includes("privat/"))).toBe(false);
  });

  it("with no page permalink stored, the sitemap is the option-off sitemap entry for entry", async () => {
    fixture();
    rows.pages = rows.pages.map((p) => ({ ...p, permalink: null }));
    rows.categories = rows.categories.map((c) => ({ ...c, permalink: null }));
    rows.products = rows.products.map((p) => ({ ...p, permalink: null }));
    const on = await sitemapUrls({ permalinks: true });
    const off = await sitemapUrls({ permalinks: false });
    expect(on).toEqual(off);
    expect(off.map((e) => e.url)).toContain(`${ORIGIN}/da/info/levering`);
  });
});

async function metadataFor(urls: Record<string, unknown>, publicSlug: string, locale: string) {
  await setup(urls);
  vi.doMock("@/lib/brand", () => ({ getBrand: async () => BRAND }));
  vi.doMock("@/lib/public-pages", () => ({
    findFirstPublishedPageBySlugs: async (slugs: readonly string[]) => {
      const row = rows.pages.find((p) => slugs.includes(p.slug) && p.status === "published");
      return row ? { ...row, title: row.slug, metaTitle: null, metaDescription: null, heroImage: null } : null;
    },
  }));
  vi.doMock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
  vi.doMock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
  vi.doMock("@/lib/i18n-dynamic", () => ({ getDynamicTranslation: async (_e: unknown, _f: string, base: string) => base }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { buildPublicInfoMetadata } = await import("@/app/[locale]/info/[slug]/page");
  return (await buildPublicInfoMetadata({ locale, publicSlug })).alternates;
}

describe("the page's canonical and hreflang name the served address", () => {
  it.each(["da", "en"])("in %s, for every locale", async (locale) => {
    fixture();
    const alternates = await metadataFor({ permalinks: true }, "levering", locale);
    expect(alternates?.canonical).toBe(`${ORIGIN}/${locale}/levering-og-fragt`);
    expect(alternates?.languages).toEqual({
      "da-DK": `${ORIGIN}/da/levering-og-fragt`,
      en: `${ORIGIN}/en/levering-og-fragt`,
      "x-default": `${ORIGIN}/da/levering-og-fragt`,
    });
  });

  it("a draft legal page keeps /info/<slug> (its built-in text renders there), as does a shadowed page", async () => {
    fixture();
    expect((await metadataFor({ permalinks: true }, "terms", "da"))?.canonical).toBe(`${ORIGIN}/da/info/terms`);
    fixture();
    expect((await metadataFor({ permalinks: true }, "type-1-info", "da"))?.canonical).toBe(`${ORIGIN}/da/info/type-1-info`);
  });

  it("with no permalink stored, or the option off, the alternates are as before", async () => {
    fixture();
    const off = await metadataFor({ permalinks: false }, "levering", "da");
    expect(off?.canonical).toBe(`${ORIGIN}/da/info/levering`);
    rows.pages = rows.pages.map((p) => ({ ...p, permalink: null }));
    expect(await metadataFor({ permalinks: true }, "levering", "da")).toEqual(off);
  });
});
