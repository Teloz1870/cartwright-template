import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DRØM143-a — the engine's default Gemini embedding model was
 * `text-embedding-004`, which Google shut down on 14 Jan 2026. Every shop with
 * a Gemini key embedded with it, every call failed, and search fell back to
 * lexical with one `console.error` nobody reads. The default is now a model
 * Google serves, asked for the 768 dimensions the rest of the engine assumes,
 * and the retirement table makes "the default is a dead model" a red test.
 */

const ai = vi.hoisted(() => ({ embed: vi.fn(), embedMany: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), ...ai }));
const gemini = vi.hoisted(() => ({ getGoogleGeminiApiKey: vi.fn() }));
vi.mock("@/lib/ai/gemini", () => gemini);
const settings = vi.hoisted(() => ({ getAiSettings: vi.fn() }));
vi.mock("@/lib/ai/settings", () => settings);
const requested = vi.hoisted(() => [] as string[]);
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({
    textEmbeddingModel: (id: string) => {
      requested.push(id);
      return { id };
    },
  }),
}));

import {
  DEFAULT_GEMINI_EMBED_DIMENSIONS,
  DEFAULT_GEMINI_EMBED_MODEL,
  describeEmbedFailure,
  embedQuery,
  embedTexts,
  invalidateEmbedderCache,
  resolveEmbedder,
} from "@/lib/ai/embeddings";
import {
  EMBEDDING_MODEL_RETIREMENTS,
  MODEL_RETIREMENTS,
  embeddingModelRetirement,
  isRetired,
} from "@/lib/ai/model-retirements";

const DEFAULT_ID = `google:${DEFAULT_GEMINI_EMBED_MODEL}@${DEFAULT_GEMINI_EMBED_DIMENSIONS}`;
const savedEnv = process.env.GEMINI_EMBED_MODEL;

beforeEach(() => {
  delete process.env.GEMINI_EMBED_MODEL;
  invalidateEmbedderCache();
  requested.length = 0;
  ai.embed.mockReset().mockResolvedValue({ embedding: [0.1, 0.2] });
  ai.embedMany.mockReset().mockResolvedValue({ embeddings: [[0.1, 0.2]] });
  gemini.getGoogleGeminiApiKey.mockReset().mockResolvedValue("test-key");
  settings.getAiSettings.mockReset().mockResolvedValue({ localAiEndpoint: null });
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.GEMINI_EMBED_MODEL;
  else process.env.GEMINI_EMBED_MODEL = savedEnv;
  invalidateEmbedderCache();
  vi.restoreAllMocks();
});

describe("the default Gemini embedding model", () => {
  it("is not a model Google has announced a shutdown for", () => {
    expect(embeddingModelRetirement(DEFAULT_GEMINI_EMBED_MODEL)).toBeNull();
    expect(Object.keys(EMBEDDING_MODEL_RETIREMENTS)).not.toContain(DEFAULT_GEMINI_EMBED_MODEL);
  });

  it("is what a shop with a Gemini key and no override embeds with", async () => {
    const embedder = await resolveEmbedder();
    expect(requested).toEqual([DEFAULT_GEMINI_EMBED_MODEL]);
    expect(embedder?.modelId).toBe(DEFAULT_ID);
    expect(DEFAULT_ID).toBe("google:gemini-embedding-2@768");
    expect(embedder?.provider).toBe("google");
  });

  it("is asked for 768 dimensions on a query and on a batch", async () => {
    expect(DEFAULT_GEMINI_EMBED_DIMENSIONS).toBe(768);
    const dims = { google: { outputDimensionality: 768 } };

    await expect(embedQuery("pour over")).resolves.toEqual({
      vector: [0.1, 0.2],
      modelId: DEFAULT_ID,
    });
    expect(ai.embed).toHaveBeenCalledTimes(1);
    expect(ai.embed.mock.calls[0][0]).toMatchObject({ value: "pour over", providerOptions: dims });

    await expect(embedTexts(["a kettle"])).resolves.toEqual({ vectors: [[0.1, 0.2]], modelId: DEFAULT_ID });
    expect(ai.embedMany).toHaveBeenCalledTimes(1);
    expect(ai.embedMany.mock.calls[0][0]).toMatchObject({ values: ["a kettle"], providerOptions: dims });
  });

  it("is also what an empty or blank override falls back to", async () => {
    for (const blank of ["", "   "]) {
      process.env.GEMINI_EMBED_MODEL = blank;
      invalidateEmbedderCache();
      expect((await resolveEmbedder())?.modelId).toBe(DEFAULT_ID);
    }
  });
});

