import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * describeBusiness (A5, "spawn fra én sætning") — udled identitet fra én sætning
 * → sæt ankre → re-resolve felter. MOCKET LLM (både identitets-inferensen og
 * copy-resolveren). Verificerer at ankrene persisteres og felterne re-resolves.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    brandingSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  generateObject: vi.fn(),
  chatModelResolved: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: mocks.chatModelResolved }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_ctx: unknown, fn: () => unknown) => Promise.resolve(fn()),
  getAuditContext: () => undefined,
}));
// reharmonize → resolveField → field.resolver dynamically imports this.
vi.mock("@/lib/genome/resolvers/copy-field", () => ({
  resolveCopyField: vi.fn(async () => "RESOLVED in the new voice here"),
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

describe("describeBusiness", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.prisma.brandingSettings.findUnique.mockReset();
    mocks.prisma.brandingSettings.upsert.mockReset();
    mocks.prisma.auditLog.create.mockReset();
    mocks.generateObject.mockReset();
    mocks.chatModelResolved.mockReset();
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ genomeJson: null });
    mocks.prisma.brandingSettings.upsert.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("udleder ankre, persisterer dem og re-resolver felterne", async () => {
    mocks.chatModelResolved.mockResolvedValue({
      handle: {},
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    mocks.generateObject.mockResolvedValue({
      object: { tone: "warm", audience: "consumer", formality: "casual", vibe: "cozy" },
    });

    const { describeBusiness } = await import("@/lib/genome/describe");
    const r = await describeBusiness(
      "We roast small-batch single-origin coffee for calm slow mornings.",
      "user:test",
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.identity.tone).toBe("warm");
      expect(r.identity.vibe).toBe("cozy");
      // alle resolvable felter re-resolves (footer.disclaimer er anchored → skips)
      expect(r.reharmonized.map((e) => e.key).sort()).toEqual([
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
        "shop.hero.cta",
        "shop.hero.subtagline",
        "shop.hero.title",
        "shop.pitch.body",
        "shop.pitch.title",
        "uiLabels.newsletterHeading",
        "uiLabels.newsletterSubtext",
      ]);
    }
    // ankre skrevet til genomeJson.identity
    const wrote = mocks.prisma.brandingSettings.upsert.mock.calls.some((c) =>
      String((c[0] as { update?: { genomeJson?: string } }).update?.genomeJson).includes(
        "warm",
      ),
    );
    expect(wrote).toBe(true);
  });

  it("afviser en for kort sætning uden at kalde en model", async () => {
    const { describeBusiness } = await import("@/lib/genome/describe");
    const r = await describeBusiness("coffee", "user:test");
    expect(r.ok).toBe(false);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
