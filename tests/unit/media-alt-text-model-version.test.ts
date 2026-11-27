import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DRØM138-a — `MediaAsset.aiModel` records the model that answered, not the
 * model we asked for.
 *
 * Google re-points model names under us (from 2026-12-01 `gemini-2.5-flash`
 * is served by a different model), so the constant we send is not proof of
 * what wrote a shop's alt text. Gemini's response carries `modelVersion`
 * ("The model version used to generate the response", generateContent API
 * reference); the alt-text call returns it and the media-ai cron stores it.
 *
 * Both legs are driven for real: `generateAltTextFromUrl` against a stubbed
 * `fetch`, and the cron route with only the database and the alt-text call
 * stubbed. No API key or network is needed.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/ai/gemini", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/gemini")>();
  return { ...real, getGoogleGeminiApiKey: async () => "test-key" };
});

import { GEMINI_TEXT_MODEL } from "@/lib/ai/gemini";
import { answeringModel, generateAltTextFromUrl } from "@/lib/media/alt-text";

const ALT_JSON = JSON.stringify({
  alt: { da: "En rød stol", en: "A red chair" },
  title: "Red chair",
  caption: "A red chair in a room",
  geoSnippet: "",
  dominantColors: ["#ff0000", "#00ff00", "#0000ff"],
  suggestedFilename: "red-chair",
});

function geminiResponse(extra: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: ALT_JSON }] } }],
      ...extra,
    }),
    { status: 200 },
  );
}

function stubFetch(extra: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("generativelanguage.googleapis.com")) return geminiResponse(extra);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("generateAltTextFromUrl reports the answering model", () => {
  it("returns Gemini's modelVersion when the response carries one", async () => {
    stubFetch({ modelVersion: "gemini-3.5-flash-lite-001" });
    const result = await generateAltTextFromUrl({ url: "https://blob.example/a.png", mime: "image/png" });
    expect(result.model).toBe("gemini-3.5-flash-lite-001");
    expect(result.model).not.toBe(GEMINI_TEXT_MODEL);
    expect(result.alt.en).toBe("A red chair");
  });

  it("falls back to the requested model when modelVersion is missing", async () => {
    stubFetch({});
    const result = await generateAltTextFromUrl({ url: "https://blob.example/a.png", mime: "image/png" });
    expect(result.model).toBe(GEMINI_TEXT_MODEL);
  });

  it("still asks Google for the shared text model", async () => {
    const fetchMock = stubFetch({ modelVersion: "gemini-x" });
    await generateAltTextFromUrl({ url: "https://blob.example/a.png", mime: "image/png" });
    const geminiCall = fetchMock.mock.calls.find(([u]) => String(u).includes("generativelanguage"));
    expect(String(geminiCall?.[0])).toContain(`/models/${GEMINI_TEXT_MODEL}:generateContent`);
  });
});

describe("answeringModel", () => {
  it.each([
    [undefined, GEMINI_TEXT_MODEL],
    [null, GEMINI_TEXT_MODEL],
    ["", GEMINI_TEXT_MODEL],
    ["   ", GEMINI_TEXT_MODEL],
    [42, GEMINI_TEXT_MODEL],
    [{ name: "gemini-x" }, GEMINI_TEXT_MODEL],
    ["  gemini-2.5-flash-002 ", "gemini-2.5-flash-002"],
  ])("%j → %s", (input, expected) => {
    expect(answeringModel(input)).toBe(expected);
  });

  it("caps an oversized value at 100 characters", () => {
    expect(answeringModel("m".repeat(500))).toHaveLength(100);
  });

  it("does not leave a trailing space where the cap cuts", () => {
    expect(answeringModel("m".repeat(99) + "   tail")).toBe("m".repeat(99));
  });
});

describe("the media-ai cron stores the answering model", () => {
  it("writes generated.model to MediaAsset.aiModel", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      prisma: { mediaAsset: { findMany: mocks.findMany, update: mocks.update } },
    }));
    vi.doMock("@/brand.config", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/brand.config")>();
      return { ...real, brand: { ...real.brand, features: { ...real.brand.features, altTextAi: true } } };
    });
    vi.doMock("@/lib/cron/auth", () => ({ verifyCronRequest: () => null }));
    vi.doMock("@/lib/media/alt-text", () => ({ generateAltTextFromUrl: mocks.generate }));

    mocks.findMany.mockResolvedValue([
      { id: "asset-1", url: "https://blob.example/a.png", mime: "image/png", durationSec: null, aiAttempts: 0 },
    ]);
    mocks.generate.mockResolvedValue({
      alt: { da: "x", en: "y" },
      title: "t",
      caption: "c",
      geoSnippet: null,
      dominantColors: ["#000000", "#111111", "#222222"],
      suggestedFilename: "f",
      model: "gemini-3.5-flash-lite-001",
    });

    const { GET } = await import("@/app/api/cron/media-ai/route");
    const res = await GET(new Request("http://localhost/api/cron/media-ai") as never);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asset-1" },
        data: expect.objectContaining({ aiStatus: "ok", aiModel: "gemini-3.5-flash-lite-001" }),
      }),
    );
  });
});
