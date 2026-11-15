import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secret-encryption";
import { GEMINI_TEXT_MODEL, invalidateGeminiKeyCache } from "@/lib/ai/gemini";

/**
 * TREND40 — `POST /api/admin/vibe/translate` ("translate vibe HTML" in the
 * admin theme form) failed for every shop, twice over:
 *
 *   1. it asked for `gemini-1.5-flash`, which Google shut down on 2025-09-29;
 *   2. it read `IntegrationSettings.googleGeminiApiKey` raw — but the admin
 *      stores that key encrypted (AES-256-GCM), so Google got the ciphertext
 *      as the API key.
 *
 * The route is driven for real; only the database and the AI SDK are stubbed,
 * and the key goes through the real encryption and the shared key helper.
 */

const PLAIN_KEY = "AIzaSyTEST-not-a-real-key-0123456789ab";

const mocks = vi.hoisted(() => ({
  settings: { googleGeminiApiKey: null as string | null },
  pageUpdate: vi.fn(),
  generateText: vi.fn(),
  createGoogle: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  requireAdminApi: async () => ({ user: { id: "admin-1", role: "admin" } }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    page: {
      findUnique: async () => ({ id: "p1", slug: "home", vibeHtml: "<p>Hej</p>", translations: {} }),
      update: mocks.pageUpdate,
    },
    integrationSettings: { findUnique: async () => mocks.settings },
  },
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: mocks.createGoogle }));

import { POST } from "@/app/api/admin/vibe/translate/route";

function translate(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/admin/vibe/translate", {
      method: "POST",
      body: JSON.stringify({ targetId: "home", targetLocales: ["en"] }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateGeminiKeyCache();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_GEMINI_API_KEY", "");
  mocks.settings.googleGeminiApiKey = encryptSecret(PLAIN_KEY);
  mocks.createGoogle.mockImplementation(({ apiKey }: { apiKey: string }) => (modelId: string) => ({ modelId, apiKey }));
  mocks.generateText.mockResolvedValue({ text: "<p>Hi</p>" });
});

describe("POST /api/admin/vibe/translate", () => {
  it("asks Gemini for the shared 2.5 text model, not the shut-down 1.5 one", async () => {
    const res = await translate();
    expect(res.status).toBe(200);
    const { model } = mocks.generateText.mock.calls[0][0];
    expect(model.modelId).toBe(GEMINI_TEXT_MODEL);
    expect(model.modelId).not.toMatch(/gemini-1\./);
    expect(mocks.pageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { translations: { en: { vibeHtml: "<p>Hi</p>" } } } }),
    );
  });

  it("sends Google the decrypted key, never the stored ciphertext", async () => {
    await translate();
    expect(mocks.createGoogle).toHaveBeenCalledWith({ apiKey: PLAIN_KEY });
    expect(mocks.createGoogle).not.toHaveBeenCalledWith({ apiKey: mocks.settings.googleGeminiApiKey });
  });

  it("falls back to GOOGLE_GEMINI_API_KEY when no key is stored", async () => {
    mocks.settings.googleGeminiApiKey = null;
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "AIzaFromEnv");
    await translate();
    expect(mocks.createGoogle).toHaveBeenCalledWith({ apiKey: "AIzaFromEnv" });
  });

  it("answers 400 without calling Gemini when no key exists anywhere", async () => {
    mocks.settings.googleGeminiApiKey = null;
    const res = await translate();
    expect(res.status).toBe(400);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
