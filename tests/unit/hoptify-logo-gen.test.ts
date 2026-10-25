import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * HOP2 — Gemini logo-generator (lib/ai/logo-gen.ts). Mocket gemini-laget:
 * ægte buffer ved key, fail-soft uden key / ved safety-blok.
 */

const mocks = vi.hoisted(() => ({
  composeWithReferenceImages: vi.fn(),
  getGoogleGeminiApiKey: vi.fn(),
}));

class GeminiApiError extends Error {}
class GeminiRateLimit extends Error {}
class GeminiSafetyBlock extends Error {}

vi.mock("@/lib/ai/gemini", () => ({
  composeWithReferenceImages: mocks.composeWithReferenceImages,
  getGoogleGeminiApiKey: mocks.getGoogleGeminiApiKey,
  GeminiApiError,
  GeminiRateLimit,
  GeminiSafetyBlock,
}));

function reset() {
  vi.resetModules();
  mocks.composeWithReferenceImages.mockReset();
  mocks.getGoogleGeminiApiKey.mockReset();
}

describe("generateLogoImage", () => {
  beforeEach(reset);

  it("returnerer buffer når key findes", async () => {
    mocks.getGoogleGeminiApiKey.mockResolvedValue("key-123");
    mocks.composeWithReferenceImages.mockResolvedValue(Buffer.from("PNGDATA"));
    const { generateLogoImage } = await import("@/lib/ai/logo-gen");
    const r = await generateLogoImage("en glad grøn frø");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe("image/png");
      expect(r.buffer.toString()).toBe("PNGDATA");
    }
    // 0 reference-billeder = ren text-to-image
    expect(mocks.composeWithReferenceImages.mock.calls[0][0].references).toEqual([]);
  });

  it("fail-soft uden key (kalder ikke Gemini)", async () => {
    mocks.getGoogleGeminiApiKey.mockResolvedValue(null);
    const { generateLogoImage } = await import("@/lib/ai/logo-gen");
    const r = await generateLogoImage("noget");
    expect(r.ok).toBe(false);
    expect(mocks.composeWithReferenceImages).not.toHaveBeenCalled();
  });

  it("fail-soft ved safety-blok", async () => {
    mocks.getGoogleGeminiApiKey.mockResolvedValue("key-123");
    mocks.composeWithReferenceImages.mockRejectedValue(new GeminiSafetyBlock());
    const { generateLogoImage } = await import("@/lib/ai/logo-gen");
    const r = await generateLogoImage("noget");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/safety/i);
  });

  it("afviser tom prompt", async () => {
    const { generateLogoImage } = await import("@/lib/ai/logo-gen");
    const r = await generateLogoImage("   ");
    expect(r.ok).toBe(false);
    expect(mocks.getGoogleGeminiApiKey).not.toHaveBeenCalled();
  });
});
