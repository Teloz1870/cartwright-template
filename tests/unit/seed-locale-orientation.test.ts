import { describe, expect, it, vi } from "vitest";

// A DANISH-base shop is the whole point of this file: it is the configuration
// where seeding an English-source template raw leaves the shop's own /da route
// speaking English with the Danish copy sitting unreachable in `translations`.
// Only defaultLocale is overridden; everything else stays the real brand.
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, defaultLocale: "da" } };
});
vi.mock("next-intl/server", () => ({ getLocale: async () => "da" }));

import { getIndustryTemplate } from "@/industry-templates";
import { orientSeedPage, orientSeedPages } from "@/industry-templates/seed-locale";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import type { SeedPage } from "@/industry-templates/types";

const page = (over: Partial<SeedPage> = {}): SeedPage => ({
  slug: "om-os",
  title: "About us",
  body: "We roast in small batches.",
  translations: { da: { title: "Om os", body: "Vi rister i små portioner." } },
  ...over,
});

describe("orientSeedPage leaves pages alone unless it has to act", () => {
  it("is a no-op when the template declares no source locale", () => {
    const p = page();
    expect(orientSeedPage(p, undefined, "da")).toBe(p);
  });

  it("is a no-op when the shop's base locale IS the source locale", () => {
    const p = page();
    expect(orientSeedPage(p, "en", "en")).toBe(p);
  });

  it("is a no-op when the page carries no copy for the base locale", () => {
    const p = page({ translations: { de: { title: "Über uns", body: "..." } } });
    expect(orientSeedPage(p, "en", "da")).toBe(p);
  });

  it("is a no-op when the base locale carries only non-column fields", () => {
    // metaTitle is read out of `translations` for every locale, base included,
    // so rotating it would change nothing about what renders.
    const p = page({ translations: { da: { metaTitle: "Om os | Kaffe" } } });
    expect(orientSeedPage(p, "en", "da")).toBe(p);
  });

  it("does not mutate the page it was given", () => {
    const p = page();
    const before = JSON.stringify(p);
    orientSeedPage(p, "en", "da");
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("orientSeedPage rotates copy into the shop's own base locale", () => {
  const oriented = orientSeedPage(page(), "en", "da");

  it("puts the base-locale copy in the base columns", () => {
    expect(oriented.title).toBe("Om os");
    expect(oriented.body).toBe("Vi rister i små portioner.");
  });

  it("demotes the source text under its own locale instead of dropping it", () => {
    expect(oriented.translations?.en).toEqual({
      title: "About us",
      body: "We roast in small batches.",
    });
  });

  it("removes the now-redundant base-locale entry", () => {
    // getDynamicTranslation never reads translations[defaultLocale] — leaving
    // it would be a second copy that can silently drift from the columns.
    expect(oriented.translations?.da).toBeUndefined();
  });

  it("keeps other locales untouched", () => {
    const withDe = orientSeedPage(
      page({
        translations: {
          da: { title: "Om os", body: "Vi rister." },
          de: { title: "Über uns", body: "Wir rösten." },
        },
      }),
      "en",
      "da",
    );
    expect(withDe.translations?.de).toEqual({
      title: "Über uns",
      body: "Wir rösten.",
    });
  });

  it("rotates field by field, so a partial translation keeps the rest readable", () => {
    const partial = orientSeedPage(
      page({ translations: { da: { title: "Om os" } } }),
      "en",
      "da",
    );
    expect(partial.title).toBe("Om os");
    // No Danish body shipped ⇒ the English body stays in the column rather
    // than the page rendering an empty body.
    expect(partial.body).toBe("We roast in small batches.");
    expect(partial.translations?.en).toEqual({ title: "About us" });
  });

  it("keeps meta fields the base locale carried alongside real copy", () => {
    const withMeta = orientSeedPage(
      page({
        translations: {
          da: { title: "Om os", body: "Vi rister.", metaTitle: "Om os | Kaffe" },
        },
      }),
      "en",
      "da",
    );
    expect(withMeta.title).toBe("Om os");
    expect(withMeta.translations?.da).toEqual({ metaTitle: "Om os | Kaffe" });
  });
});

describe("the coffee template resolves correctly for a Danish-base shop", () => {
  const pages = orientSeedPages(getIndustryTemplate("coffee"), "da");

  it("orients every seeded page", () => {
    expect(pages).toHaveLength(6);
    for (const p of pages) {
      expect(p.translations?.en?.title, `${p.slug} lost its English source`).toBeTruthy();
      expect(p.translations?.da, `${p.slug} kept a redundant da entry`).toBeUndefined();
    }
  });

  it("renders Danish on /da through the real reader — the F13 regression", async () => {
    const about = pages.find((p) => p.slug === "om-os")!;
    const source = getIndustryTemplate("coffee").pages.find((p) => p.slug === "om-os")!;
    // Base locale short-circuits to the column, which is now the Danish text.
    await expect(getDynamicTranslation(about, "body", "", "da")).resolves.toBe(
      source.translations!.da.body,
    );
    // And the English source is still reachable for shops that list `en`.
    await expect(getDynamicTranslation(about, "body", "", "en")).resolves.toBe(
      source.body,
    );
  });
});
