import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Firecrawl-scraper (F) — extractImages (rent), scrapeProduct ok/fejl. Mocket
 * Firecrawl-wrapper + LLM. Ingen rigtige kald.
 */

describe("extractImages", () => {
  it("samler ogImage + <img src> (https, deduped)", async () => {
    const { extractImages } = await import("@/lib/firecrawl");
    const imgs = extractImages({
      html: '<img src="https://a.dk/x.jpg"/><img src="/relativ.jpg"/><img src="https://a.dk/x.jpg"/>',
      metadata: { ogImage: "https://a.dk/og.png" },
    });
    expect(imgs).toEqual(["https://a.dk/og.png", "https://a.dk/x.jpg"]);
  });
});

const mocks = vi.hoisted(() => ({
  scrapeUrl: vi.fn(),
  generateObject: vi.fn(),
  chatModelResolved: vi.fn(),
}));

vi.mock("@/lib/firecrawl", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, scrapeUrl: mocks.scrapeUrl };
});
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: mocks.chatModelResolved }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_c: unknown, fn: () => unknown) => Promise.resolve(fn()),
}));

describe("scrapeProduct", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.scrapeUrl.mockReset();
    mocks.generateObject.mockReset();
    mocks.chatModelResolved.mockReset();
  });

  it("fejler pænt når Firecrawl ikke er konfigureret (scrapeUrl → null)", async () => {
    mocks.scrapeUrl.mockResolvedValue(null);
    const { scrapeProduct } = await import("@/lib/scrape/product");
    const r = await scrapeProduct("https://shop.dk/p/1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/FIRECRAWL_API_KEY/);
  });

  it("afviser ugyldig URL uden at scrape", async () => {
    const { scrapeProduct } = await import("@/lib/scrape/product");
    const r = await scrapeProduct("ikke-en-url");
    expect(r.ok).toBe(false);
    expect(mocks.scrapeUrl).not.toHaveBeenCalled();
  });

  it("udtrækker struktureret produkt + billeder", async () => {
    mocks.scrapeUrl.mockResolvedValue({
      markdown: "# Kaffe\nLækker kaffe 125 kr",
      html: "",
      metadata: {},
      images: ["https://a.dk/1.jpg", "https://a.dk/2.jpg"],
    });
    mocks.chatModelResolved.mockResolvedValue({ handle: {}, provider: "anthropic", model: "claude-haiku-4-5" });
    mocks.generateObject.mockResolvedValue({
      object: { name: "Kaffe", description: "Lækker kaffe fra Brasilien", priceKr: 125, attributes: [{ key: "Vægt", value: "250g" }] },
    });
    const { scrapeProduct } = await import("@/lib/scrape/product");
    const r = await scrapeProduct("https://shop.dk/p/kaffe");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.product.name).toBe("Kaffe");
      expect(r.product.priceKr).toBe(125);
      expect(r.product.imageUrls).toEqual(["https://a.dk/1.jpg", "https://a.dk/2.jpg"]);
      expect(r.product.sourceUrl).toBe("https://shop.dk/p/kaffe");
    }
  });
});
