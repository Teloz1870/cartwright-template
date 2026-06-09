import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Resolvable Genome (A0) — kerne-invarianter, isoleret med mocket prisma +
 * brand.config. INGEN LLM: A0-feltet har endnu ingen resolver, så vi tester
 * READ-precedence (override > resolved-cache@deps > anker), deps-præcis
 * invalidering, fail-soft på junk, og apply-core (allowlist + schema + skriv).
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    brandingSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
// Mock the LLM-backed copy resolver so resolveField's write-back path is tested
// without any real model call (the dynamic import in fields.ts resolves to this).
vi.mock("@/lib/genome/resolvers/copy-field", () => ({
  resolveCopyField: vi.fn(async () => "RESOLVED in a playful tone here"),
}));
vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "Test Shop",
    footer: {
      tagline: "ANCHOR TAGLINE that is long enough",
      disclaimer: "ANCHOR DISCLAIMER · legal text",
    },
    uiLabels: {
      newsletterHeading: "Get updates here",
      newsletterSubtext: "Subscribe for news and offers today",
    },
    identity: {
      tone: "professional",
      audience: "general",
      formality: "balanced",
      vibe: "modern",
    },
    website: {
      eyebrow: "New",
      headline: "Anchor headline here",
      tagline: "Anchor tagline long enough for the schema validation.",
      cta: "Get started",
      valuePropsTitle: "Why choose us",
      valuePropsDescription: "Anchor description for the value props section.",
      featuresTitle: "What you get",
      featuresDescription: "Anchor description for the features section.",
      ctaFooterTitle: "Ready to begin?",
      ctaFooterDescription: "Anchor description for the closing CTA band.",
      ctaFooterCtaLabel: "Get started",
      valueProps: [{ title: "Promise", body: "A short promise body for the anchor." }],
      features: [{ title: "Feature", body: "A short feature body for the anchor." }],
    },
  },
}));

const ANCHOR = "ANCHOR TAGLINE that is long enough";

function genomeRow(blob: unknown) {
  return { genomeJson: blob ? JSON.stringify(blob) : null };
}

function resetAll() {
  vi.resetModules();
  mocks.prisma.brandingSettings.findUnique.mockReset();
  mocks.prisma.brandingSettings.upsert.mockReset();
  mocks.prisma.auditLog.create.mockReset();
  mocks.prisma.brandingSettings.upsert.mockResolvedValue({});
  mocks.prisma.auditLog.create.mockResolvedValue({});
}

describe("genome readField precedence", () => {
  beforeEach(resetAll);

  it("returnerer anker når genomeJson er null", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe(ANCHOR);
  });

  it("override vinder over anker", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({ overrides: { "footer.tagline": "OVERRIDE value goes here" } }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe("OVERRIDE value goes here");
  });

  it("resolved-cache bruges når deps matcher", async () => {
    const deps = JSON.stringify({ tone: "professional" });
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({
        resolved: { "footer.tagline": { value: "RESOLVED professional voice", deps } },
      }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe("RESOLVED professional voice");
  });

  it("forældet resolved-cache (deps-mismatch) falder tilbage til anker", async () => {
    const deps = JSON.stringify({ tone: "playful" }); // identity er professional nu
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({
        resolved: { "footer.tagline": { value: "RESOLVED playful voice", deps } },
      }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe(ANCHOR);
  });

  it("override slår resolved-cache", async () => {
    const deps = JSON.stringify({ tone: "professional" });
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({
        overrides: { "footer.tagline": "OVERRIDE wins over cache" },
        resolved: { "footer.tagline": { value: "RESOLVED text value", deps } },
      }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe("OVERRIDE wins over cache");
  });

  it("ugyldig override (for kort) falder tilbage til anker", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({ overrides: { "footer.tagline": "short" } }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe(ANCHOR);
  });

  it("korrupt genomeJson falder tilbage til anker", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ genomeJson: "{ not json" });
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe(ANCHOR);
  });
});

describe("genome store helpers", () => {
  beforeEach(resetAll);

  it("parseGenome dropper junk + non-string overrides", async () => {
    const { parseGenome } = await import("@/lib/genome/store");
    const b = parseGenome(JSON.stringify({ overrides: { a: "ok", b: 5 }, junk: 1 }));
    expect(b.overrides).toEqual({ a: "ok" });
  });

  it("depsKey inkluderer kun dependsOn-ankre, sorteret", async () => {
    const { GENOME_FIELDS } = await import("@/lib/genome/fields");
    const { depsKey } = await import("@/lib/genome/store");
    const deps = {
      tone: "x",
      audience: "y",
      formality: "z",
      vibe: "w",
      storeName: "s",
    };
    expect(depsKey(GENOME_FIELDS["footer.tagline"], deps)).toBe(
      JSON.stringify({ tone: "x" }),
    );
  });
});

describe("genome applyFieldOverride (apply-core)", () => {
  beforeEach(resetAll);

  it("afviser ukendt felt (allowlist)", async () => {
    const { applyFieldOverride } = await import("@/lib/genome/apply");
    const r = await applyFieldOverride("nope.field", "x", "user:test");
    expect(r.ok).toBe(false);
  });

  it("afviser ugyldig værdi (schema)", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { applyFieldOverride } = await import("@/lib/genome/apply");
    const r = await applyFieldOverride("footer.tagline", "short", "user:test");
    expect(r.ok).toBe(false);
  });

  it("skriver en gyldig override til genomeJson", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { applyFieldOverride } = await import("@/lib/genome/apply");
    const r = await applyFieldOverride(
      "footer.tagline",
      "A perfectly valid tagline here",
      "user:test",
    );
    expect(r.ok).toBe(true);
    expect(mocks.prisma.brandingSettings.upsert).toHaveBeenCalled();
    const call = mocks.prisma.brandingSettings.upsert.mock.calls[0][0] as {
      update: { genomeJson: string };
    };
    expect(call.update.genomeJson).toContain("A perfectly valid tagline here");
  });
});

