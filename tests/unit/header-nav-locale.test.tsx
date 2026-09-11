import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import da from "@/messages/da.json";
import en from "@/messages/en.json";

/**
 * The header's mobile twin used to speak English on every locale.
 *
 * Measured on the live Danish canary (demo.cartwright.app/da, 2026-08-25):
 * the desktop nav rendered Danish while the drawer directly beneath it read
 * "All products · Cart · Account", and every drawer link was written with
 * plain `next/link` — so it pointed at `/cart`, not `/{locale}/cart`. On a
 * shop whose default locale differs from the one being browsed, that link
 * bounces the visitor into the other language.
 *
 * These tests pin both halves of that class:
 *   1. Every string the header renders goes through the `Header` namespace
 *      (mocked `useTranslations` echoes the key, so a re-hardcoded literal
 *      shows up as itself and fails the negative assertions).
 *   2. The drawer routes through the locale-aware `Link` from `@/i18n/routing`
 *      (the mock stamps `data-locale-link`; reverting to `next/link` drops it).
 */

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  // Namespace-aware on purpose: the echo carries the namespace, so a call site
  // that reaches for the wrong one (useTranslations("Common")) fails loudly
  // instead of passing on a bare key.
  return {
    ...actual,
    useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  };
});

// Marker mock: only the locale-aware Link carries `data-locale-link`.
vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} data-locale-link="1" {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/brand.config", () => ({
  brand: { uiLabels: { allProductsLink: "All products" } },
}));
vi.mock("@/lib/features", () => ({ supportsDialog: () => false }));
vi.mock("@/lib/feature-flags/context", () => ({ useFeature: () => false }));

// HeaderClient leaves — none of them are what these assertions observe.
vi.mock("@/components/Logo", () => ({ default: () => <span /> }));
vi.mock("@/components/CartwrightLogo", () => ({ CartwrightLogo: () => <span /> }));
vi.mock("@/components/SearchBox", () => ({ default: () => <span /> }));
vi.mock("@/components/NavLink", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => <span /> }));
vi.mock("@/components/CurrencySwitcher", () => ({ default: () => <span /> }));

const { default: MobileMenu } = await import("@/components/MobileMenu");
const { default: HeaderClient } = await import("@/components/HeaderClient");

