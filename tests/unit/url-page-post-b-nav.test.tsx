import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * URL-PAGE-POST-b — the links to a CMS page name its permalink when the proxy
 * serves it there (url-page-post-b.test.ts pins which pages that is): the
 * header nav, the mobile drawer, the /info index and llms.txt. The header nav
 * goes through next-intl's <Link>, which adds the locale itself, so the address
 * is handed down as a ready `href`, exactly as URL5-a2 does for a category; with
 * nothing served nothing is handed down and the old link renders as before.
 */

const urls = { permalinks: false };
const served = new Map<string, string>();

vi.mock("@/brand.config", async () => {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  return {
    ...actual,
    brand: { ...actual.brand, defaultLocale: "da", locales: ["da", "en"], urls, uiLabels: { allProductsLink: "All products" } },
  };
});
vi.mock("@/lib/permalinks/resolve-request", () => ({
  // The real one returns an empty map with the option off and reads nothing.
  loadServedPagePermalinks: vi.fn(async () => (urls.permalinks ? served : new Map())),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
// next-intl's Link prefixes the locale itself — the mock does the same.
vi.mock("@/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={`/da${href}`} data-locale-link="1" {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  hreflangFor: () => ({}),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/da" }));
vi.mock("@/lib/features", () => ({ supportsDialog: () => false }));
vi.mock("@/lib/feature-flags/context", () => ({ useFeature: () => false }));

afterEach(() => {
  urls.permalinks = false;
  served.clear();
  vi.restoreAllMocks();
});

const NAV = [
  { slug: "levering", title: "Levering" },
  { slug: "faq", title: "FAQ" },
];

describe("Header hands a nav page's address down only when it is served", () => {
  async function headerNavPages() {
    vi.resetModules();
    let seen: unknown[] = [];
    vi.doMock("@/lib/data-source/nav", () => ({ fetchNavCategories: async () => [], fetchNavPages: async () => NAV }));
    vi.doMock("@/lib/data-source/brand", () => ({ fetchBrandingSettings: async () => null }));
    vi.doMock("@/lib/cart", () => ({ getCartCount: async () => 0 }));
    vi.doMock("@/lib/auth", () => ({ auth: async () => null }));
    vi.doMock("@/lib/brand", () => ({
      getBrand: async () => ({ ecommerceEnabled: false, industryTemplate: "saas", features: {}, storeName: "S" }),
    }));
    vi.doMock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
    vi.doMock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k, getLocale: async () => "en" }));
    vi.doMock("@/components/HeaderClient", () => ({
      default: (props: { navPages: unknown[] }) => {
        seen = props.navPages;
        return null;
      },
    }));
    const { default: Header } = await import("@/components/Header");
    const el = (await Header()) as { type: (p: unknown) => unknown; props: unknown };
    el.type(el.props);
    for (const mod of ["@/lib/data-source/nav", "@/lib/data-source/brand", "@/lib/cart", "@/lib/auth", "@/lib/brand", "@/lib/theme", "next-intl/server", "@/components/HeaderClient"]) {
      vi.doUnmock(mod);
    }
    return seen;
  }

  it("off: the nav pages are passed exactly as fetched — no href key", async () => {
    served.set("levering", "/levering-og-fragt/");
    expect(await headerNavPages()).toEqual(NAV);
  });

  it("on, nothing served: the same", async () => {
    urls.permalinks = true;
    expect(await headerNavPages()).toEqual(NAV);
  });

  it("on: the served page gets its address in the request's locale; the other none", async () => {
    urls.permalinks = true;
    served.set("levering", "/levering-og-fragt/");
    expect(await headerNavPages()).toEqual([
      { slug: "levering", title: "Levering", href: "/en/levering-og-fragt" },
      { slug: "faq", title: "FAQ" },
    ]);
  });
});

