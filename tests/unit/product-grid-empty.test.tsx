import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link → plain anchor so we can assert the recovery href in static markup.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ProductGrid } from "@/components/ProductGrid";

/**
 * The empty state returns BEFORE ProductGrid touches getFeatures() /
 * isAnnotateEditEnabled(), so it renders without a request context — exactly the
 * surface we want to lock: a friendly empty state with a locale-aware recovery
 * link, replacing the old bare "No products found." paragraph.
 */
describe("ProductGrid empty state", () => {
  it("with a locale: shows the heading, helper copy and a locale-prefixed recovery link", async () => {
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: "da" }),
    );
    expect(html).toContain("No products found");
    expect(html).toContain("browse the full catalogue");
    expect(html).toContain('href="/da/produkter"');
    expect(html).toContain("Browse all products");
    // Decorative icon, not announced.
    expect(html).toContain('aria-hidden="true"');
  });

  it("respects the locale prefix (en) on the recovery link", async () => {
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: "en" }),
    );
    expect(html).toContain('href="/en/produkter"');
  });

  it("without a locale: degrades to copy only — no recovery link", async () => {
    const html = renderToStaticMarkup(await ProductGrid({ products: [] }));
    expect(html).toContain("No products found");
    expect(html).toContain("Check back soon");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/produkter");
  });
});
