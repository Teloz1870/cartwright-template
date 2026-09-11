import { describe, expect, it } from "vitest";

import { buildSectionJsonLd } from "@/lib/builder/section-jsonld";

/**
 * Section → Schema.org JSON-LD. Makes Magic Builder / Aurora pages citable by AI
 * search engines. Pure mapping; the <JsonLd> component handles escaping at render.
 *
 * Honesty rule pinned here: testimonials carry NO rating data, so we emit Review
 * WITHOUT reviewRating (never invent an AggregateRating). Presentational sections
 * emit nothing.
 */

const OPTS = { baseUrl: "https://shop.test", orgName: "Test Shop" };
const sec = (key: string, props: Record<string, unknown>) => ({ id: "x", key, props });

describe("buildSectionJsonLd — mapped sections", () => {
  it("faq → FAQPage with Question/acceptedAnswer", () => {
    const out = buildSectionJsonLd(
      sec("faq", { title: "FAQ", items: [{ question: "Q1?", answer: "A1." }] }),
      OPTS,
    ) as Record<string, unknown>;
    expect(out["@type"]).toBe("FAQPage");
    const main = out.mainEntity as Array<Record<string, unknown>>;
    expect(main[0]["@type"]).toBe("Question");
    expect(main[0].name).toBe("Q1?");
    expect((main[0].acceptedAnswer as Record<string, unknown>).text).toBe("A1.");
  });

  it("howItWorks → HowTo with HowToStep", () => {
    const out = buildSectionJsonLd(
      sec("howItWorks", { title: "Sådan", steps: [{ n: "1", title: "Step", body: "Do it" }] }),
      OPTS,
    ) as Record<string, unknown>;
    expect(out["@type"]).toBe("HowTo");
    const steps = out.step as Array<Record<string, unknown>>;
    expect(steps[0]["@type"]).toBe("HowToStep");
    expect(steps[0].name).toBe("Step");
    expect(steps[0].text).toBe("Do it");
  });

  it("galleryGrid → ImageGallery; relative src resolved to absolute", () => {
    const out = buildSectionJsonLd(
      sec("galleryGrid", { items: [{ src: "/img/a.jpg", alt: "A" }, { src: "https://cdn.test/b.jpg", alt: "B" }] }),
      OPTS,
    ) as Record<string, unknown>;
    expect(out["@type"]).toBe("ImageGallery");
    const media = out.associatedMedia as Array<Record<string, unknown>>;
    expect(media[0].contentUrl).toBe("https://shop.test/img/a.jpg"); // relative → absolute
    expect(media[1].contentUrl).toBe("https://cdn.test/b.jpg"); // absolute untouched
  });

  it("testimonials → Review[] with author + itemReviewed, and NO fabricated rating", () => {
    const out = buildSectionJsonLd(
      sec("testimonials", { items: [{ quote: "Great!", author: "Mette", role: "Buyer" }] }),
      OPTS,
    ) as Array<Record<string, unknown>>;
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]["@type"]).toBe("Review");
    expect(out[0].reviewBody).toBe("Great!");
    expect((out[0].author as Record<string, unknown>).name).toBe("Mette");
    expect((out[0].itemReviewed as Record<string, unknown>)["@type"]).toBe("Organization");
    expect((out[0].itemReviewed as Record<string, unknown>).name).toBe("Test Shop");
    // Honesty rule: no invented rating anywhere.
    expect(JSON.stringify(out)).not.toMatch(/reviewRating|ratingValue|AggregateRating/);
  });

  it("pricingTable → ItemList of plan names (no fabricated price/currency)", () => {
    const out = buildSectionJsonLd(
      sec("pricingTable", { title: "Priser", plans: [{ name: "Pro", price: "199 kr", features: ["a"], ctaLabel: "Køb", ctaHref: "/x" }] }),
      OPTS,
    ) as Record<string, unknown>;
    expect(out["@type"]).toBe("ItemList");
    const items = out.itemListElement as Array<Record<string, unknown>>;
    expect(items[0]["@type"]).toBe("ListItem");
    expect(items[0].name).toBe("Pro");
    expect(JSON.stringify(out)).not.toMatch(/priceCurrency|"price"/); // no fabricated price
  });
});

describe("buildSectionJsonLd — presentational sections emit nothing", () => {
  for (const key of ["hero", "splitHero", "mediaHero", "valueProps", "featureGrid", "logoCloud", "statBand", "quote", "ctaFooter", "richText", "vibe", "stackGrid", "bannerCta", "newsletterBlock", "featureSplit"]) {
    it(`${key} → null`, () => {
      expect(buildSectionJsonLd(sec(key, {}), OPTS)).toBeNull();
    });
  }
  it("unknown key → null", () => {
    expect(buildSectionJsonLd(sec("nope", {}), OPTS)).toBeNull();
  });
});
