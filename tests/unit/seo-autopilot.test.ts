import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * SEO/GEO Autopilot (K) — keep/revert-beslutning (rent), GEO-citation-detektion,
 * og eksperiment-evaluering (behold/revert via genome). Mocket genome + LLM + prisma.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    geoSnapshot: { create: vi.fn() },
    seoExperiment: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
  applyFieldOverride: vi.fn(),
  readField: vi.fn(),
  generateText: vi.fn(),
  chatModelResolved: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/genome/apply", () => ({ applyFieldOverride: mocks.applyFieldOverride }));
vi.mock("@/lib/genome/read", () => ({ readField: mocks.readField }));
vi.mock("@/lib/genome/fields", () => ({ isGenomeFieldKey: (k: string) => k === "footer.tagline" }));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: mocks.chatModelResolved }));
vi.mock("@/brand.config", () => ({
  brand: { storeName: "Northbound", domain: "northbound.dk", tagline: "kaffe" },
}));

function reset() {
  vi.resetModules();
  mocks.prisma.geoSnapshot.create.mockReset().mockResolvedValue({});
  mocks.prisma.seoExperiment.findUnique.mockReset();
  mocks.prisma.seoExperiment.update.mockReset().mockResolvedValue({});
  mocks.applyFieldOverride.mockReset().mockResolvedValue({ ok: true });
  mocks.readField.mockReset().mockResolvedValue("gammel tagline");
  mocks.generateText.mockReset();
  mocks.chatModelResolved.mockReset().mockResolvedValue({ handle: {} });
}

describe("decideKeepOrRevert", () => {
  beforeEach(reset);

  it("klik op → behold", async () => {
    const { decideKeepOrRevert } = await import("@/lib/seo/experiment");
    expect(decideKeepOrRevert({ clicks: 10, position: 5 }, { clicks: 14, position: 5 }).keep).toBe(true);
  });
  it("position forbedret → behold", async () => {
    const { decideKeepOrRevert } = await import("@/lib/seo/experiment");
    expect(decideKeepOrRevert({ clicks: 10, position: 8 }, { clicks: 10, position: 6 }).keep).toBe(true);
  });
  it("klik faldt → revert", async () => {
    const { decideKeepOrRevert } = await import("@/lib/seo/experiment");
    expect(decideKeepOrRevert({ clicks: 10, position: 5 }, { clicks: 7, position: 5 }).keep).toBe(false);
  });
  it("ingen forbedring → revert", async () => {
    const { decideKeepOrRevert } = await import("@/lib/seo/experiment");
    expect(decideKeepOrRevert({ clicks: 10, position: 5 }, { clicks: 10, position: 5 }).keep).toBe(false);
  });
});

describe("measureGeoCitation", () => {
  beforeEach(reset);

  it("detekterer citation når brandet nævnes", async () => {
    mocks.generateText.mockResolvedValue({ text: "Du bør prøve Northbound, de er gode." });
    const { measureGeoCitation } = await import("@/lib/seo/geo-tracker");
    const r = await measureGeoCitation("bedste kaffe?");
    expect(r.cited).toBe(true);
    expect(mocks.prisma.geoSnapshot.create).toHaveBeenCalled();
  });
  it("ikke citeret når brandet ikke nævnes", async () => {
    mocks.generateText.mockResolvedValue({ text: "Prøv en anden butik." });
    const { measureGeoCitation } = await import("@/lib/seo/geo-tracker");
    expect((await measureGeoCitation("bedste kaffe?")).cited).toBe(false);
  });
});

describe("evaluateExperiment", () => {
  beforeEach(reset);

  it("beholder ved forbedring (ingen revert)", async () => {
    mocks.prisma.seoExperiment.findUnique.mockResolvedValue({
      id: "e1", fieldKey: "footer.tagline", beforeValue: "gammel", status: "running",
      baselineJson: JSON.stringify({ clicks: 10, position: 5 }),
    });
    const { evaluateExperiment } = await import("@/lib/seo/experiment");
    const r = await evaluateExperiment("e1", { clicks: 15, position: 5 }, "user:test");
    expect(r.decision).toBe("kept");
    expect(mocks.applyFieldOverride).not.toHaveBeenCalled(); // ingen revert
    expect(mocks.prisma.seoExperiment.update.mock.calls[0][0].data.status).toBe("kept");
  });

  it("reverterer ved ingen forbedring (genome reset til before)", async () => {
    mocks.prisma.seoExperiment.findUnique.mockResolvedValue({
      id: "e1", fieldKey: "footer.tagline", beforeValue: "gammel", status: "running",
      baselineJson: JSON.stringify({ clicks: 10, position: 5 }),
    });
    const { evaluateExperiment } = await import("@/lib/seo/experiment");
    const r = await evaluateExperiment("e1", { clicks: 8, position: 5 }, "user:test");
    expect(r.decision).toBe("reverted");
    expect(mocks.applyFieldOverride).toHaveBeenCalledWith("footer.tagline", "gammel", "user:test");
  });
});
