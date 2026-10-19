/**
 * What the engine lets each chat model do. Plain data (no `server-only`):
 * `lib/ai/client.ts` resolves a model's capabilities here to filter its tools,
 * and the `/admin/integrations` form reads the same table to show the tier a
 * model gets — and to say so when a model has no row at all.
 */

/**
 * Per-model capability matrix. Bruges af tool-filteringen til at cappe
 * admin-toolset baseret på modellens reelle function-calling kvalitet.
 *
 * Tier-meaning:
 *   "read-only"        → kun *.search/*.list/*.get + analytics + audit (10 tools)
 *   "low-risk-writes"  → ovenstående + pages.upsert, categories.upsert, discounts.toggle
 *   "all"              → alle 37 admin tools
 *
 * Unknown model fallbacks til "read-only" (sikker default).
 *
 * Tilføj nye entries her når nye modeller pulles og testes. Den her const
 * er bevidst HARDCODED frem for et separat registry — fragmentering på tværs
 * af filer er prematurely-DRY mens vi kun har et tocifret antal entries.
 */
export type ToolTier = "read-only" | "low-risk-writes" | "all";

export type ModelCapabilities = {
  tools: ToolTier;
  /** Effective context window for prompts+tools+messages */
  maxTokens: number;
  supportsToolCall: boolean;
};

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Anthropic — alle 37 admin tools, large context
  "claude-haiku-4-5": { tools: "all", maxTokens: 200_000, supportsToolCall: true },
  "claude-sonnet-4-5": { tools: "all", maxTokens: 200_000, supportsToolCall: true },
  "claude-sonnet-4-6": { tools: "all", maxTokens: 200_000, supportsToolCall: true },
  "claude-opus-4-5": { tools: "all", maxTokens: 200_000, supportsToolCall: true },
  "claude-opus-4-7": { tools: "all", maxTokens: 200_000, supportsToolCall: true },
  // Current generation (the /admin/integrations dropdown, lib/ai/anthropic-models.ts).
  // The engine sends no `thinking`, sampling or forced `tool_choice`, so these
  // run with their adaptive defaults; @ai-sdk/anthropic 4.0.58 knows both ids
  // (native structured output, no forced JSON tool).
  "claude-sonnet-5-5": { tools: "all", maxTokens: 1_000_000, supportsToolCall: true },
  "claude-opus-5-5": { tools: "all", maxTokens: 1_000_000, supportsToolCall: true },
  // Gemma 4 via Ollama — multimodal, 128K-256K context. Tiered konservativt
  // matching Gemma 3 sizing (e4b≈12b equivalent function-calling quality);
  // bump tiers efter empirisk verifikation hvis tests viser den klarer mere.
  "gemma4:e2b": { tools: "read-only", maxTokens: 128_000, supportsToolCall: true },
  "gemma4:e4b": { tools: "low-risk-writes", maxTokens: 128_000, supportsToolCall: true },
  "gemma4:e4b-mlx": { tools: "low-risk-writes", maxTokens: 128_000, supportsToolCall: true },
  "gemma4:e2b-mlx": { tools: "read-only", maxTokens: 128_000, supportsToolCall: true },
  "gemma4:26b": { tools: "all", maxTokens: 256_000, supportsToolCall: true },
  "gemma4:31b": { tools: "all", maxTokens: 256_000, supportsToolCall: true },
  // Gemma 3 via Ollama — capability tiered per size. Bevares for kunder der
  // allerede har dem pulled; Gemma 4 er det nye anbefalede default.
  "gemma3:4b": { tools: "read-only", maxTokens: 8192, supportsToolCall: true },
  "gemma3:12b": { tools: "low-risk-writes", maxTokens: 8192, supportsToolCall: true },
  "gemma3:27b": { tools: "all", maxTokens: 8192, supportsToolCall: true },
  // Llama 3.3 — stærk function calling, alle tools
  "llama3.3:70b": { tools: "all", maxTokens: 8192, supportsToolCall: true },
  // Smaller open-source — read-only baseline (safe default)
  "llama3.2:3b": { tools: "read-only", maxTokens: 8192, supportsToolCall: true },
  "qwen2.5:7b": { tools: "low-risk-writes", maxTokens: 8192, supportsToolCall: true },
};

/**
 * What a model id without a row above gets. Deliberately the most conservative
 * tier, so an untested model never gets write tools by accident.
 */
export const UNKNOWN_MODEL_CAPABILITIES: ModelCapabilities = {
  tools: "read-only",
  maxTokens: 8192,
  supportsToolCall: true,
};

/** True when `modelId` has its own row — an own key, never `toString` and co. */
export function isKnownModel(modelId: string): boolean {
  return Object.hasOwn(MODEL_CAPABILITIES, modelId);
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return isKnownModel(modelId) ? MODEL_CAPABILITIES[modelId] : UNKNOWN_MODEL_CAPABILITIES;
}

/**
 * The notice the admin sees for a model id the engine does not know. Without
 * it, such an id quietly runs with read-only tools and a small context window,
 * and nothing on screen says why the chat cannot change anything. `null` for a
 * known id, and for no id at all. The admin saves ids trimmed, so the check
 * runs on the trimmed id — the one the chat will actually resolve.
 */
export function unknownModelNotice(modelId: string): string | null {
  const id = modelId.trim();
  if (!id || isKnownModel(id)) return null;
  const windowK = Math.floor(UNKNOWN_MODEL_CAPABILITIES.maxTokens / 1024);
  return `Not a known model: tools run read-only and the context window is limited to ${windowK}k tokens.`;
}
