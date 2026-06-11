import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";
import { getAiSettings, type AiSettings } from "@/lib/ai/settings";

/**
 * AI-client for storefront- og admin-chat.
 *
 * Provider-routing landed med Local-AI planen: `chatModel(intent)` returnerer
 * den rette model baseret på `IntegrationSettings.aiProvider` + intent:
 *
 *   - intent="vibe"      → ALTID Anthropic. Theme/SEO-generators bruger
 *                          generateObject med Zod-schema; invalid JSON breaker
 *                          brand-setup. Local-modeller er ikke pålidelige nok
 *                          til structured output på dette stake-niveau.
 *   - intent="chat"      → Respekterer aiProvider. Default Anthropic Haiku 4.5;
 *                          local kører via @ai-sdk/openai-compatible mod Ollama.
 *   - intent="generation"→ Samme regler som "chat". Bruges hvis vi senere får
 *                          long-form generation der ikke kan toleres failure-loop.
 *
 * Default model er Haiku 4.5 — billig + hurtig, perfekt til tool-orchestration
 * og produkt-anbefaling. Local-default er gemma4:e4b (9.6GB, 128K context,
 * multimodal — sweet-spot tools+kvalitet på en 16GB+ Mac).
 */
export const CHAT_MODEL = "claude-haiku-4-5";

export type ChatIntent = "chat" | "generation" | "vibe";

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

const UNKNOWN_MODEL_CAPABILITIES: ModelCapabilities = {
  tools: "read-only",
  maxTokens: 8192,
  supportsToolCall: true,
};

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return MODEL_CAPABILITIES[modelId] ?? UNKNOWN_MODEL_CAPABILITIES;
}

// Legacy Anthropic-only cache — bevares for bagudkompatibilitet med kode der
// stadig kalder getAnthropicApiKey() direkte (audit-helpers etc.). Ny kode
// bør bruge getAiSettings().
let cachedKey: { value: string | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Hent Anthropic API-key. DB-singleton (IntegrationSettings.id=1) har
 * forrang; falder tilbage til process.env hvis admin ikke har sat én
 * i /admin/integrations.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedKey && cachedKey.expiresAt > now) {
    return cachedKey.value;
  }

  let dbKey: string | null = null;
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { anthropicApiKey: true },
    });
    // Decrypt — feltet er krypteret med AES-256-GCM siden review fund #9.
    // decryptSecret håndterer legacy plaintext-keys (sk-ant-prefix) for
    // bagudkompatibilitet indtil admin gemmer en ny.
    dbKey = row?.anthropicApiKey ? decryptSecret(row.anthropicApiKey) : null;
  } catch {
    // DB ikke tilgængelig — falder tilbage til env
  }

  const key = dbKey ?? process.env.ANTHROPIC_API_KEY ?? null;
  cachedKey = { value: key, expiresAt: now + CACHE_TTL_MS };
  return key;
}

/**
 * Invalidér cachen øjeblikkeligt. Kaldes fra /admin/integrations/actions.ts
 * når admin opdaterer key'en, så ændringen slår igennem instant.
 */
export function invalidateApiKeyCache() {
  cachedKey = null;
}

/**
 * Bygget model-handle + metadata for audit-logging og tool-filtering.
 * Routes bruger `.handle` til streamText, og `.provider`/`.model` til at
 * stamps audit-rows.
 */
export type ChatModelResolution = {
  handle: Awaited<ReturnType<typeof buildAnthropicModel>>;
  provider: "anthropic" | "local";
  model: string;
  capabilities: ModelCapabilities;
};

/**
 * Returnerer en konfigureret model-handle. Async fordi vi kan have brug for
 * at læse settings fra DB.
 *
 * BACKWARD COMPAT: gamle callers der kalder `chatModel()` uden argument får
 * intent="chat" og returnerer kun handle'n (ikke metadata-objektet). Nye
 * callers bør bruge `chatModelResolved(intent)` for at få provider+model
 * til audit-stamping.
 */
