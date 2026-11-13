import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * URL5-a2 — the header nav, the mobile drawer and the category page's
 * "Explore more" linked every category at `/category/<slug>` even when its
 * stored permalink was in effect: one more address for the same page, and the
 * one a migrated shop does not rank on.
 *
 * Those links go through next-intl's <Link>, which adds the locale itself, so
 * the helper's locale-prefixed answer cannot simply be passed to it (/da/da/…).
 * A permalink in effect is therefore handed down as a ready `href` and rendered
 * through next/link as it is; with the option off nothing is handed down and
 * the old link renders byte for byte.
 */

const urls = { permalinks: false, trailingSlash: false, localePrefix: "always" };
const paths = { intl: "/", browser: "/da" };

vi.mock("@/brand.config", () => ({
  brand: {
    defaultLocale: "da",
    locales: ["da", "en"],
    urls,
    uiLabels: { allProductsLink: "All products" },
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
// next-intl's Link prefixes the locale itself — the mock does the same, so a
// prefixed href passed to it would show up as /da/da/….
vi.mock("@/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={`/da${href}`} data-locale-link="1" {...rest}>
      {children}
    </a>
  ),
  usePathname: () => paths.intl,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => paths.browser }));
vi.mock("@/lib/features", () => ({ supportsDialog: () => false }));
vi.mock("@/lib/feature-flags/context", () => ({ useFeature: () => false }));

afterEach(() => {
  urls.permalinks = false;
  urls.trailingSlash = false;
  paths.intl = "/";
  paths.browser = "/da";
});

describe("URL5-a2 — permalinkInEffect", () => {
  it("is true only with the option on and a usable stored permalink", async () => {
    const { permalinkInEffect } = await import("@/lib/urls");
    const stored = { slug: "komposit", permalink: "/hegn/komposit/" };
    expect(permalinkInEffect(stored)).toBe(false);
    urls.permalinks = true;
    expect(permalinkInEffect(stored)).toBe(true);
    expect(permalinkInEffect({ slug: "komposit", permalink: null })).toBe(false);
    expect(permalinkInEffect({ slug: "komposit", permalink: "   " })).toBe(false);
    // A dot segment would climb out of the locale: the helper keeps the pattern.
    expect(permalinkInEffect({ slug: "komposit", permalink: "/../x/" })).toBe(false);
  });
});

describe("URL5-a2 — NavLink", () => {
  it("without prefixedHref: next-intl's Link, as before", async () => {
    const { default: NavLink } = await import("@/components/NavLink");
    const html = renderToStaticMarkup(<NavLink href="/category/komposit">Komposit</NavLink>);
    expect(html).toContain('href="/da/category/komposit"');
    expect(html).toContain('data-locale-link="1"');
  });

  it("with prefixedHref: the address as it is, never prefixed twice", async () => {
    const { default: NavLink } = await import("@/components/NavLink");
    const html = renderToStaticMarkup(
      <NavLink href="/category/komposit" prefixedHref="/da/hegn/komposit">
        Komposit
      </NavLink>,
    );
    expect(html).toContain('href="/da/hegn/komposit"');
    expect(html).not.toContain("data-locale-link");
    expect(html).not.toContain("aria-current");
  });

  it("with prefixedHref: active on the permalink page, with or without its slash, and below it", async () => {
    const { default: NavLink } = await import("@/components/NavLink");
    const render = () =>
      renderToStaticMarkup(
        <NavLink href="/category/komposit" prefixedHref="/da/hegn/komposit/">
          Komposit
        </NavLink>,
      );
    for (const browser of ["/da/hegn/komposit", "/da/hegn/komposit/", "/da/hegn/komposit/x/"]) {
      paths.browser = browser;
      expect(render(), browser).toContain('aria-current="page"');
    }
    paths.browser = "/da/hegn/komposit-plus/";
    expect(render()).not.toContain("aria-current");
  });
});

describe("URL5-a2 — NavLink active state (R1 fold-in)", () => {
  async function activeAt(prefixedHref: string, browser: string) {
    const { default: NavLink } = await import("@/components/NavLink");
    paths.browser = browser;
    return renderToStaticMarkup(
      <NavLink href="/category/x" prefixedHref={prefixedHref}>
        X
      </NavLink>,
    ).includes('aria-current="page"');
  }

  it("a permalink with a query or fragment is active on its path (codex P2)", async () => {
    expect(await activeAt("/da/hegn/komposit/?sort=pop#produkter", "/da/hegn/komposit/")).toBe(true);
    expect(await activeAt("/da/hegn/komposit?sort=pop", "/da/hegn/komposit/x")).toBe(true);
  });

  it("a permalink at the locale root is active only there, not on every page below it", async () => {
    expect(await activeAt("/da", "/da")).toBe(true);
    expect(await activeAt("/da/", "/da/hegn/komposit/")).toBe(false);
    expect(await activeAt("/", "/hegn/")).toBe(false);
    expect(await activeAt("/en/", "/en/hegn/")).toBe(false);
  });

  it("an unprefixed one-segment permalink (localePrefix never) is active below itself (codex P2, R2)", async () => {
    expect(await activeAt("/hegn", "/hegn/komposit")).toBe(true);
    expect(await activeAt("/hegn/", "/hegn")).toBe(true);
    expect(await activeAt("/hegn", "/hegnsdele")).toBe(false);
  });
});

describe("URL5-a2 — MobileMenu", () => {
  it("a category with an href links there through next/link; one without keeps the locale Link", async () => {
    const { default: MobileMenu } = await import("@/components/MobileMenu");
    const html = renderToStaticMarkup(
      <MobileMenu
        categories={[
          { name: "Komposit", slug: "komposit", href: "/en/hegn/komposit" },
          { name: "Alu", slug: "alu" },
        ]}
      />,
    );
    expect(html).toMatch(/<a href="\/en\/hegn\/komposit"(?![^>]*data-locale-link)[^>]*>Komposit<\/a>/);
    expect(html).toMatch(/<a href="\/da\/category\/alu"[^>]*data-locale-link="1"[^>]*>Alu<\/a>/);
    expect(html).not.toContain("/da/en/");
  });
});

describe("URL5-a2 — Header hands the address down only when it is in effect", () => {
  async function headerCategories() {
    vi.resetModules();
    let seen: unknown[] = [];
    vi.doMock("@/lib/data-source/nav", () => ({
      fetchNavCategories: async () => [
        { id: "c1", slug: "komposit", name: "Komposit", permalink: "/hegn/komposit/" },
        { id: "c2", slug: "alu", name: "Alu", permalink: null },
      ],
      fetchNavPages: async () => [],
    }));
    vi.doMock("@/lib/data-source/brand", () => ({ fetchBrandingSettings: async () => null }));
    vi.doMock("@/lib/cart", () => ({ getCartCount: async () => 0 }));
    vi.doMock("@/lib/auth", () => ({ auth: async () => null }));
    vi.doMock("@/lib/brand", () => ({
      getBrand: async () => ({ ecommerceEnabled: true, industryTemplate: "coffee", features: {}, storeName: "S" }),
    }));
    vi.doMock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
    vi.doMock("next-intl/server", () => ({
      getTranslations: async () => (k: string) => k,
      getLocale: async () => "en",
    }));
    vi.doMock("@/components/HeaderClient", () => ({
      default: (props: { categories: unknown[] }) => {
        seen = props.categories;
        return null;
      },
    }));
    const { default: Header } = await import("@/components/Header");
    const el = (await Header()) as { type: (p: unknown) => unknown; props: unknown };
    el.type(el.props);
    return seen;
  }

  it("off: the client props are exactly what they were — no href key at all", async () => {
    expect(await headerCategories()).toEqual([
      { id: "c1", slug: "komposit", name: "Komposit" },
      { id: "c2", slug: "alu", name: "Alu" },
    ]);
  });

  it("on: the category with a permalink gets its address in the request's locale; the other none", async () => {
    urls.permalinks = true;
    expect(await headerCategories()).toEqual([
      { id: "c1", slug: "komposit", name: "Komposit", href: "/en/hegn/komposit" },
      { id: "c2", slug: "alu", name: "Alu" },
    ]);
  });
});
