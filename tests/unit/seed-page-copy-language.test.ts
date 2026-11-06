import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// Pin the base locale to "en" so the round-trip case actually exercises the
// translation branch: getDynamicTranslation short-circuits to the BASE field
// whenever the requested locale equals brand.defaultLocale, and the engine repo
// itself ships defaultLocale "da". Only defaultLocale is overridden.
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, defaultLocale: "en" } };
});
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

import { getIndustryTemplate, INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";

/**
 * The coffee template is what `npx create-cartwright --template coffee`
 * seeds, and scaffolds are born English-first (`defaultLocale: "en"`). Its
 * base copy must therefore BE English, with the Danish original preserved
 * under `translations.da` for the /da route of shops that list `da`.
 */

// Characters that exist in Danish and never in English source copy.
const DANISH_LETTERS = /[æøåÆØÅ]/;
// Words that are unambiguously Danish — every one of them is a non-word in
// English. Deliberately excludes every near-miss that has ANY English reading:
// "med"/"dine" (light-med roast, dine-in), "den"/"din" (a coffee den, a din),
// "til" (open til 5), "er" (the ER), "vi" (Phase VI — matching is
// case-insensitive), "du" (Du Bois), "kr" (initials). A language guard that
// fails on valid English copy is worse than no guard at all.
//
// This is a tripwire, not a proof. Danish stripped of æøå and of every word
// below would still slip through; what it reliably catches is the actual
// failure mode — a page reverted or re-added in Danish.
const DANISH_WORDS =
  /\b(og|ikke|hvis|vores|som|der|ved|kun|hver|inden|af|fra|eller|kan|skal|det)\b/i;

function plain(markdown: string): string {
  return markdown.replace(/[#*`>_-]/g, " ");
}

describe("coffee template ships English-first page copy", () => {
  const pages = getIndustryTemplate("coffee").pages;

  it("seeds the six trust/info pages", () => {
    expect(pages.map((p) => p.slug).sort()).toEqual(
      ["faq", "om-os", "privacy", "returns", "shipping", "terms"],
    );
  });

  it.each(["om-os", "faq", "shipping", "returns", "terms", "privacy"])(
    "%s has English base copy",
    (slug) => {
      const page = pages.find((p) => p.slug === slug);
      expect(page, `missing page ${slug}`).toBeTruthy();
      for (const field of ["title", "body"] as const) {
        const text = plain(page![field]);
        // Positive assertion first: empty copy trivially satisfies every
        // "contains no Danish" check, so without this the guard below would
        // wave through a page whose English text was blanked by a bad merge.
        expect(text.trim().length, `${slug}.${field} is empty`).toBeGreaterThan(
          field === "title" ? 3 : 200,
        );
        expect(text, `${slug}.${field} contains Danish letters`).not.toMatch(
          DANISH_LETTERS,
        );
        expect(text, `${slug}.${field} contains Danish words`).not.toMatch(
          DANISH_WORDS,
        );
      }
    },
  );

  it.each(["om-os", "faq", "shipping", "returns", "terms", "privacy"])(
    "%s keeps the Danish original under translations.da",
    (slug) => {
      const da = pages.find((p) => p.slug === slug)?.translations?.da;
      expect(da, `missing translations.da for ${slug}`).toBeTruthy();
      for (const field of ["title", "body"] as const) {
        expect(typeof da![field]).toBe("string");
        expect(da![field].length).toBeGreaterThan(0);
      }
      // Proves the "translation" is not just the English text copied over —
      // for BOTH fields, since a title like "Handelsbetingelser" carries no
      // æøå and would otherwise never be language-checked at all.
      const page = pages.find((p) => p.slug === slug)!;
      expect(da!.title).not.toBe(page.title);
      expect(da!.body).not.toBe(page.body);
      expect(plain(da!.body)).toMatch(DANISH_LETTERS);
    },
  );

  it("resolves the Danish body through the real translation reader", async () => {
    const about = pages.find((p) => p.slug === "om-os")!;
    // Base locale (pinned "en") → the English source text.
    await expect(getDynamicTranslation(about, "body", "", "en")).resolves.toBe(
      about.body,
    );
    // Secondary locale → the seeded Danish, i.e. the seed's shape matches the
    // shape Page.translations is read with at render time.
    await expect(getDynamicTranslation(about, "body", "", "da")).resolves.toBe(
      about.translations!.da.body,
    );
  });
});

describe("every seeded page translation matches the reader's shape", () => {
  it("only carries string title/body under a locale the shop can serve", () => {
    for (const { slug: tplSlug } of INDUSTRY_TEMPLATE_OPTIONS) {
      for (const page of getIndustryTemplate(tplSlug).pages) {
        if (!page.translations) continue;
        for (const [locale, fields] of Object.entries(page.translations)) {
          expect(locale, `${tplSlug}/${page.slug}: odd locale key`).toMatch(
            /^[a-z]{2}(-[A-Z]{2})?$/,
          );
          for (const [field, value] of Object.entries(fields)) {
            // getDynamicTranslation reads by column name; anything else is
            // dead weight that silently never renders.
            expect(
              ["title", "body", "metaTitle", "metaDescription"],
              `${tplSlug}/${page.slug}.${locale}: unreadable field "${field}"`,
            ).toContain(field);
            expect(typeof value).toBe("string");
          }
        }
      }
    }
  });
});

/**
 * The seed's shape is only worth anything if the two writers actually persist
 * it. Neither is unit-testable in-process (one is a CLI script, the other a
 * libSQL raw-SQL admin route), so this is a source-scan tripwire: it fails the
 * moment a writer stops carrying `translations`, which is exactly how the
 * demo-reset path silently dropped it before this change.
 */
describe("both seed writers persist Page.translations", () => {
  // Resolved against THIS file, never `process.cwd()`: the working directory of
  // a vitest run depends on where it was invoked from, and an ENOENT here would
  // read as a source defect rather than a harness one.
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

  // A commented-out writer is not a writer.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("prisma/seed.ts hands the object to Prisma for every template page", () => {
    // Bounded to the loop BODY. A slice that silently widens to the whole file
    // when its end marker moves would keep passing while constraining nothing,
    // so a moved anchor has to fail here instead. The anchor also pins the
    // orientation call: seeding `template.pages` raw is the F13 defect.
    const loop = stripComments(read("prisma/seed.ts")).match(
      /for \(const page of orientSeedPages\(template, brand\.defaultLocale\)\)[\s\S]*?\n {2}\}/,
    );
    expect(loop, "page seed loop not found — anchor moved").toBeTruthy();
    expect(loop![0]).toMatch(/translations:\s*\(translations as/);
    // Pre-stringifying a Json column double-encodes it (the trap already
    // documented for Product.attributes) — the object must go in raw.
    expect(loop![0]).not.toMatch(/translations:\s*JSON\.stringify/);
  });

  it("the demo-reset route writes translations for template pages", () => {
    const loop = stripComments(
      read("app/api/admin/reset-demo-data/route.ts"),
    ).match(
      /for \(const pg of orientSeedPages\(template, brand\.defaultLocale\)\)[\s\S]*?\n {4}\}/,
    );
    expect(loop, "demo-reset page loop not found — anchor moved").toBeTruthy();
    expect(loop![0]).toMatch(/UPDATE Page SET translations = \?/);
    // Raw SQL takes a string, unlike the Prisma path above.
    expect(loop![0]).toMatch(/JSON\.stringify\(pg\.translations\)/);
  });
});
