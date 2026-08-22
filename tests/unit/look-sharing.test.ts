import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { type Composition } from "@/lib/compositions/spec";
import { toPublicLook } from "@/lib/compositions/public-look";
import { cafePreset } from "@/verticals/cafe/preset";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";

const sectionKey = Object.keys(SECTION_REGISTRY)[0] as keyof typeof SECTION_REGISTRY;

/** Full composition incl. every SENSITIVE field — mirrors compositions.test.ts. */
function fullComposition(): Composition {
  return {
    schema: "cartwright-composition-v1",
    name: "Slow Mornings",
    description: "Café voice on the Studio skin.",
    skin: "studio",
    palette: cafePreset.palette!,
    voice: {
      identity: { tone: "warm", audience: "consumer", formality: "casual", vibe: "cozy" },
      genomeOverrides: {
        "home.hero.eyebrow": cafePreset.genomeOverrides["home.hero.eyebrow"]!,
        "home.hero.headline": cafePreset.genomeOverrides["home.hero.headline"]!,
      },
    },
    chrome: { headerKey: "minimal-header", footerKey: "mega-footer" },
    scene: "aurora",
    homepageLayout: { sections: [{ id: "s1", key: sectionKey, enabled: true }] },
  };
}

describe("toPublicLook (the /api/look sharing boundary)", () => {
  it("keeps the cosmetic fields and stays a valid composition", () => {
    const look = toPublicLook(fullComposition());
    expect(look.skin).toBe("studio");
    expect(look.palette).toEqual(cafePreset.palette);
    expect(look.scene).toBe("aurora");
    expect(look.chrome).toEqual({ headerKey: "minimal-header", footerKey: "mega-footer" });
  });

  it("NEVER leaks voice (copy + identity) or homepageLayout — key-level negative assertion", () => {
    const json = JSON.parse(JSON.stringify(toPublicLook(fullComposition())));
    expect(json).not.toHaveProperty("voice");
    expect(json).not.toHaveProperty("homepageLayout");
    const flat = JSON.stringify(json);
    expect(flat).not.toContain("genomeOverrides");
    expect(flat).not.toContain(cafePreset.genomeOverrides["home.hero.headline"]!);
  });

  it("survives a minimal composition (skin only) without inventing fields", () => {
    const look = toPublicLook({
      schema: "cartwright-composition-v1",
      name: "Bare",
      skin: "studio",
    } as Composition);
    expect(look.skin).toBe("studio");
    expect(look).not.toHaveProperty("palette");
    expect(look).not.toHaveProperty("chrome");
  });
});

describe("/api/look route source (gating contract)", () => {
  // Textual contract check, same style as admin-api-auth.test.ts: the public
  // endpoint must gate on the lookSharing flag, 404 when off, and project
  // through toPublicLook — never serve exportComposition() raw.
  const src = readFileSync(
    path.resolve(process.cwd(), "app/api/look/route.ts"),
    "utf-8",
  );

  it("gates on brand.features.lookSharing with a 404", () => {
    expect(src).toMatch(/lookSharing/);
    expect(src).toMatch(/status:\s*404/);
  });

  it("serves through the toPublicLook projection (no raw export)", () => {
    expect(src).toMatch(/toPublicLook\s*\(/);
    expect(src).not.toMatch(/Response\.json\(\s*(await\s+)?exportComposition/);
  });
});