describe("a GEMINI_EMBED_MODEL override", () => {
  it("is used as given, with the model's own dimensions", async () => {
    process.env.GEMINI_EMBED_MODEL = " gemini-embedding-001 ";
    const embedder = await resolveEmbedder();
    expect(requested).toEqual(["gemini-embedding-001"]);
    expect(embedder?.modelId).toBe("google:gemini-embedding-001");

    await embedQuery("pour over");
    await embedTexts(["a kettle"]);
    expect(ai.embed.mock.calls[0][0]).not.toHaveProperty("providerOptions");
    expect(ai.embedMany.mock.calls[0][0]).not.toHaveProperty("providerOptions");
  });

  it("that names the default model still runs with its own dimensions, under an id of its own", async () => {
    // 3072-dimension vectors and the default's 768 cannot be compared. The
    // stored id is what search and the backfill match on, so the two must
    // differ — or a shop that sets or removes the override keeps old vectors
    // that never match a query, and nothing re-embeds them.
    process.env.GEMINI_EMBED_MODEL = DEFAULT_GEMINI_EMBED_MODEL;
    const overridden = await embedQuery("pour over");
    expect(ai.embed.mock.calls[0][0]).not.toHaveProperty("providerOptions");
    expect(overridden?.modelId).toBe(`google:${DEFAULT_GEMINI_EMBED_MODEL}`);
    expect(overridden?.modelId).not.toBe(DEFAULT_ID);
  });

  it("that points at a shut-down model fails with a line that says so, and search falls back", async () => {
    process.env.GEMINI_EMBED_MODEL = "text-embedding-004";
    const providerError = new Error("models/text-embedding-004 is not found");
    ai.embed.mockRejectedValue(providerError);
    ai.embedMany.mockRejectedValue(providerError);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(embedQuery("pour over")).resolves.toBeNull();
    await expect(embedTexts(["a kettle"])).resolves.toBeNull();

    const lines = logged.mock.calls.map((call) => String(call[0]));
    expect(lines.filter((l) => l.includes("shut down by Google on 14 Jan 2026"))).toHaveLength(2);
    expect(lines.some((l) => l.includes("embedQuery") && l.includes("Unset GEMINI_EMBED_MODEL"))).toBe(true);
    // Naming the successor as an override would bring 3072-dimension vectors:
    // the line must say so rather than recommend it.
    expect(lines.some((l) => l.includes("vector(768) pgvector column does not accept"))).toBe(true);
    expect(lines.some((l) => /or set it to/.test(l))).toBe(false);
    expect(lines.some((l) => l.includes("embedTexts") && l.includes("pnpm embeddings:backfill"))).toBe(true);
    // The provider's own error is still logged, never swallowed.
    expect(logged.mock.calls.filter((call) => call[1] === providerError)).toHaveLength(2);
  });

  it("that fails on a live model logs only the provider's error", async () => {
    process.env.GEMINI_EMBED_MODEL = "some-future-model";
    ai.embed.mockRejectedValue(new Error("quota"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(embedQuery("pour over")).resolves.toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

describe("describeEmbedFailure", () => {
  it("names the day and the successor from the shutdown day on, and nothing before it", () => {
    const row = EMBEDDING_MODEL_RETIREMENTS["gemini-embedding-001"];
    const dayBefore = new Date(Date.parse(`${row.retiresAt}T00:00:00Z`) - 1);
    const onTheDay = new Date(`${row.retiresAt}T00:00:00Z`);
    expect(describeEmbedFailure("google:gemini-embedding-001", dayBefore)).toBeNull();
    expect(describeEmbedFailure("google:gemini-embedding-001", onTheDay)).toContain("14 May 2028");
    expect(describeEmbedFailure("google:gemini-embedding-001", onTheDay)).toContain(row.successor);
    // Google's `models/` resource prefix is looked through.
    expect(describeEmbedFailure("google:models/gemini-embedding-001", onTheDay)).toContain("14 May 2028");
    // An id that carries a dimension suffix is looked up by its model name.
    expect(describeEmbedFailure("google:gemini-embedding-001@768", onTheDay)).toContain("14 May 2028");
  });

  it("says nothing for the default, a local model or an unknown id", () => {
    const farFuture = new Date("2099-01-01T00:00:00Z");
    expect(describeEmbedFailure(DEFAULT_ID, farFuture)).toBeNull();
    expect(describeEmbedFailure(`google:${DEFAULT_GEMINI_EMBED_MODEL}`, farFuture)).toBeNull();
    expect(describeEmbedFailure("local:nomic-embed-text", farFuture)).toBeNull();
    expect(describeEmbedFailure("google:toString", farFuture)).toBeNull();
  });
});

describe("the embedding retirement table", () => {
  it("lists the old default as shut down, with a source and the day it was checked", () => {
    const old = embeddingModelRetirement("text-embedding-004");
    expect(old).not.toBeNull();
    expect(isRetired(old!, new Date("2026-01-14T00:00:00Z"))).toBe(true);
    for (const row of Object.values(EMBEDDING_MODEL_RETIREMENTS)) {
      expect(row.source).toMatch(/^https:\/\//);
      expect(row.retiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("never sends a shop to a successor that is itself on the list", () => {
    for (const row of Object.values(EMBEDDING_MODEL_RETIREMENTS)) {
      expect(embeddingModelRetirement(row.successor)).toBeNull();
    }
  });

  it("stays apart from the chat-model table the admin form reads", () => {
    for (const id of Object.keys(EMBEDDING_MODEL_RETIREMENTS)) {
      expect(Object.keys(MODEL_RETIREMENTS)).not.toContain(id);
    }
  });
});
