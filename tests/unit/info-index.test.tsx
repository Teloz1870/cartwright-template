import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";

/**
 * TELOZ-INFO404 — `/info` had only `[slug]`, so every link to the bare `/info`
 * (the default "Read the docs" CTA in brand.config.ts, the stack pack's CTAs)
 * answered 404. The index lists the trust pages the footer links, then every
 * other published CMS page, under the URLs the sitemap publishes.
 *
 * Locale and paths come from brand.config, so the file holds in a fresh
 * scaffold (locales ["en"]) as well as in the engine.
 */

const loc = brand.defaultLocale as string;
const BASE = "https://shop.example";

const mocks = vi.hoisted(() => ({
  pages: vi.fn(),
}));

vi.mock("@/lib/public-pages", () => ({ listPublishedPageSummaries: mocks.pages }));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({ url: `${BASE}/`, storeName: "Acme" }),
}));
// Reads the entity's translation bag for the requested locale, like the real one.
vi.mock("@/lib/i18n-dynamic", () => ({
  getDynamicTranslation: async (
    e: { translations?: Record<string, Record<string, string>> | null },
    f: string,
    fallback: string,
    locale: string,
  ) => e.translations?.[locale]?.[f] ?? fallback,
}));
// Loads messages/<locale>.json, so a locale that is not forwarded shows up.
vi.mock("next-intl/server", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
      const messages = JSON.parse(
        readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"),
      ) as Record<string, Record<string, string>>;
      return (key: string, values?: Record<string, string>) =>
        messages[namespace][key].replace(/\{(\w+)\}/g, (_m, k) => values?.[k] ?? "");
    },
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const other = (brand.locales as readonly string[]).find((l) => l !== loc);

function page(
  slug: string,
  title: string,
  metaDescription: string | null = null,
  translations: Record<string, Record<string, string>> | null = null,
) {
  return { slug, title, metaDescription, updatedAt: new Date(0), translations };
}

async function render(locale: string = loc) {
  const { default: InfoIndexPage } = await import("@/app/[locale]/info/page");
  return renderToStaticMarkup(await InfoIndexPage({ params: Promise.resolve({ locale }) }));
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
}

function jsonLd(html: string) {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  return JSON.parse(raw!);
}

beforeEach(() => {
  mocks.pages.mockReset().mockResolvedValue([]);
});

describe("/info index", () => {
  it("answers with the trust pages even when the shop has no CMS pages", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Information<\/h1>/);
    expect(hrefs(html)).toEqual([
      `/${loc}/about`,
      `/${loc}/contact`,
      `/${loc}/privacy`,
      `/${loc}/info/terms`,
      `/${loc}/info/cookies`,
    ]);
  });

  it("lists every other published page once, after the trust pages, with its description", async () => {
    mocks.pages.mockResolvedValue([
      page("about", "About (CMS)"),
      page("om-os", "Om os"),
      page("contact", "Contact (CMS)"),
      page("privacy", "Privacy (CMS)"),
      page("terms", "Terms (CMS)"),
      page("cookies", "Cookies (CMS)"),
      page("faq", "FAQ", "Answers to common questions"),
      page("shipping", "Shipping"),
    ]);
    const html = await render();
    const links = hrefs(html);
    expect(links.slice(5)).toEqual([`/${loc}/info/faq`, `/${loc}/info/shipping`]);
    expect(new Set(links).size).toBe(links.length);
    expect(html).toContain("Answers to common questions");
  });

  it("still renders the trust pages when the database is down", async () => {
    mocks.pages.mockRejectedValue(new Error("libsql://secret-dsn unreachable"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render();
    expect(hrefs(html)).toHaveLength(5);
    expect(err.mock.calls.flat().join(" ")).not.toContain("secret-dsn");
    err.mockRestore();
  });

  it("publishes a CollectionPage whose list matches the links on the page", async () => {
    mocks.pages.mockResolvedValue([page("faq", "FAQ")]);
    const html = await render();
    const ld = jsonLd(html);
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.url).toBe(`${BASE}/${loc}/info`);
    const items = ld.mainEntity.itemListElement as Array<{ position: number; url: string }>;
    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
    expect(items.map((i) => i.url)).toEqual(hrefs(html).map((h) => `${BASE}${h}`));
  });

  it("sets a canonical on the shop's own origin", async () => {
    const { generateMetadata } = await import("@/app/[locale]/info/page");
    const meta = await generateMetadata({ params: Promise.resolve({ locale: loc }) });
    expect(meta.title).toBe("Information");
    expect(meta.alternates?.canonical).toBe(`${BASE}/${loc}/info`);
  });

  it("an empty title falls back to the slug, so no link is left without a name", async () => {
    mocks.pages.mockResolvedValue([page("shipping", "   ")]);
    const html = await render();
    expect(html).toMatch(new RegExp(`href="/${loc}/info/shipping"[^>]*><span[^>]*>shipping</span>`));
  });

  it.skipIf(!other)("in another locale: footer labels and page titles follow it, the base-language description does not show", async () => {
    const messages = JSON.parse(
      (await import("node:fs")).readFileSync(new URL(`../../messages/${other}.json`, import.meta.url), "utf8"),
    );
    mocks.pages.mockResolvedValue([
      page("faq", "Base title", "Base-language description", { [other!]: { title: "Other title" } }),
    ]);
    const html = await render(other!);
    expect(html).toContain(`>${messages.Footer.aboutUs}<`);
    expect(html).toContain("Other title");
    expect(html).not.toContain("Base title");
    expect(html).not.toContain("Base-language description");
    // …and in the base locale the description is shown.
    expect(await render()).toContain("Base-language description");
  });

  it.skipIf(!other)("lists an alternate for every locale", async () => {
    const { generateMetadata } = await import("@/app/[locale]/info/page");
    const meta = await generateMetadata({ params: Promise.resolve({ locale: loc }) });
    const langs = Object.values(meta.alternates?.languages ?? {}) as string[];
    for (const l of brand.locales as readonly string[]) expect(langs).toContain(`${BASE}/${l}/info`);
    for (const url of langs) expect(url).toMatch(new RegExp(`^${BASE}/[a-z]{2}/info$`));
  });

  it("has the same message keys in every locale file present", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../../messages/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const keys = files.map((f) =>
      Object.keys(JSON.parse(readFileSync(new URL(f, dir), "utf8")).InfoIndex ?? {}),
    );
    for (const k of keys) expect(k).toEqual(["title", "description"]);
  });
});
