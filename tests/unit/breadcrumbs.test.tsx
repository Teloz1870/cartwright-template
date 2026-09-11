import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link needs no Next runtime here — render it as a plain anchor so we can
// assert hrefs in static markup (same mocking pattern as trust-badges.test.tsx).
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

import Breadcrumbs from "@/components/Breadcrumbs";

describe("Breadcrumbs", () => {
  const trail = [
    { label: "Home", href: "/da" },
    { label: "All products", href: "/da/produkter" },
    { label: "Sunglasses" }, // leaf = current page, no href
  ];

  it("renders a labelled nav with an ordered list", () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={trail} />);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("<nav");
    expect(html).toContain("<ol");
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });

  it("links every non-leaf step with its passed-through href, never the leaf", () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={trail} />);
    expect(html).toContain('href="/da"');
    expect(html).toContain('href="/da/produkter"');
    // The leaf is plain text — its label must not appear inside an anchor.
    expect(html).not.toContain('href="/da/produkter/sunglasses"');
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });

  it("marks the leaf as the current page (aria-current) and not a link", () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={trail} />);
    expect(html).toContain('aria-current="page"');
    // aria-current sits on a span, not an anchor.
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Sunglasses<\/span>/);
  });

  it("renders one decorative separator between each step (none after the leaf)", () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={trail} />);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
  });

  it("renders nothing for an empty trail", () => {
    expect(renderToStaticMarkup(<Breadcrumbs items={[]} />)).toBe("");
  });

  it("treats a single-item trail as the current page with no link or separator", () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={[{ label: "Home" }]} />);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('aria-hidden="true"');
  });
});
