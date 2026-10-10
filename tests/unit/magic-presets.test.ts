import { describe, expect, it } from "vitest";

import {
  matchPreset,
  presetLayout,
  instantPresetResult,
  STRONG_MATCH_SCORE,
} from "@/lib/magic/presets";
import { pageLayoutSchema } from "@/lib/builder/section-schema";
import { allVerticals } from "@/verticals";

/**
 * Mixer 2.0 Phase 3 — the INSTANT preset path. Deterministic keyword matching
 * (no LLM) + a layout assembled from a Voice's pre-written genome copy. The
 * contract under test: obvious industry prompts short-circuit instantly,
 * ambiguous prompts fall through to the LLM path (null), and the assembled
 * layout is always pageLayoutSchema-valid.
 */

describe("matchPreset", () => {
  it("matches an obvious industry prompt to its vertical (no LLM)", () => {
    const m = matchPreset("A landing page for a coffee roastery with a menu and opening hours");
    expect(m).not.toBeNull();
    expect(m!.vertical.slug).toBe("cafe");
    expect(m!.score).toBeGreaterThanOrEqual(STRONG_MATCH_SCORE);
  });

  it("matches the vertical's own name/slug words strongly", () => {
    expect(matchPreset("a page for my kindergarten")?.vertical.slug).toBe("kindergarten");
    expect(matchPreset("website for our hair salon")?.vertical.slug).toBe("salon");
    expect(matchPreset("en side til min tømrer-virksomhed")?.vertical.slug).toBe("carpenter");
  });

  it("returns null for generic prompts (falls through to the LLM path)", () => {
    expect(matchPreset("a pricing page with three tiers and a FAQ")).toBeNull();
    expect(matchPreset("modern landing page with hero and testimonials")).toBeNull();
  });

  it("does NOT strong-match on a single generic keyword like 'cozy' or 'warm'", () => {
    expect(matchPreset("a cozy portfolio site for a photographer")).toBeNull();
    expect(matchPreset("a warm welcome page")).toBeNull();
  });

  it("recognises a curated Look by its distinctive name", () => {
    const m = matchPreset("Give me the Metamorphosis look");
    expect(m).not.toBeNull();
    expect(m!.look?.slug).toBe("metamorphosis");
    expect(m!.vertical.slug).toBe("fable");
  });

  it("matching is diacritic-insensitive (café == cafe)", () => {
    expect(matchPreset("en hjemmeside til min café")?.vertical.slug).toBe("cafe");
  });
});

describe("presetLayout", () => {
  it("assembles a schema-valid layout from every shipped vertical", () => {
    for (const vertical of allVerticals()) {
      const layout = presetLayout(vertical);
      expect(layout, `presetLayout(${vertical.slug})`).not.toBeNull();
      expect(
        pageLayoutSchema.safeParse(layout).success,
        `pageLayoutSchema(${vertical.slug})`,
      ).toBe(true);
      // hero first, CTA last — the canonical preset page shape.
      expect(layout!.sections[0].key).toBe("hero");
      expect(layout!.sections.at(-1)!.key).toBe("ctaFooter");
    }
  });

  it("ships motion: below-the-fold sections carry a whitelisted effect", () => {
    const layout = presetLayout(allVerticals()[0])!;
    const belowFold = layout.sections.slice(1);
    expect(belowFold.length).toBeGreaterThan(0);
    for (const s of belowFold) expect(s.effect).toBe("fade-up");
    // The hero (above the fold) deliberately has none.
    expect(layout.sections[0].effect).toBeUndefined();
  });

  it("uses the preset's pre-written copy, not defaults", () => {
    const cafe = allVerticals().find((v) => v.slug === "cafe")!;
    const layout = presetLayout(cafe)!;
    expect(layout.sections[0].props).toMatchObject({
      headline: cafe.genomeOverrides["home.hero.headline"],
      tagline: cafe.genomeOverrides["home.hero.tagline"],
    });
  });
});

describe("instantPresetResult", () => {
  it("returns layout + vertical metadata for a strong match", () => {
    const r = instantPresetResult("a website for a neighbourhood coffee shop");
    expect(r).not.toBeNull();
    expect(r!.vertical.slug).toBe("cafe");
    expect(r!.vertical.suggestedDesignSlug).toBe("aurora-site");
    expect(r!.layout.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null when there is no strong match", () => {
    expect(instantPresetResult("an about page with our team and history")).toBeNull();
  });
});
