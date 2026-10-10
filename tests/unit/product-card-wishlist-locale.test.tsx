import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Wishlist locale threading (PLP follow-up to #334).
 *
 * #334 gave `WishlistButton` a `locale?: "da" | "en"` aria-label (default "da").
 * This locks the PLP path that feeds it: the route locale flows
 * `ProductGrid → ProductCard → WishlistButton`, so English-first shops get an
 * English accessible name on `/en` while every existing (da / locale-less)
 * caller stays byte-identical.
 *
 * The real ProductCard + ProductGrid render; only leaves are stubbed. The
 * WishlistButton stub echoes the locale it receives as a `data-locale`
 * attribute, so the assertions observe what actually reaches the heart.
 */

// brand.features.wishlist must be on for the heart to mount at all;
// uiLabels.productCardOriginBadge is read in the card body.
// Samme mønster som login-callback-url.test.tsx: kortet kalder nu
// useTranslations("ProductCard"); testene handler om locale-narrowing, ikke copy.
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/brand.config", () => ({
  brand: {
    features: { wishlist: true, containerQueries: false, viewTransitions: false },
    uiLabels: { productCardOriginBadge: "Designed in Denmark" },
  },
}));
// Capture-spy: surface the locale that actually reaches the wishlist heart.
vi.mock("@/components/WishlistButton", () => ({
  WishlistButton: ({ locale }: { locale?: string }) => (
    <button data-testid="wishlist" data-locale={locale ?? "unset"} />
  ),
}));
vi.mock("next/image", () => ({
  // Stubbed to a span (not <img>) so the test mock doesn't trip the
  // no-img-element lint rule; the assertions never inspect the image.
  default: ({ alt }: { alt?: string }) => <span data-img-alt={alt} />,
}));
vi.mock("@/components/TransitionLink", () => ({
  TransitionLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/Price", () => ({
  Price: ({ oere }: { oere: number }) => <span>{oere}</span>,
}));
vi.mock("@/lib/media/shim", () => ({
  resolveProductImageUrls: () => ["/img.png"],
}));
vi.mock("@/components/annotate/editAttr", () => ({ editAttr: () => ({}) }));
// ProductGrid-only seams.
vi.mock("@/lib/brand", () => ({
  getFeatures: async () => ({ containerQueries: false, viewTransitions: false }),
}));
vi.mock("@/lib/annotate/server", () => ({
  isAnnotateEditEnabled: async () => false,
}));
vi.mock("@/components/RevealOnScroll", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const product = {
  id: "p1",
  slug: "aviator",
  name: "Aviator",
  priceDkk: 49900,
  stock: 5,
  featured: false,
  brand: null,
} as never;

describe("ProductCard → WishlistButton locale forwarding", () => {
  it("defaults to da when no locale prop is passed (byte-identical legacy)", async () => {
    const { ProductCard } = await import("@/components/ProductCard");
    const html = renderToStaticMarkup(<ProductCard product={product} />);
    expect(html).toContain('data-locale="da"');
  });

  it('forwards locale="en" to the wishlist heart', async () => {
    const { ProductCard } = await import("@/components/ProductCard");
    const html = renderToStaticMarkup(
      <ProductCard product={product} locale="en" />,
    );
    expect(html).toContain('data-locale="en"');
  });

  it("prefixes the product URL when a route locale is supplied", async () => {
    const { ProductCard } = await import("@/components/ProductCard");
    const html = renderToStaticMarkup(
      <ProductCard product={product} locale="en" routeLocale="en" />,
    );
    expect(html).toContain('href="/en/product/aviator"');
  });
});

describe("ProductGrid narrows route locale through to the heart", () => {
  async function heartLocale(locale?: string) {
    const { ProductGrid } = await import("@/components/ProductGrid");
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [product], locale }),
    );
    const m = html.match(/data-locale="([^"]*)"/);
    return m?.[1];
  }

  it('passes "en" through for an English route', async () => {
    expect(await heartLocale("en")).toBe("en");
  });

  it('narrows a Danish route to "da"', async () => {
    expect(await heartLocale("da")).toBe("da");
  });

  it('narrows any non-"en" locale to "da"', async () => {
    expect(await heartLocale("fr")).toBe("da");
  });

  it('defaults to "da" when the grid gets no locale (homepage/related grids)', async () => {
    expect(await heartLocale()).toBe("da");
  });
});