describe("genome resolveField (triggered)", () => {
  beforeEach(resetAll);

  it("kortslutter til override uden at kalde en resolver", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({ overrides: { "footer.tagline": "Pinned override value here" } }),
    );
    const { resolveField } = await import("@/lib/genome/resolve");
    const r = await resolveField("footer.tagline", "user:test");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Pinned override value here");
  });

  it("kører resolver, validerer og skriver til resolved-cache", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { resolveField } = await import("@/lib/genome/resolve");
    const r = await resolveField("footer.tagline", "user:test");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe("RESOLVED in a playful tone here");
      expect(r.cached).toBe(false);
    }
    const call = mocks.prisma.brandingSettings.upsert.mock.calls.at(-1)?.[0] as {
      update: { genomeJson: string };
    };
    expect(call.update.genomeJson).toContain("RESOLVED in a playful tone here");
    expect(call.update.genomeJson).toContain("resolved");
  });

  it("anchored felt resolver aldrig — returnerer ankeret uden LLM", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { resolveField } = await import("@/lib/genome/resolve");
    const r = await resolveField("footer.disclaimer", "user:test");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe("ANCHOR DISCLAIMER · legal text");
      expect(r.cached).toBe(true);
    }
    // intet skrevet til resolved-cache (ingen upsert udløst af en resolve)
    expect(mocks.prisma.brandingSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("genome registry (A2 expansion)", () => {
  beforeEach(resetAll);

  it("rummer de registrerede felter (allowlist)", async () => {
    const { GENOME_FIELD_KEYS } = await import("@/lib/genome/fields");
    expect([...GENOME_FIELD_KEYS].sort()).toEqual([
      "footer.disclaimer",
      "footer.tagline",
      "home.ctaFooter.cta",
      "home.ctaFooter.description",
      "home.ctaFooter.title",
      "home.features.description",
      "home.features.items",
      "home.features.title",
      "home.hero.cta",
      "home.hero.eyebrow",
      "home.hero.headline",
      "home.hero.tagline",
      "home.valueProps.description",
      "home.valueProps.items",
      "home.valueProps.title",
      "uiLabels.newsletterHeading",
      "uiLabels.newsletterSubtext",
    ]);
  });

  it("inspectGenome rapporterer status pr. felt", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({ overrides: { "footer.tagline": "Pinned tagline value here" } }),
    );
    const { inspectGenome } = await import("@/lib/genome/inspect");
    const snap = await inspectGenome();
    const byKey = Object.fromEntries(snap.fields.map((f) => [f.key, f]));
    expect(byKey["footer.tagline"].status).toBe("override");
    expect(byKey["footer.tagline"].current).toBe("Pinned tagline value here");
    expect(byKey["footer.disclaimer"].status).toBe("anchor");
    expect(byKey["footer.disclaimer"].lock).toBe("anchored");
  });
});

describe("genome identity + reharmonize (A3)", () => {
  beforeEach(resetAll);

  it("afviser ugyldig tone", async () => {
    const { applyIdentityAnchor } = await import("@/lib/genome/identity");
    const r = await applyIdentityAnchor("tone", "bananas", "user:test");
    expect(r.ok).toBe(false);
  });

  it("skriver et gyldigt identity-anker til genomeJson", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { applyIdentityAnchor } = await import("@/lib/genome/identity");
    const r = await applyIdentityAnchor("tone", "playful", "user:test");
    expect(r.ok).toBe(true);
    const call = mocks.prisma.brandingSettings.upsert.mock.calls.at(-1)?.[0] as {
      update: { genomeJson: string };
    };
    expect(call.update.genomeJson).toContain("identity");
    expect(call.update.genomeJson).toContain("playful");
  });

  it("identity-override ændrer activeDeps", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({ identity: { tone: "playful" } }),
    );
    const { loadGenome, activeDeps } = await import("@/lib/genome/store");
    const deps = activeDeps(await loadGenome());
    expect(deps.tone).toBe("playful");
  });

  it("ændret tone gør tone-afhængig resolved-cache stale i readField", async () => {
    const deps = JSON.stringify({ tone: "professional" });
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(
      genomeRow({
        identity: { tone: "playful" },
        resolved: { "footer.tagline": { value: "RESOLVED professional voice", deps } },
      }),
    );
    const { readField } = await import("@/lib/genome/read");
    expect(await readField("footer.tagline")).toBe(ANCHOR);
  });

  it("reharmonizeAll re-resolver resolvable felter, springer anchored over", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(genomeRow(null));
    const { reharmonizeAll } = await import("@/lib/genome/identity");
    const results = await reharmonizeAll("user:test");
    expect(results.map((r) => r.key).sort()).toEqual([
      "footer.tagline",
      "home.ctaFooter.cta",
      "home.ctaFooter.description",
      "home.ctaFooter.title",
      "home.features.description",
      "home.features.title",
      "home.hero.cta",
      "home.hero.eyebrow",
      "home.hero.headline",
      "home.hero.tagline",
      "home.valueProps.description",
      "home.valueProps.title",
      "uiLabels.newsletterHeading",
      "uiLabels.newsletterSubtext",
    ]);
    expect(results.every((r) => r.result.ok)).toBe(true);
  });
});
