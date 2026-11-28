import "server-only";

import { embed, embedMany } from "ai";
import type { EmbeddingModel } from "ai";
import { getGoogleGeminiApiKey } from "@/lib/ai/gemini";
import { getAiSettings } from "@/lib/ai/settings";
import {
  embeddingModelRetirement,
  formatRetirementDay,
  isRetired,
} from "@/lib/ai/model-retirements";

// Provider-SDK'erne (@ai-sdk/google, @ai-sdk/openai-compatible) importeres LAZY
// inde i resolveEmbedder() — ellers trækker hele tool-registry-grafen dem ind
// ved module-load, hvilket gør registry-imports (og deres tests) unødigt tunge.

/**
 * Embedding-provider til semantisk produktsøgning (Hul A i AI-native-roadmap).
 *
 * Embeddings bruger en ANDEN provider end chat: Anthropic har ingen embedding-
 * API, så routingen er Gemini-primær (genbruger `googleGeminiApiKey`) med lokal
 * Ollama (`text-embedding`-model via OpenAI-compatible) som fallback — samme
 * filosofi som chat-routingen i `lib/ai/client.ts`.
 *
 * Vigtigt om dimensions-konsistens: vektorer fra forskellige modeller kan IKKE
 * sammenlignes. Derfor stamper vi `model`-id'et på hver lagret embedding
 * (`ProductEmbedding.model`), og søgningen sammenligner kun query-vektoren mod
 * embeddings lavet med SAMME model. Skifter admin provider, falder søgningen
 * blødt tilbage til leksikalsk indtil kataloget re-embeddes.
 *
 * Hvis hverken Gemini-key eller lokal provider er konfigureret, returnerer
 * resolver `null` → kalderne bruger ren leksikalsk søgning (ingen regression).
 */

/**
 * The Gemini embedding model a shop gets when it sets nothing. It must be a
 * model Google still serves: `text-embedding-004`, the default until v0.67,
 * was shut down on 14 Jan 2026, and every embedding call with it failed into
 * the lexical fallback without a word in the admin. tests/unit/embeddings.test.ts
 * fails if this id ever has a row in `EMBEDDING_MODEL_RETIREMENTS`.
 */
export const DEFAULT_GEMINI_EMBED_MODEL = "gemini-embedding-2";
/**
 * `gemini-embedding-2` answers with 3072 dimensions unless asked for fewer.
 * The engine asks for 768: the size the pgvector column (`vector(768)`,
 * scripts/pgvector-setup.ts) and the local Ollama default already have, and a
 * quarter of the JSON stored per product on SQLite/Turso.
 */
export const DEFAULT_GEMINI_EMBED_DIMENSIONS = 768;

/**
 * `GEMINI_EMBED_MODEL` overrides the default and runs with that model's own
 * dimensions, as before — also when it names the default model. (New: the
 * value is trimmed, a blank one counts as unset, and it is read when the
 * embedder is resolved rather than once at module load.) Only
 * a shop with no override is asked for 768, and its stored id says so
 * (`google:gemini-embedding-2@768`): vectors of different sizes cannot be
 * compared, and the id is what search and the backfill match on, so setting
 * or removing the override re-embeds the catalogue instead of leaving search
 * silently on the lexical fallback.
 */
function geminiEmbedOverride(): string | null {
  return process.env.GEMINI_EMBED_MODEL?.trim() || null;
}
// Ollama default embedding-model. `nomic-embed-text` (768 dims) er det mest
// udbredte lokale valg; overstyrbar via env.
const LOCAL_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

export type EmbedProvider = "google" | "local";

type Embedder = {
  /** AI-SDK embedding-model handle */
  model: EmbeddingModel;
  /** Stabilt id der lagres på hver embedding, fx "google:gemini-embedding-2@768" */
  modelId: string;
  provider: EmbedProvider;
  /** Sent with every embed call (the default Gemini model's dimension request). */
  providerOptions?: { google: { outputDimensionality: number } };
};

