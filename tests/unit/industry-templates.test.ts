import { describe, expect, it } from "vitest";
import { getIndustryTemplate, INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";

/**
 * Industry-template loader test. Cartwright shipper kun "generic" — forks
 * tilføjer egne templates ved at registrere dem i industry-templates/index.ts.
 *
 * De generiske invariants (unique slugs, valid category-refs) itererer over
 * ALLE registrerede templates så fork-registrerede templates automatisk dækkes.
 */

describe("getIndustryTemplate", () => {
  it("returnerer generic-template med 2 kategorier og 6 produkter", () => {
    const t = getIndustryTemplate("generic");
    expect(t.label).toBe("Demo shop");
    expect(t.categories).toHaveLength(2);
    expect(t.products).toHaveLength(6);
    expect(t.pages.length).toBeGreaterThanOrEqual(3);
  });

  it("falder tilbage til generic ved ukendt slug", () => {
    const t = getIndustryTemplate("nonexistent-industry");
    expect(t.label).toBe("Demo shop");
  });

  it("falder tilbage til generic ved undefined", () => {
    const t = getIndustryTemplate(undefined);
    expect(t.label).toBe("Demo shop");
  });

  it("INDUSTRY_TEMPLATE_OPTIONS indeholder alle registrerede templates", () => {
    const slugs = INDUSTRY_TEMPLATE_OPTIONS.map((o) => o.slug);
    expect(slugs).toContain("generic");
    // Hver entry skal have label + description
    for (const opt of INDUSTRY_TEMPLATE_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });

  // Generisk invariants — itererer over ALLE registrerede templates så nye
  // industries automatisk testes (INDUSTRY_TEMPLATE_OPTIONS pattern)
  it("hver kategori har unikt slug på tværs af alle templates", () => {
    for (const { slug: tplSlug } of INDUSTRY_TEMPLATE_OPTIONS) {
      const t = getIndustryTemplate(tplSlug);
      const slugs = t.categories.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("alle produkter peger på en eksisterende category-slug", () => {
    for (const { slug: tplSlug } of INDUSTRY_TEMPLATE_OPTIONS) {
      const t = getIndustryTemplate(tplSlug);
      const validSlugs = new Set(t.categories.map((c) => c.slug));
      for (const p of t.products) {
        expect(validSlugs.has(p.categorySlug)).toBe(true);
      }
    }
  });

  it("hver produkt-slug er unikt i sin template", () => {
    for (const { slug: tplSlug } of INDUSTRY_TEMPLATE_OPTIONS) {
      const t = getIndustryTemplate(tplSlug);
      const slugs = t.products.map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});