describe("the desktop nav and the drawer render the handed-down address", () => {
  it("MobileMenu: a nav page with an href links there through next/link; one without keeps the locale Link", async () => {
    const { default: MobileMenu } = await import("@/components/MobileMenu");
    const html = renderToStaticMarkup(
      <MobileMenu
        categories={[]}
        ecommerceEnabled={false}
        navPages={[{ slug: "levering", title: "Levering", href: "/en/levering-og-fragt" }, { slug: "faq", title: "FAQ" }]}
      />,
    );
    expect(html).toMatch(/<a href="\/en\/levering-og-fragt"(?![^>]*data-locale-link)[^>]*>Levering<\/a>/);
    expect(html).toMatch(/<a href="\/da\/info\/faq"[^>]*data-locale-link="1"[^>]*>FAQ<\/a>/);
  });

  it("HeaderClient: the nav page's NavLink gets the address as prefixedHref", async () => {
    vi.resetModules();
    vi.doMock("@/components/NavLink", () => ({
      default: ({ href, prefixedHref, children }: { href: string; prefixedHref?: string; children?: React.ReactNode }) => (
        <a href={prefixedHref ?? `/da${href}`} data-prefixed={prefixedHref ? "1" : "0"}>
          {children}
        </a>
      ),
    }));
    for (const leaf of ["@/components/Logo", "@/components/SearchBox", "@/components/LanguageSwitcher", "@/components/CurrencySwitcher"]) {
      vi.doMock(leaf, () => ({ default: () => <span /> }));
    }
    vi.doMock("@/components/CartwrightLogo", () => ({ CartwrightLogo: () => <span /> }));
    const { default: HeaderClient } = await import("@/components/HeaderClient");
    const html = renderToStaticMarkup(
      <HeaderClient
        categories={[]}
        navPages={[{ slug: "levering", title: "Levering", href: "/en/levering-og-fragt" }, { slug: "faq", title: "FAQ" }]}
        cartCount={0}
        signedIn={false}
        storeName="S"
        allProductsLabel="All"
        ecommerceEnabled={false}
      />,
    );
    expect(html).toMatch(/<a href="\/en\/levering-og-fragt" data-prefixed="1"><span[^>]*>Levering<\/span><\/a>/);
    expect(html).toMatch(/<a href="\/da\/info\/faq" data-prefixed="0"><span[^>]*>FAQ<\/span><\/a>/);
    for (const mod of ["@/components/NavLink", "@/components/Logo", "@/components/SearchBox", "@/components/LanguageSwitcher", "@/components/CurrencySwitcher", "@/components/CartwrightLogo"]) {
      vi.doUnmock(mod);
    }
  });
});

const summary = (slug: string) => ({ slug, title: slug, metaDescription: null, updatedAt: new Date(0), translations: null });

