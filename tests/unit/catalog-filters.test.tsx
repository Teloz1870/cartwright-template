import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { CatalogFilters } from "@/components/CatalogFilters";
import en from "@/messages/en.json";
import da from "@/messages/da.json";

// CatalogFilters is a client island; the router hooks are only exercised on
// interaction, so a static render with inert mocks covers the markup contract.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

type Messages = typeof en;

function render(
  locale: string,
  messages: Messages,
  props: Partial<React.ComponentProps<typeof CatalogFilters>> = {},
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CatalogFilters
        categories={[]}
        brands={[]}
        frameColors={[]}
        lensColors={[]}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("CatalogFilters attribute sections are value-driven", () => {
  it("renders NO brand/frame/lens dropdowns when the catalogue has no values", () => {
    // Measured live on demo.cartwright.app (coffee shop) before this guard:
    // three empty eyewear dropdowns — another store's leftovers on every
    // non-eyewear vertical.
    const html = render("en", en);
    expect(html).not.toContain(en.Catalog.brand);
    expect(html).not.toContain(en.Catalog.frameColor);
    expect(html).not.toContain(en.Catalog.lensColor);
    // The always-on sections still render.
    expect(html).toContain(en.Catalog.search);
    expect(html).toContain(en.Catalog.category);
    expect(html).toContain(en.Catalog.sort);
  });

  it("renders each attribute dropdown once its value list is non-empty", () => {
    const html = render("en", en, {
      brands: ["Ray-Ban"],
      frameColors: ["Black"],
      lensColors: ["Green"],
    });
    expect(html).toContain(en.Catalog.brand);
    expect(html).toContain("Ray-Ban");
    expect(html).toContain(en.Catalog.frameColor);
    expect(html).toContain(en.Catalog.lensColor);
  });
});

describe("CatalogFilters is localized", () => {
  it("renders Danish labels under the da locale", () => {
    const html = render("da", da as unknown as Messages, {
      brands: ["Ray-Ban"],
    });
    expect(html).toContain(da.Catalog.brand); // "Mærke"
    expect(html).toContain(da.Catalog.sortNewest); // "Nyeste"
    expect(html).toContain(da.Catalog.reset); // "Nulstil"
    // No hardcoded-English leftovers from the pre-i18n component.
    expect(html).not.toContain("All brands");
    expect(html).not.toContain("Price: low to high");
  });
});

describe("CatalogFilters navigation stays in the visitor's locale", () => {
  // The URLs are built inside interaction handlers, so the render can't see
  // them — the defect (a bare `/produkter` push that middleware bounces to the
  // DEFAULT locale, #469's bug class) is re-introducible only in source, so
  // source is what's asserted. Same approach as footer-nav-locale.test.ts.
  it("builds every push target from the active locale", () => {
    const src = readFileSync(
      join(process.cwd(), "components/CatalogFilters.tsx"),
      "utf8",
    );
    expect(src).toContain("`/${locale}/produkter`");
    expect(src).not.toMatch(/push\(\s*["'`]\/produkter/);
    expect(src).not.toMatch(/return\s+qs\s*\?\s*`\/produkter/);
  });
});
