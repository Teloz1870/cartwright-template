import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mixer 2.0 Phase 2 — the composition artifact (cartwright-composition-v1).
 *
 *  - spec: structural + referential validation (skin/chrome/genome/scene refs)
 *  - round-trip: every curated Look expands (lookToComposition) into a
 *    composition that parses against the spec — the "Download this look" file
 *  - applyComposition: the ONE atomic mutation set against a mocked prisma
 *    (BrandingSettings blobs + genomeJson merge + homepage Page.layoutJson),
 *    incl. wholesale rejection (no writes on an invalid artifact)
 */

// ── Mocks (apply-path only; the spec itself is pure) ────────────────────────

const brandingFindUnique = vi.fn();
const brandingUpsert = vi.fn();
const pageFindUnique = vi.fn();
const pageUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    brandingSettings: {
      findUnique: (...a: unknown[]) => brandingFindUnique(...a),
      findFirst: (...a: unknown[]) => brandingFindUnique(...a),
      upsert: (...a: unknown[]) => brandingUpsert(...a),
    },
    page: {
      findUnique: (...a: unknown[]) => pageFindUnique(...a),
      upsert: (...a: unknown[]) => pageUpsert(...a),
      update: vi.fn(),
    },
  },
}));

// Pass-through audit: exercises the before-snapshot, skips the AuditLog write.
vi.mock("@/lib/audit", () => ({
  withAudit: async (
    meta: { before?: () => Promise<unknown> | unknown },
    handler: () => Promise<unknown>,
  ) => {
    if (meta.before) await meta.before();
    return handler();
  },
  listAuditEntries: vi.fn(),
}));

import { CompositionSchema, parseComposition, type Composition } from "@/lib/compositions/spec";
import { DESIGN_OPTIONS, MIXABLE_DESIGN_SLUGS } from "@/designs/options";
import { lookToComposition } from "@/lib/compositions/from-look";
import { applyComposition } from "@/lib/compositions/apply";
import { LOOKS } from "@/verticals/looks";
import { cafePreset } from "@/verticals/cafe/preset";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";

const sectionKey = Object.keys(SECTION_REGISTRY)[0] as keyof typeof SECTION_REGISTRY;

/** A full, valid composition built from real registry data. */
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

// ── Spec: round-trip + structural validation ────────────────────────────────