export async function chatModel(intent: ChatIntent = "chat") {
  const resolved = await chatModelResolved(intent);
  return resolved.handle;
}

/**
 * Som chatModel() men returnerer fuld resolution med provider/model/capabilities.
 * Brug denne fra routes der skal stamps audit-rows og filtrere tools.
 */
export async function chatModelResolved(
  intent: ChatIntent = "chat",
): Promise<ChatModelResolution> {
  const settings = await getAiSettings();

  // vibe = ALWAYS Anthropic. generateObject structured-output reliability is too
  // high-stakes for local models in v1 — even if the admin selected "local",
  // design/section generation (Magic Builder, v0) needs Anthropic. resolveAnthropic
  // throws a clear, actionable "configure an Anthropic key" error when none is set.
  // When Gemma 4+ structured output is reliable this is one if-condition to remove
  // (see docs/ai/extending.mdx).
  if (intent === "vibe") {
    return resolveAnthropic(settings);
  }

  // chat | generation: følg aiProvider
  if (settings.provider === "local") {
    return resolveLocal(settings);
  }

  if (settings.provider === "auto") {
    // V1: auto preferer local hvis konfigureret, ellers anthropic.
    // Request-time on-error fallback er Fase 2-arbejde (kræver wrapper omkring
    // streamText error-handler). For nu: hvis local er konfigureret, brug den —
    // hvis call fejler, ser admin fejlen og kan manuelt skifte til "anthropic".
    if (settings.localConfigured) {
      return resolveLocal(settings);
    }
    return resolveAnthropic(settings);
  }

  // Default / "anthropic"
  return resolveAnthropic(settings);
}

async function resolveAnthropic(
  settings: AiSettings,
): Promise<ChatModelResolution> {
  const handle = await buildAnthropicModel(settings);
  return {
    handle,
    provider: "anthropic",
    model: settings.anthropicModel,
    capabilities: getModelCapabilities(settings.anthropicModel),
  };
}

async function resolveLocal(settings: AiSettings): Promise<ChatModelResolution> {
  if (!settings.localAiEndpoint || !settings.localAiModel) {
    throw new Error(
      "Lokal AI er ikke konfigureret — sæt localAiEndpoint + localAiModel i /admin/integrations",
    );
  }
  const handle = buildLocalModel(settings);
  return {
    handle,
    provider: "local",
    model: settings.localAiModel,
    capabilities: getModelCapabilities(settings.localAiModel),
  };
}

async function buildAnthropicModel(settings: AiSettings) {
  const apiKey = settings.anthropicApiKey ?? (await getAnthropicApiKey());
  if (!apiKey) {
    throw new Error(
      "AI generation needs an Anthropic API key — set one in /admin/integrations " +
        "or via ANTHROPIC_API_KEY in .env. (Design/section generation requires " +
        "Anthropic for reliable structured output, even if the Local provider is selected.)",
    );
  }
  // Cloudflare AI Gateway integration (Prompt Hardening) — bevares fra v1.
  const gatewayUrl = process.env.CLOUDFLARE_AI_GATEWAY_URL;
  const provider = createAnthropic({
    apiKey,
    ...(gatewayUrl && { baseURL: gatewayUrl }),
  });
  return provider(settings.anthropicModel);
}