describe("the /info index and llms.txt link a served page at its permalink", () => {
  async function infoIndexAllHrefs(locale: string, slugs = ["levering", "faq"]) {
    vi.resetModules();
    vi.doMock("@/lib/public-pages", () => ({ listPublishedPageSummaries: async () => slugs.map(summary) }));
    vi.doMock("@/lib/brand", () => ({ getBrand: async () => ({ url: "https://shop.example/", storeName: "S" }) }));
    vi.doMock("@/lib/i18n-dynamic", () => ({ getDynamicTranslation: async (_e: unknown, _f: string, base: string) => base }));
    vi.doMock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
    const { default: InfoIndexPage } = await import("@/app/[locale]/info/page");
    const html = renderToStaticMarkup(await InfoIndexPage({ params: Promise.resolve({ locale }) }));
    for (const mod of ["@/lib/public-pages", "@/lib/brand", "@/lib/i18n-dynamic", "next-intl/server"]) vi.doUnmock(mod);
    return { hrefs: [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), html };
  }
  async function infoIndexHrefs(locale: string) {
    return (await infoIndexAllHrefs(locale)).hrefs.filter((h) => !/about|contact|privacy|terms|cookies/.test(h));
  }

  it("the /info index's legal entries (terms, cookies) name a served permalink too, in the links and the ItemList", async () => {
    const legal = (hrefs: string[]) => hrefs.filter((h) => /terms|cookies|handelsbetingelser/.test(h));
    served.set("terms", "/handelsbetingelser/");
    expect(legal((await infoIndexAllHrefs("da", ["terms", "cookies"])).hrefs)).toEqual(["/da/info/terms", "/da/info/cookies"]);
    urls.permalinks = true;
    const on = await infoIndexAllHrefs("da", ["terms", "cookies"]);
    expect(legal(on.hrefs)).toEqual(["/da/handelsbetingelser", "/da/info/cookies"]);
    expect(on.html).toContain('"url":"https://shop.example/da/handelsbetingelser"');
    expect(on.html).not.toContain("/da/info/terms");
    expect(legal((await infoIndexAllHrefs("en", ["terms", "cookies"])).hrefs)).toEqual(["/en/handelsbetingelser", "/en/info/cookies"]);
  });

  it("the /info index, in both locales; off, the old address", async () => {
    served.set("levering", "/levering-og-fragt/");
    expect(await infoIndexHrefs("da")).toEqual(["/da/info/levering", "/da/info/faq"]);
    urls.permalinks = true;
    expect(await infoIndexHrefs("da")).toEqual(["/da/levering-og-fragt", "/da/info/faq"]);
    expect(await infoIndexHrefs("en")).toEqual(["/en/levering-og-fragt", "/en/info/faq"]);
  });

  async function llmsText(ecommerceEnabled = false, slugs = ["levering", "faq"]) {
    vi.resetModules();
    vi.doMock("@/lib/public-pages", () => ({ listPublishedPageSummaries: async () => slugs.map(summary) }));
    vi.doMock("@/lib/brand", () => ({
      getBrand: async () => ({
        url: "https://shop.example",
        storeName: "S",
        defaultLocale: "da",
        locales: ["da", "en"],
        tagline: "t",
        metadata: { description: "t" },
        policies: { currency: "DKK", country: "DK" },
        ecommerceEnabled,
        features: {},
      }),
    }));
    vi.doMock("@/lib/feature-flags/status", () => ({ getFeatureView: async () => ({ features: [] }) }));
    vi.doMock("@/lib/db", () => ({ prisma: { brandingSettings: { findUnique: async () => null } } }));
    const { GET } = await import("@/app/llms.txt/route");
    const text = await (await GET()).text();
    for (const mod of ["@/lib/public-pages", "@/lib/brand", "@/lib/feature-flags/status", "@/lib/db"]) vi.doUnmock(mod);
    return text;
  }
  async function llmsLinks() {
    return (await llmsText()).match(/\]\(https:\/\/shop\.example\/da\/(?:info\/)?(?:levering[^)]*|faq)\)/g);
  }

  it("llms.txt's Return Policy & Terms line names a served returns/terms permalink, as its page list does", async () => {
    const policy = async () =>
      ((await llmsText(true, ["returns", "terms"])).match(/^Please refer to .*$/m)?.[0] ?? "").match(/\[(?:returns|terms)\]\([^)]*\)/g);
    served.set("terms", "/handelsbetingelser/");
    expect(await policy()).toEqual(["[returns](https://shop.example/da/info/returns)", "[terms](https://shop.example/da/info/terms)"]);
    urls.permalinks = true;
    expect(await policy()).toEqual(["[returns](https://shop.example/da/info/returns)", "[terms](https://shop.example/da/handelsbetingelser)"]);
  });

  it("llms.txt; off, the old address", async () => {
    served.set("levering", "/levering-og-fragt/");
    expect(await llmsLinks()).toEqual(["](https://shop.example/da/info/levering)", "](https://shop.example/da/info/faq)"]);
    urls.permalinks = true;
    expect(await llmsLinks()).toEqual(["](https://shop.example/da/levering-og-fragt)", "](https://shop.example/da/info/faq)"]);
  });
});