describe("mobile drawer speaks the page's language", () => {
  const markup = renderToStaticMarkup(
    <MobileMenu categories={[{ name: "Beans", slug: "beans" }]} ecommerceEnabled />,
  );

  it("renders every drawer string through the Header namespace", () => {
    for (const key of [
      "allProducts",
      "cart",
      "account",
      "menu",
      "mobileNav",
      "openMenu",
      "closeMenu",
    ]) {
      expect(markup).toContain(`Header.${key}`);
    }
  });

  it("no longer hardcodes the English literals it used to ship", () => {
    expect(markup).not.toContain(">Cart<");
    expect(markup).not.toContain(">Account<");
    expect(markup).not.toContain(">Menu<");
    expect(markup).not.toContain("Mobile navigation");
    expect(markup).not.toContain("Close menu");
    expect(markup).not.toContain("Open menu");
    // The last leak the triad caught: the drawer read a single-language config
    // string while the desktop nav one line above resolved the same label
    // through the Header namespace.
    expect(markup).not.toContain("All products");
  });

  it("only renders message keys that actually exist", () => {
    // Substring assertions alone let a typo through: `Header.mobileNavXyz`
    // satisfies toContain("Header.mobileNav"), and next-intl renders a missing
    // key as its literal path — so the typo would ship as a visible
    // `aria-label="Header.mobileNavXyz"`. Cross-check every rendered token
    // against the real message file instead.
    const rendered = new Set(
      [...markup.matchAll(/Header\.([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    );
    expect(rendered.size).toBeGreaterThan(0);
    const known = new Set(Object.keys(en.Header));
    expect([...rendered].filter((k) => !known.has(k))).toEqual([]);
  });

  it("routes drawer links through the locale-aware Link", () => {
    // Products + one category + cart + account = four locale-aware links.
    const localeAware = markup.match(/data-locale-link="1"/g) ?? [];
    expect(localeAware.length).toBeGreaterThanOrEqual(4);
  });
});

describe("header a11y labels are localizable", () => {
  const markup = renderToStaticMarkup(
    <HeaderClient
      categories={[{ id: "1", slug: "beans", name: "Beans" }]}
      navPages={[{ slug: "om", title: "Om" }]}
      cartCount={1}
      signedIn={false}
      isAdmin
      storeName="Northbound"
      allProductsLabel="Alle produkter"
      ecommerceEnabled
    />,
  );

  it("routes every accessible name through the Header namespace", () => {
    for (const key of ["homeAria", "categories", "cartAria", "adminDashboard", "logIn"]) {
      expect(markup).toContain(`aria-label="Header.${key}"`);
    }
  });

  it("hands the drawer the same label the desktop nav renders", () => {
    // Pins the wiring at the call site, not just inside MobileMenu: the
    // `?? t("allProducts")` fallback resolves the same message, so deleting
    // `allProductsLabel={allProductsLabel}` from <MobileMenu> is invisible
    // unless something counts BOTH halves rendering the passed value.
    const occurrences = markup.split("Alle produkter").length - 1;
    expect(occurrences).toBe(2); // desktop nav + drawer
  });

  it("drops the hardcoded English accessible names", () => {
    expect(markup).not.toContain("Shopping cart (");
    expect(markup).not.toContain('aria-label="Categories"');
    expect(markup).not.toContain('aria-label="Admin dashboard"');
    expect(markup).not.toContain('aria-label="Log in"');
    expect(markup).not.toContain("Northbound home");
  });
});

describe("the header's conditional branches keep their labels localized", () => {
  // `myAccount` needs a signed-in shopper and `pages` needs website-mode — the
  // two are mutually exclusive (the account link is gated on ecommerceEnabled,
  // the page nav on its negation), so each needs its own render. Without them
  // only the key-parity test touches these keys, and a typo would ship.
  const signedInShop = renderToStaticMarkup(
    <HeaderClient
      categories={[]}
      cartCount={0}
      signedIn
      storeName="Northbound"
      allProductsLabel="Alle produkter"
      ecommerceEnabled
    />,
  );

  const websiteMode = renderToStaticMarkup(
    <HeaderClient
      categories={[]}
      navPages={[{ slug: "om", title: "Om" }]}
      cartCount={0}
      signedIn={false}
      storeName="Northbound"
      allProductsLabel="Alle produkter"
      ecommerceEnabled={false}
    />,
  );

  it("labels the signed-in account link", () => {
    expect(signedInShop).toContain('aria-label="Header.myAccount"');
    expect(signedInShop).not.toContain('aria-label="My account"');
  });

  it("labels the website-mode page nav", () => {
    expect(websiteMode).toContain('aria-label="Header.pages"');
    expect(websiteMode).not.toContain('aria-label="Pages"');
  });
});

describe("the Header namespace itself", () => {
  it("carries the same keys in every shipped locale", () => {
    expect(Object.keys(da.Header).sort()).toEqual(Object.keys(en.Header).sort());
  });

  it("pluralises the cart's accessible name instead of saying '1 items'", () => {
    // Uses the REAL message, so a malformed ICU string fails here rather than
    // at runtime. The plural bug this replaces rendered "Shopping cart (1 items)".
    const t = createTranslator({ locale: "en", messages: en, namespace: "Header" });
    expect(t("cartAria", { count: 0 })).toBe("Shopping cart (0 items)");
    expect(t("cartAria", { count: 1 })).toBe("Shopping cart (1 item)");
    expect(t("cartAria", { count: 3 })).toBe("Shopping cart (3 items)");

    const td = createTranslator({ locale: "da", messages: da, namespace: "Header" });
    expect(td("cartAria", { count: 1 })).toBe("Indkøbskurv (1 vare)");
    expect(td("cartAria", { count: 0 })).toBe("Indkøbskurv (0 varer)");
    expect(td("cartAria", { count: 3 })).toBe("Indkøbskurv (3 varer)");
  });
});