function buildLocalModel(settings: AiSettings) {
  const endpoint = settings.localAiEndpoint!;
  const modelId = settings.localAiModel!;
  // Ollama exposerer OpenAI-compatible API på <endpoint>. apiKey er ignored
  // men SDK kræver non-empty streng.
  const provider = createOpenAICompatible({
    name: "ollama",
    baseURL: endpoint.endsWith("/v1") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1`,
    apiKey: "ollama-local",
  });
  return provider(modelId);
}

/**
 * Tool-filtering baseret på modellens capability-tier.
 * Bruges af /api/admin/chat til at cappe tool-listen for små modeller der
 * ikke pålideligt håndterer 37 tools eller skrive-operationer.
 */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "products.search",
  "products.get",
  "categories.list",
  "pages.list",
  "orders.list",
  "orders.get",
  "discounts.list",
  "analytics.summary",
  "audit.list",
  "settings.get",
]);

const LOW_RISK_WRITE_TOOLS: ReadonlySet<string> = new Set([
  ...READ_ONLY_TOOLS,
  "categories.upsert",
  "pages.upsert",
  "discounts.toggle",
  "images.search_unsplash",
  "products.attach_image",
  "docs.import",
]);

export function filterToolsForCapability<T extends string>(
  toolNames: readonly T[],
  capabilities: ModelCapabilities,
): T[] {
  if (capabilities.tools === "all") {
    return [...toolNames];
  }
  const allowed =
    capabilities.tools === "low-risk-writes" ? LOW_RISK_WRITE_TOOLS : READ_ONLY_TOOLS;
  return toolNames.filter((name) => allowed.has(name));
}

/**
 * System-prompt der hærder modellen mod jailbreak-forsøg og holder fokus
 * på handelsrolle. Opdaterer denne string er den vigtigste sikkerhedslever
 * — én linje her overgår alle scope-grænser i tilfælde af tool-misbrug.
 *
 * ULTRAPLAN-lite UL2: re-export fra dynamic prompt-loader (lib/ai/prompts/index.ts)
 * i stedet for hardcoded solbrillen-path. Loaderen vælger modul baseret på
 * brand.ai.promptModule. Ved fork: tilføj nyt modul i prompts/index.ts.
 */
export { SYSTEM_PROMPT } from "@/lib/ai/prompts";

/**
 * Storefront-chatten har KUN adgang til disse tools. Hvis registry'et får et
 * nyt tool der må eksponeres til kunder, skal det også tilføjes her.
 *
 * Vigtig sikkerhedsbarriere: customer-chat-konteksten kan aldrig kalde
 * tools uden for denne liste, selv om scope-systemet ellers ville tillade
 * det (fx hvis et tool delte catalog:read scope).
 */
export const CUSTOMER_TOOL_ALLOWLIST = [
  "products.search",
  "products.get",
  "cart.add",
  "cart.update_quantity",
  "cart.remove",
  "cart.get_summary",
  "discounts.try_apply",
  "address.autocomplete",
  "customer.lookup_by_email",
  "customer.lookup_by_phone",
  "orders.create",
  "user.get_last_shipping",
  "ui.present_products",
] as const;

export type CustomerToolName = (typeof CUSTOMER_TOOL_ALLOWLIST)[number];

export function isCustomerTool(name: string): name is CustomerToolName {
  return (CUSTOMER_TOOL_ALLOWLIST as readonly string[]).includes(name);
}

/**
 * Customer-side write-tools that require a plan-first confirmation UI before
 * the side effect is executed.
 */
export const CUSTOMER_CONFIRM_REQUIRED: ReadonlySet<string> = new Set([
  "orders.create",
]);

/**
 * Hård loft på antal tool-kald per session. Beskytter mod prompt-injection
 * der får modellen til at loopa, og holder LLM-omkostninger forudsigelige.
 */
export const MAX_TOOL_CALLS_PER_SESSION = 20;

/**
 * Højere loft for admin-chat — workflows som "opdater lager på 8 produkter"
 * skal kunne gennemføres i ét turn-set uden at ramme grænsen.
 */
export const ADMIN_MAX_TOOL_CALLS_PER_SESSION = 50;

/**
 * Tools admin-chatten (/admin/ai) kan kalde. Inkluderer både læse- og
 * skrive-tools fra alle admin-domæner. Eksplicit eksklusiv: cart.* (kunde-
 * domæne) og discounts.try_apply (kunde-only preview).
 *
 * **Hold synkroniseret med ADMIN_CHAT_SCOPES i lib/scopes.ts**: hvert tool
 * her skal have et scope der findes i den scope-liste, ellers returnerer
 * invokeTool 403 selv om allowlisten siger ja.
 */
export const ADMIN_TOOL_ALLOWLIST = [
  // Read-tools — kalder direkte
  "products.search",
  "products.get",
  "categories.list",
  "pages.list",
  "orders.list",
  "orders.get",
  "discounts.list",
  "analytics.summary",
  "audit.list",
  "settings.get",
  // Write-tools — kræver plan-først-confirmation (CONFIRM_REQUIRED)
  "products.create",
  "products.update",
  "products.delete",
  "categories.upsert",
  "categories.delete",
  "pages.upsert",
  "pages.delete",
  "discounts.create",
  "discounts.toggle",
  "orders.update_status",
  "settings.update_shipping",
  "settings.update_branding",
  "settings.update_copy",
  "marketing.create_campaign",
  "docs.import",
  "audit.revert",
  // Billed-håndtering — IKKE i CONFIRM_REQUIRED da search er read-only og
  // attach_image er additivt (ikke destructive).
  "images.search_unsplash",
  "products.attach_image",
  // Agentic build — compose a look (Skin × Voice) + the prompt-driven page
  // builder. Read-only planners need no confirm; the writes are confirm-gated
  // below. Shopper chat NEVER gets these (composing a site is an owner task).
  "magic.plan_page",
  "magic.generate_page",
  "vertical.apply",
  "design.set_slug",
  "magic.compose_look",
  "chrome.set",
  "pages.set_layout",
  // Composition artifact (Mixer 2.0 Phase 2) — export is read-only; apply is
  // confirm-gated below.
  "composition.export",
  "composition.apply",
  // Mockup-first — publish/clear a raw-HTML homepage mockup (vibe takeover).
  // Owner-only build capability; both writes are confirm-gated below.
  "mockup.set",
  "mockup.clear",
] as const;

export type AdminToolName = (typeof ADMIN_TOOL_ALLOWLIST)[number];

export function isAdminTool(name: string): name is AdminToolName {
  return (ADMIN_TOOL_ALLOWLIST as readonly string[]).includes(name);
}

/**
 * Tools der KRÆVER plan-først-confirmation før de eksekveres. AI'ens første
 * kald returnerer { requiresConfirmation: true } uden side-effects; admin
 * klikker bekræft → nyt request med confirm:true → server udfører.
 *
 * **Vigtigt:** AI'en kan ikke selv "tilføje confirm:true" og dermed bypasse
 * — confirmation håndhæves som server+client handshake, ikke som arg-flag.
 */
export const CONFIRM_REQUIRED: ReadonlySet<AdminToolName> = new Set([
  "products.create",
  "products.update",
  "products.delete",
  "categories.upsert",
  "categories.delete",
  "pages.upsert",
  "pages.delete",
  "discounts.create",
  "discounts.toggle",
  "orders.update_status",
  "settings.update_shipping",
  "settings.update_branding",
  "settings.update_copy",
  "marketing.create_campaign",
  "docs.import",
  "audit.revert",
  // Agentic build — every write here is confirm-gated + audited + revertible.
  "vertical.apply",
  "design.set_slug",
  "magic.compose_look",
  "chrome.set",
  "pages.set_layout",
  "composition.apply",
  // Mockup-first — both writes take over / restore the live homepage.
  "mockup.set",
  "mockup.clear",
]);

/** Sæt af tool-navne der KUN må kaldes som læseoperationer fra customer-chat;
 *  admin må heller ikke kalde dem (de tager cookie-bunden cart-session). */
export const CUSTOMER_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "cart.add",
  "cart.update_quantity",
  "cart.remove",
  "cart.get_summary",
  "discounts.try_apply",
]);
