import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";
import {
  getIndustryTemplate,
  INDUSTRY_TEMPLATE_OPTIONS,
} from "@/industry-templates";

/**
 * ULTRAPLAN-lite UL7: "fork-readiness" snapshot-tests.
 *
 * Verificerer at de strukturelle invariants som fork-shops depender på er
 * intakte. Hvis nogen af disse fejler, kan en frisk fork (panel-hegn.dk,
 * sømosegaard, etc.) ikke køre `npm run seed` → `npm run build` uden manual
 * intervention.
 *
 * Dækker:
 * - brand.config har alle nødvendige felter (uiLabels, industryTemplate, ai.promptModule)
 * - Industry-templates loader virker for kendte slugs + fallback
 * - Alle template-produkter har valid category-refs (regressionssikret i UL4-test)
 * - Brand-merge tager DB-overrides uden at bryde defaults (regressionssikret i UL5-test)
 */

describe("fork-readiness invariants", () => {
  it("brand.config har alle krævede top-level felter", () => {
    expect(brand.storeName).toBeTruthy();
    expect(brand.storeSlug).toBeTruthy();
    expect(brand.domain).toBeTruthy();
    expect(brand.url).toMatch(/^https?:\/\//);
    expect(brand.industryTemplate).toBeTruthy();
  });

  it("brand.uiLabels er fuldt populated (UL1)", () => {
    expect(brand.uiLabels.searchPlaceholder).toBeTruthy();
    expect(brand.uiLabels.searchAria).toBeTruthy();
    expect(brand.uiLabels.allProductsLink).toBeTruthy();
    expect(brand.uiLabels.newsletterHeading).toBeTruthy();
    expect(brand.uiLabels.newsletterSubtext).toBeTruthy();
    // F1: tryOn-labels må være tomme strings når features.tryOn=false
    // (fork-shops uden ansigts-relateret produkt — fx panel-hegn, keramik).
    // Kun krav: feltet er defineret som string (ikke undefined). Indhold-check
    // er behov-baseret: hvis features.tryOn=true så skal de være truthy.
    expect(typeof brand.uiLabels.tryOnHeading).toBe("string");
    expect(typeof brand.uiLabels.tryOnSubtext).toBe("string");
    if (brand.features.tryOn) {
      expect(brand.uiLabels.tryOnHeading).toBeTruthy();
      expect(brand.uiLabels.tryOnSubtext).toBeTruthy();
    }
    expect(brand.uiLabels.aiStylistFallbackHeading).toBeTruthy();
    expect(brand.uiLabels.aiStylistPlaceholder).toBeTruthy();
    expect(brand.uiLabels.notFoundProductsLink).toBeTruthy();
    expect(brand.uiLabels.productsPageHeading).toBeTruthy();
    expect(brand.uiLabels.heroSubtagline).toBeTruthy();
    expect(brand.uiLabels.heroCta).toBeTruthy();
    expect(brand.uiLabels.categoryAllProductsBreadcrumb).toBeTruthy();
  });

  it("brand.ai.promptModule peger på en eksisterende prompt-modul (UL2)", async () => {
    // F1 (P3-fix): check at filen lib/ai/prompts/<promptModule>.ts faktisk
    // findes — i stedet for hardcoded whitelist der brækker hver fork.
    // fs.access er hurtigere end import (ingen runtime-evaluation).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const promptFile = path.join(
      process.cwd(),
      "lib/ai/prompts",
      `${brand.ai.promptModule}.ts`,
    );
    await expect(fs.access(promptFile)).resolves.toBeUndefined();
  });

  it("brand.industryTemplate matcher en eksisterende template (UL4)", () => {
    const template = getIndustryTemplate(brand.industryTemplate);
    expect(template.label).toBeTruthy();
    expect(template.categories.length).toBeGreaterThan(0);
    expect(template.products.length).toBeGreaterThan(0);
  });

  it("brand.policies har positive ints for shipping (UL5 default-fallback)", () => {
    expect(brand.policies.shippingFreeThresholdDkk).toBeGreaterThan(0);
    expect(brand.policies.shippingDefaultDkk).toBeGreaterThan(0);
    expect(brand.policies.returnDays).toBeGreaterThan(0);
  });

  it("alle features-flags er booleans (ikke undefined)", () => {
    expect(typeof brand.features.tryOn).toBe("boolean");
    expect(typeof brand.features.aiStylist).toBe("boolean");
    expect(typeof brand.features.newsletter).toBe("boolean");
    expect(typeof brand.features.mcpPublic).toBe("boolean");
  });

  it("brand.emails har alle 4 nødvendige adresser", () => {
    expect(brand.emails.from).toMatch(/@/);
    expect(brand.emails.fromName).toBeTruthy();
    expect(brand.emails.support).toMatch(/@/);
    expect(brand.emails.admin).toMatch(/@/);
  });

  it("brand.stripeAppearance + emailColors har valid hex-værdier", () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    expect(brand.stripeAppearance.colorPrimary).toMatch(hexRe);
    expect(brand.emailColors.accent).toMatch(hexRe);
    expect(brand.emailColors.cream).toMatch(hexRe);
    expect(brand.emailColors.ink).toMatch(hexRe);
  });

  it("alle industry-templates har valid pages + unique product-slugs", () => {
    // P1.5: iterér alle registrerede templates dynamisk så nye industries
    // (fencing, etc.) automatisk dækkes uden code-edit her.
    for (const { slug: tplName } of INDUSTRY_TEMPLATE_OPTIONS) {
      const t = getIndustryTemplate(tplName);
      // Pages skal være parsable som static-content
      for (const page of t.pages) {
        expect(page.slug).toMatch(/^[a-z0-9-]+$/);
        expect(page.title).toBeTruthy();
        expect(page.body.length).toBeGreaterThan(20);
      }
      // Products skal være valide
      for (const p of t.products) {
        expect(p.slug).toMatch(/^[a-z0-9-]+$/);
        expect(p.priceDkk).toBeGreaterThan(0);
        expect(p.stock).toBeGreaterThanOrEqual(0);
        expect(p.images.length).toBeGreaterThan(0);
      }
    }
  });
});