let cached: { value: Embedder | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Vælg embedding-provider ud fra hvad der er konfigureret. Gemini har forrang
 * (cloud, ingen lokal-afhængighed); lokal Ollama er fallback. Returnerer `null`
 * hvis ingen embedding-provider er tilgængelig.
 */
export async function resolveEmbedder(): Promise<Embedder | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  let value: Embedder | null = null;

  const geminiKey = await getGoogleGeminiApiKey();
  if (geminiKey) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    const override = geminiEmbedOverride();
    value = override
      ? {
          model: google.textEmbeddingModel(override),
          modelId: `google:${override}`,
          provider: "google",
        }
      : {
          model: google.textEmbeddingModel(DEFAULT_GEMINI_EMBED_MODEL),
          modelId: `google:${DEFAULT_GEMINI_EMBED_MODEL}@${DEFAULT_GEMINI_EMBED_DIMENSIONS}`,
          provider: "google",
          providerOptions: { google: { outputDimensionality: DEFAULT_GEMINI_EMBED_DIMENSIONS } },
        };
  } else {
    const settings = await getAiSettings();
    if (settings.localAiEndpoint) {
      const endpoint = settings.localAiEndpoint;
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const provider = createOpenAICompatible({
        name: "ollama",
        baseURL: endpoint.endsWith("/v1")
          ? endpoint
          : `${endpoint.replace(/\/$/, "")}/v1`,
        apiKey: "ollama-local",
      });
      value = {
        model: provider.textEmbeddingModel(LOCAL_EMBED_MODEL),
        modelId: `local:${LOCAL_EMBED_MODEL}`,
        provider: "local",
      };
    }
  }

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Invalidér resolver-cachen (kaldes når admin skifter provider/keys). */
export function invalidateEmbedderCache(): void {
  cached = null;
}

/**
 * Why an embedding call failed, for the server log. A model past its
 * provider's shutdown day gets a line that names the day and the way out
 * (only a `GEMINI_EMBED_MODEL` override can point at one); every other
 * failure is logged as it came. `now` is injectable for tests.
 */
export function describeEmbedFailure(modelId: string, now: Date = new Date()): string | null {
  // "google:models/text-embedding-004@768" → "text-embedding-004": Google's own
  // docs write ids with the `models/` resource prefix, and an override may too.
  const id = modelId.replace(/^google:/, "").replace(/^models\//, "").replace(/@\d+$/, "");
  const retirement = embeddingModelRetirement(id);
  if (!retirement || !isRetired(retirement, now)) return null;
  return (
    `${id} was shut down by Google on ${formatRetirementDay(retirement.retiresAt)}, so semantic search ` +
    `is off and product search is lexical only. Unset GEMINI_EMBED_MODEL (the default is then ` +
    `${DEFAULT_GEMINI_EMBED_MODEL} at ${DEFAULT_GEMINI_EMBED_DIMENSIONS} dimensions) and run \`pnpm embeddings:backfill\`. ` +
    `Google's named replacement is ${retirement.successor}; set as an override it answers with its own, larger ` +
    `vectors, which a vector(${DEFAULT_GEMINI_EMBED_DIMENSIONS}) pgvector column does not accept.`
  );
}

function logEmbedFailure(where: string, embedder: Embedder, err: unknown): void {
  const reason = describeEmbedFailure(embedder.modelId);
  if (reason) console.error(`[embeddings] ${where} failed: ${reason}`);
  console.error(`[embeddings] ${where} failed:`, err);
}

export type QueryEmbedding = { vector: number[]; modelId: string };

/**
 * Embed en enkelt query-streng. Returnerer `null` hvis ingen provider er
 * konfigureret eller embedding fejler — kalderen falder så tilbage til
 * leksikalsk søgning i stedet for at briste.
 */
export async function embedQuery(text: string): Promise<QueryEmbedding | null> {
  const embedder = await resolveEmbedder();
  if (!embedder) return null;
  try {
    const { embedding } = await embed({
      model: embedder.model,
      value: text,
      ...(embedder.providerOptions ? { providerOptions: embedder.providerOptions } : {}),
    });
    return { vector: embedding, modelId: embedder.modelId };
  } catch (err) {
    logEmbedFailure("embedQuery", embedder, err);
    return null;
  }
}

export type BatchEmbedding = { vectors: number[][]; modelId: string };

/**
 * Embed mange tekster i ét batch (til backfill + bulk re-embed). Returnerer
 * `null` ved manglende provider eller fejl.
 */
export async function embedTexts(texts: string[]): Promise<BatchEmbedding | null> {
  if (texts.length === 0) return { vectors: [], modelId: "" };
  const embedder = await resolveEmbedder();
  if (!embedder) return null;
  try {
    const { embeddings } = await embedMany({
      model: embedder.model,
      values: texts,
      ...(embedder.providerOptions ? { providerOptions: embedder.providerOptions } : {}),
    });
    return { vectors: embeddings, modelId: embedder.modelId };
  } catch (err) {
    logEmbedFailure("embedTexts", embedder, err);
    return null;
  }
}
