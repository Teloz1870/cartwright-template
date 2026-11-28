import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * URL5-a — the product card rendered WITHOUT a routeLocale (the apex, ember,
 * webshop-classic, webshop-minimal and hoptify homepages, the wishlist) links
 * locale-less, `/product/<slug>`, exactly as before. Once a stored permalink is
 * in effect it links the permalink instead, in the locale the page is rendered
 * in (never forced to the default), so a migrated product never gets a second
 * address from a card.
 */

const urls = { permalinks: false, trailingSlash: false, localePrefix: "always" };
const request = { locale: "da" };

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useLocale: () => request.locale }));
vi.mock("@/brand.config", () => ({
  brand: {
    defaultLocale: "da",
    locales: ["da", "en"],
    urls,
    features: { wishlist: false, containerQueries: false, viewTransitions: false },
    uiLabels: { productCardOriginBadge: "Designed in Denmark" },
  },
}));
vi.mock("next/image", () => ({ default: ({ alt }: { alt?: string }) => <span data-img-alt={alt} /> }));
vi.mock("@/components/TransitionLink", () => ({
  TransitionLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/Price", () => ({ Price: ({ oere }: { oere: number }) => <span>{oere}</span> }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: () => ["/img.png"] }));
vi.mock("@/components/annotate/editAttr", () => ({ editAttr: () => ({}) }));
vi.mock("@/components/WishlistButton", () => ({ WishlistButton: () => null }));

const base = { id: "p1", slug: "komposit-x", name: "Komposit X", priceDkk: 100_00, images: "[]", stock: 3 };

async function hrefOf(product: typeof base & { permalink?: string | null }, routeLocale?: string) {
  const { ProductCard } = await import("@/components/ProductCard");
  const html = renderToStaticMarkup(<ProductCard product={product} routeLocale={routeLocale} />);
  return html.match(/href="([^"]+)"/)?.[1];
}

afterEach(() => {
  urls.permalinks = false;
  request.locale = "da";
});

describe("URL5-a — a locale-less product card", () => {
  it("permalinks off: links /product/<slug>, as before, with or without a stored permalink", async () => {
    expect(await hrefOf(base)).toBe("/product/komposit-x");
    expect(await hrefOf({ ...base, permalink: "/hegn/komposit-x/" })).toBe("/product/komposit-x");
  });

  it("permalinks on: a product with a permalink is linked at it, one without keeps the old link", async () => {
    urls.permalinks = true;
    expect(await hrefOf({ ...base, permalink: "/hegn/komposit-x/" })).toBe("/da/hegn/komposit-x");
    expect(await hrefOf({ ...base, permalink: null })).toBe("/product/komposit-x");
  });

  it("permalinks on: an English page keeps the shopper in English (no forced default locale)", async () => {
    urls.permalinks = true;
    request.locale = "en";
    expect(await hrefOf({ ...base, permalink: "/hegn/komposit-x/" })).toBe("/en/hegn/komposit-x");
    // flag off: still the old locale-less link, whatever the request locale
    urls.permalinks = false;
    expect(await hrefOf({ ...base, permalink: "/hegn/komposit-x/" })).toBe("/product/komposit-x");
  });

  it("with a routeLocale the card follows it either way", async () => {
    urls.permalinks = true;
    expect(await hrefOf({ ...base, permalink: "/hegn/komposit-x/" }, "en")).toBe("/en/hegn/komposit-x");
  });
});