describe("cartwright-composition-v1 spec", () => {
  it("accepts a minimal composition (skin only)", () => {
    const r = CompositionSchema.safeParse({
      schema: "cartwright-composition-v1",
      name: "Bare look",
      skin: "studio",
    });
    expect(r.success).toBe(true);
  });

  it("round-trips a full composition through JSON (parseComposition)", () => {
    const r = parseComposition(JSON.stringify(fullComposition()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.composition.skin).toBe("studio");
      expect(r.composition.chrome?.headerKey).toBe("minimal-header");
      expect(Object.keys(r.composition.voice?.genomeOverrides ?? {})).toHaveLength(2);
      expect(r.composition.homepageLayout?.sections).toHaveLength(1);
    }
  });

  it("rejects non-JSON and a wrong schema id with readable errors", () => {
    expect(parseComposition("not json{").ok).toBe(false);
    const r = parseComposition(
      JSON.stringify({ schema: "cartwright-design-v1", name: "x", skin: "studio" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schema");
  });
});

describe("cartwright-composition-v1 spec — referential validation", () => {
  const base = fullComposition();

  it("rejects an unknown design slug (skin ∉ registry)", () => {
    const r = CompositionSchema.safeParse({ ...base, skin: "not-a-design" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "skin")).toBe(true);
  });

  it("rejects an unknown genome field key", () => {
    const r = CompositionSchema.safeParse({
      ...base,
      voice: { genomeOverrides: { "not.a.field": "value" } },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".").includes("not.a.field"))).toBe(true);
    }
  });

  it("rejects a genome value that fails its field's own schema", () => {
    const r = CompositionSchema.safeParse({
      ...base,
      voice: { genomeOverrides: { "footer.tagline": "x" } }, // min 10 chars
    });
    expect(r.success).toBe(false);
  });

  it("rejects a chrome key of the wrong kind (footer key in the header slot)", () => {
    const r = CompositionSchema.safeParse({
      ...base,
      chrome: { headerKey: "mega-footer" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a locked-theme chrome on a foreign skin", () => {
    // halo-header is a locked-theme chrome (mixable: false) — only on halo.
    const r = CompositionSchema.safeParse({
      ...base,
      chrome: { headerKey: "halo-header" },
    });
    expect(r.success).toBe(false);

    // …but it IS valid on its own design.
    const own = CompositionSchema.safeParse({
      schema: "cartwright-composition-v1",
      name: "Halo look",
      skin: "halo",
      chrome: { headerKey: "halo-header" },
    });
    expect(own.success).toBe(true);
  });

  // A REGISTERED design outside the mixable slug set — DERIVED, because a
  // pruned scaffold (light) need not ship any particular locked design; a
  // hardcoded "nocturne" made this case fail in the light release-scaffold-
  // gate (2026-08-07). No locked design in this profile ⇒ the case SKIPS.
  const LOCKED_SKIN = DESIGN_OPTIONS.find((d) => !MIXABLE_DESIGN_SLUGS.has(d.slug))?.slug;

  it.skipIf(!LOCKED_SKIN)(
    "tells an installer WHICH side refused a neutral Part on a locked skin",
    () => {
      // The skin is registered but not mixable, so mega-footer — a neutral,
      // mixable Part — is refused BY THE SKIN. The message used to read
      // `only renders on the "undefined" design`, which named a design that
      // does not exist and pointed the installer at the wrong thing to change.
      const r = CompositionSchema.safeParse({
        schema: "cartwright-composition-v1",
        name: "Locked look",
        skin: LOCKED_SKIN!,
        chrome: { footerKey: "mega-footer" },
      });
      expect(r.success).toBe(false);
      const message = r.success ? "" : r.error.issues[0]!.message;
      expect(message).not.toContain("undefined");
      expect(message).toContain(`the skin "${LOCKED_SKIN}"`);
      expect(r.success ? [] : r.error.issues[0]!.path).toEqual(["chrome", "footerKey"]);
    },
  );

  it("does not tell an installer to edit a pack they do not have", () => {
    // The portability case: a composition authored on a shop that HAS
    // "acme-bespoke". The skin issue fires, but superRefine does not return, so
    // the chrome check runs too. Its remedy must not be "declare that pack
    // mixable" — the installer has no such pack to edit.
    const r = CompositionSchema.safeParse({
      schema: "cartwright-composition-v1",
      name: "Foreign look",
      skin: "acme-bespoke",
      chrome: { footerKey: "mega-footer" },
    });
    expect(r.success).toBe(false);
    const messages = r.success ? [] : r.error.issues.map((i) => i.message);
    // Both issues still fire — this changes wording, not the validator's shape.
    expect(messages.some((m) => m.includes("Unknown design slug"))).toBe(true);
    const chromeIssue = messages.find((m) => m.includes("mega-footer"))!;
    expect(chromeIssue).toContain("is not a registered design on this shop");
    expect(chromeIssue).not.toContain("declare it mixable");
  });

  it("rejects an unknown 3D scene id", () => {
    const r = CompositionSchema.safeParse({ ...base, scene: "not-a-scene" });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed palette (non-hex token)", () => {
    const r = CompositionSchema.safeParse({
      ...base,
      palette: { ...base.palette!, accent: "tomato" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a homepage layout with a non-whitelisted section key", () => {
    const r = CompositionSchema.safeParse({
      ...base,
      homepageLayout: { sections: [{ id: "s1", key: "evil-section", enabled: true }] },
    });
    expect(r.success).toBe(false);
  });
});

// ── Looks → compositions (the "Download this look" artifact) ────────────────

describe("lookToComposition", () => {
  it("expands EVERY curated look into a spec-valid composition", () => {
    for (const look of LOOKS) {
      const comp = lookToComposition(look);
      expect(comp, `look "${look.slug}" has no composition`).not.toBeNull();
      const r = CompositionSchema.safeParse(comp);
      expect(
        r.success,
        `look "${look.slug}": ${r.success ? "" : r.error.issues[0]?.message}`,
      ).toBe(true);
    }
  });

  it("inlines the voice preset's identity, copy, palette and scene", () => {
    const look = LOOKS.find((l) => l.voiceSlug === "cafe")!;
    const comp = lookToComposition(look)!;
    expect(comp.skin).toBe(look.designSlug);
    expect(comp.palette).toEqual(cafePreset.palette);
    expect(comp.scene).toBe(cafePreset.scene);
    expect(comp.voice?.identity?.tone).toBe("warm");
    expect(comp.voice?.genomeOverrides?.["home.hero.headline"]).toBe(
      cafePreset.genomeOverrides["home.hero.headline"],
    );
  });

  it("returns null for an unknown voice slug", () => {
    expect(
      lookToComposition({
        slug: "x",
        name: "X",
        description: "d",
        designSlug: "studio",
        voiceSlug: "no-such-voice",
      }),
    ).toBeNull();
  });
});

// ── applyComposition — the atomic mutation set (mocked prisma) ──────────────

describe("applyComposition", () => {
  beforeEach(() => {
    brandingFindUnique.mockReset().mockResolvedValue({
      designSlug: null,
      themeJson: null,
      chromeJson: null,
      threeDConfigJson: null,
      genomeJson: JSON.stringify({ overrides: { "footer.tagline": "An existing tagline." } }),
    });
    brandingUpsert.mockReset().mockResolvedValue({});
    pageFindUnique.mockReset().mockResolvedValue(null);
    pageUpsert.mockReset().mockResolvedValue({});
  });

  it("writes the full mutation set in one apply (branding + genome + homepage)", async () => {
    const r = await applyComposition(fullComposition(), {}, "system:test");
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;

    // 1) BrandingSettings — designSlug + themeJson + chromeJson +
    //    threeDConfigJson in ONE upsert.
    const brandingWrite = brandingUpsert.mock.calls.find(
      (c) => (c[0] as { update: { designSlug?: string } }).update.designSlug === "studio",
    )?.[0] as { update: Record<string, string> };
    expect(brandingWrite).toBeDefined();
    expect(JSON.parse(brandingWrite.update.themeJson)).toEqual(cafePreset.palette);
    expect(JSON.parse(brandingWrite.update.chromeJson)).toEqual({
      headerKey: "minimal-header",
      footerKey: "mega-footer",
    });
    expect(JSON.parse(brandingWrite.update.threeDConfigJson).scene).toBe("aurora");

    // 2) Genome — identity + overrides MERGED over the existing blob.
    const genomeWrite = brandingUpsert.mock.calls.find(
      (c) => typeof (c[0] as { update: { genomeJson?: string } }).update.genomeJson === "string",
    )?.[0] as { update: { genomeJson: string } };
    expect(genomeWrite).toBeDefined();
    const genome = JSON.parse(genomeWrite.update.genomeJson);
    expect(genome.identity.tone).toBe("warm");
    expect(genome.overrides["home.hero.headline"]).toBe(
      cafePreset.genomeOverrides["home.hero.headline"],
    );
    // pre-existing override survives the merge
    expect(genome.overrides["footer.tagline"]).toBe("An existing tagline.");

    // 3) Homepage — Page.layoutJson upsert on the default "home" slug.
    expect(pageUpsert).toHaveBeenCalledTimes(1);
    const pageWrite = pageUpsert.mock.calls[0][0] as {
      where: { slug: string };
      update: { layoutJson: string };
    };
    expect(pageWrite.where.slug).toBe("home");
    expect(JSON.parse(pageWrite.update.layoutJson).sections).toHaveLength(1);

    // Result summary
    expect(r.appliedSkin).toBe("studio");
    expect(r.appliedPalette).toBe(true);
    expect(r.appliedScene).toBe("aurora");
    expect(r.fields).toBe(2);
    expect(r.appliedHomepage).toBe("home");
    expect(r.skipped).toEqual([]);
  });

  it("a minimal composition only writes the skin (omitted parts untouched)", async () => {
    const r = await applyComposition(
      { schema: "cartwright-composition-v1", name: "Bare", skin: "studio" },
      {},
      "system:test",
    );
    expect(r.ok).toBe(true);
    expect(brandingUpsert).toHaveBeenCalledTimes(1);
    const write = brandingUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(write.update).toEqual({ designSlug: "studio" });
    expect(pageUpsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid composition WHOLESALE — zero writes", async () => {
    const bad = { ...fullComposition(), skin: "not-a-design" };
    const r = await applyComposition(bad, {}, "system:test");
    expect(r.ok).toBe(false);
    expect(brandingUpsert).not.toHaveBeenCalled();
    expect(pageUpsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid identity-anchor enum server-side — zero writes", async () => {
    const bad = fullComposition();
    bad.voice!.identity!.tone = "shouty"; // not in IDENTITY_OPTIONS
    const r = await applyComposition(bad, {}, "system:test");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tone");
    expect(brandingUpsert).not.toHaveBeenCalled();
  });

  it("homepage upsert failure is fail-soft (recorded as skipped, look still applies)", async () => {
    pageUpsert.mockRejectedValue(new Error("no layoutJson column"));
    const r = await applyComposition(fullComposition(), {}, "system:test");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toEqual(["homepageLayout"]);
    expect(r.appliedHomepage).toBeNull();
    // branding + genome still written
    expect(brandingUpsert.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("honours a custom homepage slug", async () => {
    const r = await applyComposition(fullComposition(), { homepageSlug: "front" }, "system:test");
    expect(r.ok).toBe(true);
    const pageWrite = pageUpsert.mock.calls[0][0] as { where: { slug: string } };
    expect(pageWrite.where.slug).toBe("front");
  });
});
