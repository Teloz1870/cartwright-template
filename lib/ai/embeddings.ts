import "server-only";

import { embed, embedMany } from "ai";
import type { EmbeddingModel } from "ai";
import { getGoogleGeminiApiKey } from "@/lib/ai/gemini";
import { getAiSettings } from "@/lib/ai/settings";

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

// Gemini `text-embedding-004`: 768 dims, stabil, gratis-tier-venlig. Overstyrbar
// via env hvis en kunde vil bruge `gemini-embedding-001` e.l.
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
// Ollama default embedding-model. `nomic-embed-text` (768 dims) er det mest
// udbredte lokale valg; overstyrbar via env.
const LOCAL_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

export type EmbedProvider = "google" | "local";

type Embedder = {
  /** AI-SDK embedding-model handle */
  model: EmbeddingModel;
  /** Stabilt id der lagres på hver embedding, fx "google:text-embedding-004" */
  modelId: string;
  provider: EmbedProvider;
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
    value = {
      model: google.textEmbeddingModel(GEMINI_EMBED_MODEL),
      modelId: `google:${GEMINI_EMBED_MODEL}`,
      provider: "google",
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
    const { embedding } = await embed({ model: embedder.model, value: text });
    return { vector: embedding, modelId: embedder.modelId };
  } catch (err) {
    console.error("[embeddings] embedQuery failed:", err);
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
    });
    return { vectors: embeddings, modelId: embedder.modelId };
  } catch (err) {
    console.error("[embeddings] embedTexts failed:", err);
    return null;
  }
}
