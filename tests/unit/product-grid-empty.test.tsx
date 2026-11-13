import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";

/**
 * Locales come from the shop's own brand.config (tests/unit ships in
 * scaffolds, which are single-locale `["en"]`). The copy is read through the
 * real next-intl translator over `messages/<locale>.json`, so a key missing
 * from one file, or a string hard-coded back into the component, shows up as
 * the wrong text on that locale.
 */
const LOCALE = brand.defaultLocale as string;
const LOCALES = brand.locales as readonly string[];
const state = vi.hoisted(() => ({ requestLocale: "" }));

const messages = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Record<string, Record<string, string>>;

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { readFileSync: read } = await import("node:fs");
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
      createTranslator({ locale, messages: JSON.parse(read(`messages/${locale}.json`, "utf8")), namespace }),
    getLocale: async () => state.requestLocale,
  };
});

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

state.requestLocale = LOCALE;

/**
 * The empty state returns BEFORE ProductGrid touches getFeatures() /
 * isAnnotateEditEnabled(), so it renders without a request context — exactly the
 * surface we want to lock: a friendly empty state with a locale-aware recovery
 * link, replacing the old bare "No products found." paragraph.
 */
describe("ProductGrid empty state", () => {
  it("with a locale: shows the heading, helper copy and a locale-prefixed recovery link", async () => {
    const t = messages(LOCALE).Catalog;
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: LOCALE }),
    );
    expect(html).toContain(t.emptyTitle);
    expect(html).toContain(t.emptyHintFiltered);
    expect(html).toContain(`href="/${LOCALE}/produkter"`);
    expect(html).toContain(t.browseAll);
    // Decorative icon, not announced.
    expect(html).toContain('aria-hidden="true"');
  });

  it("respects the locale prefix on the recovery link", async () => {
    for (const locale of LOCALES) {
      const html = renderToStaticMarkup(
        await ProductGrid({ products: [], locale }),
      );
      expect(html).toContain(`href="/${locale}/produkter"`);
    }
  });

  it("without a locale: degrades to copy only — no recovery link", async () => {
    const html = renderToStaticMarkup(await ProductGrid({ products: [] }));
    expect(html).toContain(messages(LOCALE).Catalog.emptyTitle);
    expect(html).toContain(messages(LOCALE).Catalog.emptyHintSoon);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/produkter");
  });

  it("with a search query: echoes the searched term and keeps the recovery link", async () => {
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: LOCALE, query: "aviator" }),
    );
    expect(html).toContain("&quot;aviator&quot;");
    expect(html).not.toContain(messages(LOCALE).Catalog.emptyTitle);
    // Recovery path still present.
    expect(html).toContain(`href="/${LOCALE}/produkter"`);
  });

  it("trims surrounding whitespace from the echoed query", async () => {
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: LOCALE, query: "  round  " }),
    );
    expect(html).toContain("&quot;round&quot;");
  });

  it("treats an empty/whitespace query as no query (generic heading)", async () => {
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: LOCALE, query: "   " }),
    );
    expect(html).toContain(messages(LOCALE).Catalog.emptyTitle);
    expect(html).not.toContain("&quot;");
  });

  it("caps a pathologically long query to protect the layout", async () => {
    const long = "x".repeat(200);
    const html = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: LOCALE, query: long }),
    );
    expect(html).toContain("x".repeat(60));
    expect(html).not.toContain("x".repeat(61));
  });
});

/**
 * ARG4 — the empty state was hard-coded English, so `/da/produkter?q=xyzzy`
 * on the Danish canaries answered "No products match …" / "Browse all
 * products". It now speaks the page's locale; English is byte-identical to the
 * old literals.
 */
describe("ProductGrid empty state follows the page locale", () => {
  const whenEnglish = LOCALES.includes("en") ? it : it.skip;

  it.each(LOCALES)("%s: every string comes from that locale's messages", async (locale) => {
    const t = messages(locale).Catalog;
    const filtered = renderToStaticMarkup(await ProductGrid({ products: [], locale }));
    for (const text of [t.emptyTitle, t.emptyHintFiltered, t.browseAll]) {
      expect(filtered, `${locale}: ${text}`).toContain(`>${text}<`);
    }
    const searched = renderToStaticMarkup(
      await ProductGrid({ products: [], locale, query: "xyzzy" }),
    );
    const heading = t.emptySearchTitle.replace("{query}", "xyzzy").replaceAll('"', "&quot;");
    expect(searched).toContain(`>${heading}<`);
  });

  it("a homepage grid (no locale prop) answers in the request's locale", async () => {
    for (const locale of LOCALES) {
      state.requestLocale = locale;
      const html = renderToStaticMarkup(await ProductGrid({ products: [] }));
      expect(html).toContain(`>${messages(locale).Catalog.emptyHintSoon}<`);
    }
    state.requestLocale = LOCALE;
  });

  whenEnglish("en is byte-identical to the strings the component hard-coded", async () => {
    const html = renderToStaticMarkup(await ProductGrid({ products: [], locale: "en" }));
    expect(html).toContain(">No products found<");
    expect(html).toContain(">Try adjusting your filters, or browse the full catalogue.<");
    expect(html).toContain(">Browse all products</a>");
    state.requestLocale = "en";
    const bare = renderToStaticMarkup(await ProductGrid({ products: [] }));
    state.requestLocale = LOCALE;
    expect(bare).toContain(">Check back soon — new products are on the way.<");
    const searched = renderToStaticMarkup(
      await ProductGrid({ products: [], locale: "en", query: "aviator" }),
    );
    expect(searched).toContain(">No products match &quot;aviator&quot;<");
  });

  const whenDanishToo = LOCALES.includes("da") && LOCALES.includes("en") ? it : it.skip;

  whenDanishToo("a Danish page gets Danish, not the English copy", async () => {
    const da = messages("da").Catalog;
    const en = messages("en").Catalog;
    for (const key of ["emptyTitle", "emptySearchTitle", "emptyHintFiltered", "emptyHintSoon", "browseAll"]) {
      expect(da[key], `Catalog.${key}`).toBeTruthy();
      expect(da[key], `Catalog.${key} is the English string`).not.toBe(en[key]);
    }
    const html = renderToStaticMarkup(await ProductGrid({ products: [], locale: "da", query: "xyzzy" }));
    expect(html).not.toContain("No products");
    expect(html).not.toContain("Browse all products");
  });
});
