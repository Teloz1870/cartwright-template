import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Design-import (I) — extract (palette/fonts/tone) + apply (themeJson). Mocket
 * Firecrawl + LLM + prisma. Ingen rigtige kald.
 */

const mocks = vi.hoisted(() => ({
  scrapeUrl: vi.fn(),
  generateObject: vi.fn(),
  chatModelResolved: vi.fn(),
  prisma: { brandingSettings: { findUnique: vi.fn(), upsert: vi.fn() }, auditLog: { create: vi.fn() } },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/firecrawl", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, scrapeUrl: mocks.scrapeUrl };
});
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: mocks.chatModelResolved }));
vi.mock("@/lib/audit-context", () => ({ withAuditContext: (_c: unknown, fn: () => unknown) => Promise.resolve(fn()) }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const PALETTE = {
  accent: "#1e3f5a",
  accentDeep: "#0f2438",
  cream: "#f4efe6",
  sand: "#e8e1d3",
  ink: "#1a1a1a",
  muted: "#726d62",
};

function reset() {
  vi.resetModules();
  mocks.scrapeUrl.mockReset();
  mocks.generateObject.mockReset();
  mocks.chatModelResolved.mockReset().mockResolvedValue({ handle: {}, provider: "anthropic", model: "claude-haiku-4-5" });
  mocks.prisma.brandingSettings.findUnique.mockReset().mockResolvedValue({ themeJson: null });
  mocks.prisma.brandingSettings.upsert.mockReset().mockResolvedValue({});
  mocks.withAudit.mockReset().mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
}

describe("extractDesignTokens", () => {
  beforeEach(reset);

  it("fejler når Firecrawl ikke konfigureret", async () => {
    mocks.scrapeUrl.mockResolvedValue(null);
    const { extractDesignTokens } = await import("@/lib/design-import/extract");
    const r = await extractDesignTokens("https://x.dk");
    expect(r.ok).toBe(false);
  });

  it("udtrækker palette/fonts/tone", async () => {
    mocks.scrapeUrl.mockResolvedValue({ markdown: "site", html: "", metadata: {}, images: [] });
    mocks.generateObject.mockResolvedValue({
      object: { palette: PALETTE, fonts: { heading: "Inter", body: "Inter" }, toneKeywords: ["clean"] },
    });
    const { extractDesignTokens } = await import("@/lib/design-import/extract");
    const r = await extractDesignTokens("https://x.dk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens.palette.accent).toBe("#1e3f5a");
  });
});

describe("applyDesignPalette", () => {
  beforeEach(reset);

  it("skriver paletten til themeJson", async () => {
    const { applyDesignPalette } = await import("@/lib/design-import/apply");
    const r = await applyDesignPalette(PALETTE, "user:test");
    expect(r.ok).toBe(true);
    const call = mocks.prisma.brandingSettings.upsert.mock.calls[0][0];
    expect(JSON.parse(call.update.themeJson)).toEqual(PALETTE);
  });
});
