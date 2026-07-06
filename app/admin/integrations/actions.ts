"use server";

import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  invalidateApiKeyCache,
  chatModelResolved,
  getModelCapabilities,
  type ChatIntent,
} from "@/lib/ai/client";
import {
  getAiSettings,
  invalidateAiSettingsCache,
  type AiProvider,
  type LocalAiFallbackMode,
} from "@/lib/ai/settings";
import {
  getVoiceShopSettings,
  invalidateVoiceShopCache,
  readDailyUsage,
} from "@/lib/voice/settings";
import { CUSTOMER_TOOL_ALLOWLIST } from "@/lib/ai/client";
import {
  getGoogleGeminiApiKey,
  invalidateGeminiKeyCache,
} from "@/lib/ai/gemini";
import { getV0ApiKey, invalidateV0KeyCache } from "@/lib/v0/client";
import {
  getGoogleConnectionStatus,
  invalidateGoogleOAuthCredentialsCache,
  revokeGoogleConnection,
} from "@/lib/google/oauth";
import { invalidateStripeKeysCache } from "@/lib/stripe";
import { invalidateResendKeyCache } from "@/lib/mailer/resend";
import { encryptSecret, decryptSecret } from "@/lib/secret-encryption";
import { invalidateSetupStatusCache, parseChecklist } from "@/lib/setup-status";

/**
 * Hent settings + masked key. Plaintext-keyen returneres ALDRIG til
 * frontend — kun en preview ("sk-ant-...xx") så admin kan genkende
 * hvilken der er sat uden at exposere den fulde værdi i DOM.
 */
export async function getIntegrationStatus() {
  await requireAdmin();

  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { anthropicApiKey: true, googleGeminiApiKey: true, videoGenerationApiKey: true, videoGenProvider: true, v0ApiKey: true, v0PrivacyTier: true, updatedAt: true },
  });

  // Decrypt for at kunne lave masked preview (review fund #9 — feltet er
  // krypteret i DB; vi viser stadig prefix/suffix til admin's visuelle match)
  const decrypted = row?.anthropicApiKey
    ? decryptSecret(row.anthropicApiKey)
    : null;
  const geminiDecrypted = row?.googleGeminiApiKey
    ? decryptSecret(row.googleGeminiApiKey)
    : null;
  const effectiveGeminiKey = await getGoogleGeminiApiKey();

  const videoGenKey = row?.videoGenerationApiKey
    ? decryptSecret(row.videoGenerationApiKey)
    : null;

  const v0Decrypted = row?.v0ApiKey ? decryptSecret(row.v0ApiKey) : null;
  const effectiveV0Key = await getV0ApiKey();

  return {
    anthropic: {
      isSet: !!decrypted,
      preview: decrypted ? maskKey(decrypted) : null,
      updatedAt: row?.updatedAt ?? null,
      envFallback: !decrypted && !!process.env.ANTHROPIC_API_KEY,
    },
    gemini: {
      isSet: !!geminiDecrypted,
      preview: geminiDecrypted ? maskGeminiKey(geminiDecrypted) : null,
      updatedAt: row?.updatedAt ?? null,
      envFallback: !geminiDecrypted && !!effectiveGeminiKey,
    },
    video: {
      isSet: !!videoGenKey,
      preview: videoGenKey ? maskGenericKey(videoGenKey) : null,
      provider: row?.videoGenProvider || "luma",
    },
    v0: {
      isSet: !!v0Decrypted,
      preview: v0Decrypted ? maskGenericKey(v0Decrypted) : null,
      updatedAt: row?.updatedAt ?? null,
      envFallback: !v0Decrypted && !!effectiveV0Key,
      privacyTier: row?.v0PrivacyTier ?? "opt-out",
    },
  };
}

export async function setAnthropicKeyAction(
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();

  const raw = String(formData.get("apiKey") ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Empty key - enter a valid key or use the 'Remove key' button" };
  }
  if (!raw.startsWith("sk-ant-")) {
    return {
      ok: false,
      error:
        "This does not look like an Anthropic key (must start with 'sk-ant-'). Check that you copied the full value.",
    };
  }
  if (raw.length < 40) {
    return { ok: false, error: "Key is too short - did you copy the whole thing?" };
  }

  // Krypter før storage (AES-256-GCM med KEK fra AUTH_SECRET).
  // DB-leak alene giver ikke funktionel key — angriber skal også have
  // serverens AUTH_SECRET (review fund #9).
  const encrypted = encryptSecret(raw);

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, anthropicApiKey: encrypted },
    update: { anthropicApiKey: encrypted },
  });

  invalidateApiKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");

  return { ok: true, preview: maskKey(raw) };
}

export async function clearAnthropicKeyAction(): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, anthropicApiKey: null },
    update: { anthropicApiKey: null },
  });

  invalidateApiKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
}

export async function setGeminiKeyAction(
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();

  const raw = String(formData.get("apiKey") ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      error: "Empty key - enter a valid key or use the 'Remove key' button",
    };
  }
  if (!raw.startsWith("AIza")) {
    return {
      ok: false,
      error:
        "This does not look like a Google Gemini API key (must start with 'AIza'). Check that you copied the full value.",
    };
  }
  // Google AIza-keys er typisk 39 tegn men kontrakt-garanteret kun >= 35.
  // Vi accepterer 35-45 for at undgå at afvise legitime keys hvis Google
  // udvider formatet.
  if (raw.length < 35 || raw.length > 45) {
    return {
      ok: false,
      error: "The key does not appear to have the right format - check that you copied the full value.",
    };
  }

  const encrypted = encryptSecret(raw);

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, googleGeminiApiKey: encrypted },
    update: { googleGeminiApiKey: encrypted },
  });

  invalidateGeminiKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");

  return { ok: true, preview: maskGeminiKey(raw) };
}

export async function clearGeminiKeyAction(): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, googleGeminiApiKey: null },
    update: { googleGeminiApiKey: null },
  });

  invalidateGeminiKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
}

export async function setV0KeyAction(
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();

  const raw = String(formData.get("apiKey") ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      error: "Empty key - enter a valid v0 key or use the 'Remove key' button",
    };
  }
  // v0 Platform API keys are opaque tokens from v0.dev/chat/settings/keys. We
  // don't hard-pin a prefix (the format is beta + may evolve) — just guard
  // against obvious paste mistakes via a loose length floor.
  if (raw.length < 16) {
    return {
      ok: false,
      error: "That does not look like a v0 API key - check you copied the full value from v0.dev.",
    };
  }

  const encrypted = encryptSecret(raw);

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, v0ApiKey: encrypted },
    update: { v0ApiKey: encrypted },
  });

  invalidateV0KeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");

  return { ok: true, preview: maskGenericKey(raw) };
}

export async function clearV0KeyAction(): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, v0ApiKey: null },
    update: { v0ApiKey: null },
  });

  invalidateV0KeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
}

/**
 * Record the v0 privacy posture the operator accepted. v0's data policy is
 * opt-out by default; production/GDPR use should pick "never" (zero-retention)
 * and execute a DPA with Vercel. Stored for the processor caveat in the UI.
 */
export async function setV0PrivacyTierAction(
  tier: "opt-out" | "opt-in" | "never",
): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, v0PrivacyTier: tier },
    update: { v0PrivacyTier: tier },
  });

  revalidatePath("/admin/integrations");
}

export async function setVideoGenKeyAction(
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();

  const raw = String(formData.get("apiKey") ?? "").trim();
  const provider = String(formData.get("provider") ?? "luma").trim();

  if (!raw) {
    return { ok: false, error: "Empty key - enter a valid key" };
  }

  const encrypted = encryptSecret(raw);

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, videoGenerationApiKey: encrypted, videoGenProvider: provider },
    update: { videoGenerationApiKey: encrypted, videoGenProvider: provider },
  });

  revalidatePath("/admin/integrations");
  return { ok: true, preview: maskGenericKey(raw) };
}

export async function clearVideoGenKeyAction(): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, videoGenerationApiKey: null },
    update: { videoGenerationApiKey: null },
  });

  revalidatePath("/admin/integrations");
}

// ── Stripe keys (Phase 2-prep — ubrugte i runtime indtil Phase 3) ──

type StripeKeyKind = "secret" | "publishable" | "webhook";

const STRIPE_KEY_CONFIG: Record<
  StripeKeyKind,
  {
    prefix: string;
    minLen: number;
    maxLen: number;
    dbField: "stripeSecretKey" | "stripePublishableKey" | "stripeWebhookSecret";
    label: string;
  }
> = {
  secret: {
    prefix: "sk_",
    minLen: 30,
    maxLen: 150,
    dbField: "stripeSecretKey",
    label: "Stripe Secret Key (sk_test_... or sk_live_...)",
  },
  publishable: {
    prefix: "pk_",
    minLen: 30,
    maxLen: 150,
    dbField: "stripePublishableKey",
    label: "Stripe Publishable Key (pk_test_... or pk_live_...)",
  },
  webhook: {
    prefix: "whsec_",
    minLen: 30,
    maxLen: 150,
    dbField: "stripeWebhookSecret",
    label: "Stripe Webhook Secret (whsec_...)",
  },
};

export async function setStripeKeyAction(
  kind: StripeKeyKind,
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();
  const cfg = STRIPE_KEY_CONFIG[kind];

  const raw = String(formData.get("apiKey") ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Empty key - enter a valid value" };
  }
  if (!raw.startsWith(cfg.prefix)) {
    return {
      ok: false,
      error: `Wrong format - must start with '${cfg.prefix}'`,
    };
  }
  if (raw.length < cfg.minLen || raw.length > cfg.maxLen) {
    return {
      ok: false,
      error: `The key does not appear to have the right format (${cfg.minLen}-${cfg.maxLen} characters).`,
    };
  }

  const encrypted = encryptSecret(raw);
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, [cfg.dbField]: encrypted },
    update: { [cfg.dbField]: encrypted },
  });

  invalidateStripeKeysCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
  return { ok: true, preview: maskGenericKey(raw) };
}

export async function clearStripeKeyAction(kind: StripeKeyKind): Promise<void> {
  await requireAdmin();
  const cfg = STRIPE_KEY_CONFIG[kind];
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, [cfg.dbField]: null },
    update: { [cfg.dbField]: null },
  });
  invalidateStripeKeysCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
}

// ── Google Workspace OAuth2 (Sheets/Drive/Docs connector) ────────────────

export async function setGoogleOAuthAction(
  formData: FormData,
): Promise<
  | { ok: true; clientIdPreview: string; clientSecretPreview: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Client ID and client secret must both be filled in.",
    };
  }
  if (!clientId.includes(".apps.googleusercontent.com")) {
    return {
      ok: false,
      error: "Client ID does not look like a Google OAuth client ID.",
    };
  }
  if (clientSecret.length < 10) {
    return {
      ok: false,
      error: "Client secret is too short - check that you copied the full value.",
    };
  }

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      googleOAuthClientId: encryptSecret(clientId),
      googleOAuthClientSecret: encryptSecret(clientSecret),
    },
    update: {
      googleOAuthClientId: encryptSecret(clientId),
      googleOAuthClientSecret: encryptSecret(clientSecret),
    },
  });

  invalidateGoogleOAuthCredentialsCache();
  revalidatePath("/admin/integrations");
  return {
    ok: true,
    clientIdPreview: maskGenericKey(clientId),
    clientSecretPreview: maskGenericKey(clientSecret),
  };
}

export async function clearGoogleOAuthAction(): Promise<void> {
  await requireAdmin();

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      googleOAuthClientId: null,
      googleOAuthClientSecret: null,
    },
    update: {
      googleOAuthClientId: null,
      googleOAuthClientSecret: null,
    },
  });

  invalidateGoogleOAuthCredentialsCache();
  revalidatePath("/admin/integrations");
}

export async function disconnectGoogleOAuthAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const result = await revokeGoogleConnection();
  revalidatePath("/admin/integrations");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function getGoogleOAuthStatus() {
  await requireAdmin();
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: {
      googleOAuthClientId: true,
      googleOAuthClientSecret: true,
    },
  });
  const clientId = row?.googleOAuthClientId
    ? decryptSecret(row.googleOAuthClientId)
    : null;
  const clientSecret = row?.googleOAuthClientSecret
    ? decryptSecret(row.googleOAuthClientSecret)
    : null;
  const connection = await getGoogleConnectionStatus();

  return {
    clientId: {
      isSet: !!clientId,
      preview: clientId ? maskGenericKey(clientId) : null,
      envFallback: !clientId && !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    },
    clientSecret: {
      isSet: !!clientSecret,
      preview: clientSecret ? maskGenericKey(clientSecret) : null,
      envFallback: !clientSecret && !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    },
    allReady:
      !!(clientId && clientSecret) ||
      !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    connection: {
      ...connection,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
    },
  };
}

// ── Resend (email-service) ──────────────────────────────────────────────

export async function setResendKeyAction(
  formData: FormData,
): Promise<{ ok: true; preview: string } | { ok: false; error: string }> {
  await requireAdmin();
  const raw = String(formData.get("apiKey") ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Empty key - enter a valid value" };
  }
  if (!raw.startsWith("re_")) {
    return {
      ok: false,
      error: "Forkert format — Resend keys starter med 're_'",
    };
  }
  if (raw.length < 20 || raw.length > 200) {
    return {
      ok: false,
      error: "The key does not appear to have the right format (20-200 characters).",
    };
  }

  const encrypted = encryptSecret(raw);
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, resendApiKey: encrypted },
    update: { resendApiKey: encrypted },
  });
  invalidateResendKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
  return { ok: true, preview: maskGenericKey(raw) };
}

export async function clearResendKeyAction(): Promise<void> {
  await requireAdmin();
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, resendApiKey: null },
    update: { resendApiKey: null },
  });
  invalidateResendKeyCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
}

export async function toggleManualChecklistItemAction(
  id: string,
  done: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const normalized = id.trim();
  if (!normalized || normalized.length > 80) {
    return { ok: false, error: "Ugyldigt checklist-id" };
  }

  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { setupChecklist: true },
  });
  const items = parseChecklist(row?.setupChecklist);

  if (done) {
    items.add(normalized);
  } else {
    items.delete(normalized);
  }

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      setupChecklist: JSON.stringify([...items].sort()),
    },
    update: {
      setupChecklist: JSON.stringify([...items].sort()),
    },
  });

  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function getResendStatus() {
  await requireAdmin();
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { resendApiKey: true },
  });
  const key = row?.resendApiKey ? decryptSecret(row.resendApiKey) : null;
  return {
    isSet: !!key,
    preview: key ? maskGenericKey(key) : null,
  };
}

export async function getStripeStatus() {
  await requireAdmin();
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: {
      stripeSecretKey: true,
      stripePublishableKey: true,
      stripeWebhookSecret: true,
    },
  });
  const decode = (v: string | null | undefined) => (v ? decryptSecret(v) : null);
  const secret = decode(row?.stripeSecretKey);
  const publishable = decode(row?.stripePublishableKey);
  const webhook = decode(row?.stripeWebhookSecret);
  return {
    secret: {
      isSet: !!secret,
      preview: secret ? maskGenericKey(secret) : null,
    },
    publishable: {
      isSet: !!publishable,
      preview: publishable ? maskGenericKey(publishable) : null,
    },
    webhook: {
      isSet: !!webhook,
      preview: webhook ? maskGenericKey(webhook) : null,
    },
    allReady: !!(secret && publishable && webhook),
  };
}

// ── AI provider (Local-AI plan) ────────────────────────────────────────────

const VALID_PROVIDERS = ["anthropic", "local", "auto"] as const;
const VALID_FALLBACK_MODES = ["off", "on-error", "after-3-failures"] as const;

function isValidProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (VALID_PROVIDERS as readonly string[]).includes(v);
}

function isValidFallbackMode(v: unknown): v is LocalAiFallbackMode {
  return (
    typeof v === "string" && (VALID_FALLBACK_MODES as readonly string[]).includes(v)
  );
}

/**
 * Hent nuværende AI-settings til UI-rendering. Returnerer en serialiserbar
 * shape uden secrets (apiKey vises kun som boolean configured-flag).
 */
export async function getAiSettingsForUi() {
  await requireAdmin();
  const s = await getAiSettings();
  return {
    provider: s.provider,
    anthropicModel: s.anthropicModel,
    localAiEndpoint: s.localAiEndpoint,
    localAiModel: s.localAiModel,
    localAiFallbackMode: s.localAiFallbackMode,
    anthropicConfigured: s.anthropicConfigured,
    localConfigured: s.localConfigured,
    lastDegradedAt: s.lastDegradedAt?.toISOString() ?? null,
  };
}

/**
 * Gem ny AI provider config. Validerer alle felter; tomme strenge bliver til
 * NULL i DB så getAiSettings() falder tilbage til env/defaults.
 */
export async function setAiSettingsAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const provider = String(formData.get("provider") ?? "").trim();
  const anthropicModel = String(formData.get("anthropicModel") ?? "").trim();
  const localAiEndpoint = String(formData.get("localAiEndpoint") ?? "").trim();
  const localAiModel = String(formData.get("localAiModel") ?? "").trim();
  const localAiFallbackMode = String(
    formData.get("localAiFallbackMode") ?? "",
  ).trim();

  if (!isValidProvider(provider)) {
    return { ok: false, error: "Invalid provider (must be anthropic/local/auto)" };
  }
  if (anthropicModel && (anthropicModel.length > 80 || !/^[a-z0-9._-]+$/i.test(anthropicModel))) {
    return { ok: false, error: "Ugyldigt Anthropic model-id" };
  }
  if (localAiEndpoint) {
    try {
      const url = new URL(localAiEndpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: "Endpoint must be http:// or https://" };
      }
    } catch {
      return { ok: false, error: "Ugyldig endpoint-URL" };
    }
  }
  if (localAiModel && (localAiModel.length > 80 || !/^[a-z0-9._:-]+$/i.test(localAiModel))) {
    return { ok: false, error: "Ugyldigt local model-id (kun a-z, 0-9, . _ - :)" };
  }
  if (localAiFallbackMode && !isValidFallbackMode(localAiFallbackMode)) {
    return { ok: false, error: "Ugyldig fallback-mode" };
  }
  if (provider === "local" && (!localAiEndpoint || !localAiModel)) {
    return {
      ok: false,
      error:
        "Provider=local requires both an endpoint and a model. Configure them first or choose auto/anthropic.",
    };
  }

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    update: {
      aiProvider: provider,
      anthropicModel: anthropicModel || null,
      localAiEndpoint: localAiEndpoint || null,
      localAiModel: localAiModel || null,
      localAiFallbackMode: localAiFallbackMode || null,
    },
    create: {
      id: 1,
      aiProvider: provider,
      anthropicModel: anthropicModel || null,
      localAiEndpoint: localAiEndpoint || null,
      localAiModel: localAiModel || null,
      localAiFallbackMode: localAiFallbackMode || null,
    },
  });

  invalidateAiSettingsCache();
  invalidateSetupStatusCache();
  revalidatePath("/admin/integrations");
  return { ok: true };
}

/**
 * Liste modeller tilgængelige på Ollama-endpointet. Tester samtidig at
 * endpointet er online. Returnerer model-navne + capability-tier så UI'et
 * kan vise hvilke modeller der har hvilken tool-cap (read-only/low-risk/all).
 */
export async function listOllamaModelsAction(
  endpoint: string,
): Promise<
  | {
      ok: true;
      models: Array<{
        name: string;
        tier: string;
        sizeBytes: number;
        modifiedAt: string | null;
      }>;
      latencyMs: number;
      totalBytes: number;
    }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const trimmed = endpoint.trim();
  if (!trimmed) {
    return { ok: false, error: "Endpoint er tomt" };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Ugyldig endpoint-URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Endpoint must be http:// or https://" };
  }

  // Ollama's tags-endpoint er på root (ikke /v1). Hvis admin har skrevet
  // /v1 i URL'en, normaliserer vi det væk.
  const baseUrl = trimmed.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const tagsUrl = `${baseUrl}/api/tags`;

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(tagsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? `Timeout (5s) — er Ollama startet på ${baseUrl}?`
          : `Kan ikke nå ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const latencyMs = Date.now() - start;

  if (!response.ok) {
    return {
      ok: false,
      error: `Ollama returnerede ${response.status} — er endpoint korrekt?`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "Ollama returnerede ikke gyldig JSON" };
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { models?: unknown[] }).models)
  ) {
    return {
      ok: false,
      error: "Uventet Ollama-response (forventede {models: []})",
    };
  }
  const rawModels = (
    body as {
      models: Array<{ name?: unknown; size?: unknown; modified_at?: unknown }>;
    }
  ).models;
  const models = rawModels
    .map((m) => {
      if (typeof m.name !== "string") return null;
      const sizeBytes = typeof m.size === "number" ? m.size : 0;
      const modifiedAt =
        typeof m.modified_at === "string" ? m.modified_at : null;
      return {
        name: m.name,
        tier: getModelCapabilities(m.name).tools,
        sizeBytes,
        modifiedAt,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const totalBytes = models.reduce((sum, m) => sum + m.sizeBytes, 0);

  return { ok: true, models, latencyMs, totalBytes };
}

/**
 * Send en minimal test-prompt til den konfigurerede provider og returnér
 * svar + latency. Bruges af "Test forbindelse"-knap i LocalAiForm.
 *
 * intent="chat" så det respekterer aiProvider; intent="vibe" tvinges altid
 * til Anthropic (bruges hvis vi vil bevise at vibe-routing virker).
 */
export async function testAiProviderAction(
  intent: ChatIntent = "chat",
  prompt: string = "Say exactly: OK",
): Promise<
  | {
      ok: true;
      provider: string;
      model: string;
      response: string;
      latencyMs: number;
    }
  | { ok: false; error: string }
> {
  await requireAdmin();

  let resolved: Awaited<ReturnType<typeof chatModelResolved>>;
  try {
    resolved = await chatModelResolved(intent);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Provider ikke konfigureret",
    };
  }

  const start = Date.now();
  try {
    const result = await generateText({
      model: resolved.handle,
      prompt: prompt.slice(0, 500),
    });
    return {
      ok: true,
      provider: resolved.provider,
      model: resolved.model,
      response: result.text.slice(0, 500),
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ukendt fejl ved test-kald",
    };
  }
}

/**
 * Slet en lokal Ollama-model. Frigør diskplads + RAM (hvis modellen var
 * loadet). Spejler ollama-pull's allow-list så admin kun kan slette modeller
 * vi anerkender — beskytter mod kommando-injection via DB-state.
 *
 * Audit-log row med actor=user:<id>, tool="ollama.delete", provider="local",
 * model=<navn>. Spor for "hvem slettede hvilke modeller hvornår".
 */
export async function deleteOllamaModelAction(
  modelName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const actor = `user:${session.user?.id ?? "unknown"}` as const;

  const ALLOWED_DELETE_MODELS = [
    "gemma4:e2b",
    "gemma4:e4b",
    "gemma4:e2b-mlx",
    "gemma4:e4b-mlx",
    "gemma4:26b",
    "gemma4:31b",
    "gemma3:1b",
    "gemma3:4b",
    "gemma3:12b",
    "gemma3:27b",
    "llama3.2:3b",
    "llama3.3:70b",
    "qwen2.5:7b",
  ];

  if (!ALLOWED_DELETE_MODELS.includes(modelName)) {
    return {
      ok: false,
      error: `Model '${modelName}' er ikke i allow-listen. Slet i terminal med 'ollama rm ${modelName}' hvis du vil.`,
    };
  }

  const settings = await getAiSettings();
  const baseUrl = (settings.localAiEndpoint ?? "http://localhost:11434")
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Ollama returnerede ${res.status}${text ? `: ${text}` : ""}`,
      };
    }

    await prisma.auditLog
      .create({
        data: {
          actor,
          tool: "ollama.delete",
          argsJson: JSON.stringify({ model: modelName }),
          ok: true,
          errorMsg: "model deleted",
          requestId: crypto.randomUUID(),
          ip: null,
          userAgent: null,
          provider: "local",
          model: modelName,
          modality: "text",
        },
      })
      .catch(() => {
        // Audit-failure må ikke blokere
      });

    invalidateAiSettingsCache();
    revalidatePath("/admin/integrations");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? "Timeout (30s) — Ollama tog for lang tid om at slette"
          : `Fejl: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Voice Shop (Gemini Live) ────────────────────────────────────────────────

const VOICE_MODELS = [
  "gemini-2.5-flash-live",
  "gemini-3.1-flash-live-preview",
] as const;

const VOICE_VOICES = [
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Aoede",
  "Leda",
  "Orus",
  "Zephyr",
] as const;

export async function getVoiceShopSettingsForUi() {
  await requireAdmin();
  const s = await getVoiceShopSettings();
  const usage = await readDailyUsage();
  return {
    enabled: s.enabled,
    apiKeyConfigured: !!s.apiKey,
    model: s.model,
    voice: s.voice,
    allowedTools: s.allowedTools,
    maxMinutesPerSession: s.maxMinutesPerSession,
    maxMinutesPerDay: s.maxMinutesPerDay,
    visionEnabled: s.visionEnabled,
    todayUsage: usage,
    availableTools: [...CUSTOMER_TOOL_ALLOWLIST],
    availableModels: [...VOICE_MODELS],
    availableVoices: [...VOICE_VOICES],
  };
}

export async function setVoiceShopSettingsAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const model = String(formData.get("model") ?? "").trim();
  const voice = String(formData.get("voice") ?? "").trim();
  const maxMinutesPerSession = Number(
    formData.get("maxMinutesPerSession") ?? "5",
  );
  const maxMinutesPerDay = Number(formData.get("maxMinutesPerDay") ?? "60");
  const visionEnabled = formData.get("visionEnabled") === "on";
  const allowedTools = formData.getAll("allowedTools").map(String);

  if (!(VOICE_MODELS as readonly string[]).includes(model)) {
    return { ok: false, error: "Ugyldig model" };
  }
  if (!(VOICE_VOICES as readonly string[]).includes(voice)) {
    return { ok: false, error: "Ugyldig voice" };
  }
  if (
    !Number.isFinite(maxMinutesPerSession) ||
    maxMinutesPerSession < 1 ||
    maxMinutesPerSession > 60
  ) {
    return {
      ok: false,
      error: "Session cap must be between 1 and 60 minutes",
    };
  }
  if (
    !Number.isFinite(maxMinutesPerDay) ||
    maxMinutesPerDay < 1 ||
    maxMinutesPerDay > 10000
  ) {
    return { ok: false, error: "Daily cap must be 1-10000 min" };
  }

  // Sanitize allowedTools mod CUSTOMER_TOOL_ALLOWLIST (typed-array-cast)
  const customerSet = new Set<string>(CUSTOMER_TOOL_ALLOWLIST);
  const sanitizedTools = allowedTools.filter((t) => customerSet.has(t));

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    update: {
      voiceShopEnabled: enabled,
      voiceShopModel: model,
      voiceShopVoice: voice,
      voiceShopAllowedToolsJson:
        sanitizedTools.length > 0 ? JSON.stringify(sanitizedTools) : null,
      voiceShopMaxMinutesPerSession: maxMinutesPerSession,
      voiceShopMaxMinutesPerDay: maxMinutesPerDay,
      voiceShopVisionEnabled: visionEnabled,
    },
    create: {
      id: 1,
      voiceShopEnabled: enabled,
      voiceShopModel: model,
      voiceShopVoice: voice,
      voiceShopAllowedToolsJson:
        sanitizedTools.length > 0 ? JSON.stringify(sanitizedTools) : null,
      voiceShopMaxMinutesPerSession: maxMinutesPerSession,
      voiceShopMaxMinutesPerDay: maxMinutesPerDay,
      voiceShopVisionEnabled: visionEnabled,
    },
  });

  invalidateVoiceShopCache();
  revalidatePath("/admin/integrations");
  return { ok: true };
}

/**
 * Validér at en voice-session kan mintet med nuværende settings. Returnerer
 * latency + diagnostics uden faktisk at åbne en WS (vi mint'er bare en token
 * og lukker den med det samme). Catcher: invalid API key, allowedTools tom,
 * cap-fejl.
 */
export async function testVoiceShopAction(): Promise<
  | { ok: true; latencyMs: number; effectiveTools: number; model: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const s = await getVoiceShopSettings();
  if (!s.enabled) {
    return { ok: false, error: "Voice shop er ikke aktiveret." };
  }
  if (!s.apiKey) {
    return {
      ok: false,
      error: "Missing Google Gemini API key. Save it above first.",
    };
  }

  const { buildVoiceShopTools } = await import("@/lib/voice/tools");
  const { GoogleGenAI } = await import("@google/genai");
  const { getBrand } = await import("@/lib/brand");
  const { buildVoiceShopPrompt } = await import("@/lib/voice/prompts");

  const bundle = buildVoiceShopTools(s.allowedTools);
  if (bundle.effectiveTools.length === 0) {
    return {
      ok: false,
      error:
        "No voice tools available — select at least one tool in the list.",
    };
  }

  const brand = await getBrand();
  const systemPrompt = buildVoiceShopPrompt(brand);

  const start = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: s.apiKey });
    const expireTime = new Date(Date.now() + 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    await (
      ai as unknown as {
        authTokens: {
          create: (input: {
            config: Record<string, unknown>;
          }) => Promise<{ name: string }>;
        };
      }
    ).authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: "v1alpha" },
        liveConnectConstraints: {
          model: `models/${s.model}`,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: bundle.geminiTools,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } },
            },
          },
        },
        lockAdditionalFields: [
          "tools",
          "systemInstruction",
          "responseModalities",
        ],
      },
    });
    return {
      ok: true,
      latencyMs: Date.now() - start,
      effectiveTools: bundle.effectiveTools.length,
      model: s.model,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Test-mint fejlede",
    };
  }
}

/**
 * Maskering: vis prefix + suffix, skjul midten. Følger samme mønster som
 * GitHub/Stripe-dashboards så admin har et visuelt match-clue ved
 * troubleshooting men kan ikke kopiere keyen ud.
 */
function maskKey(key: string): string {
  if (key.length < 12) return "•".repeat(key.length);
  const prefix = key.slice(0, 10); // "sk-ant-..."
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(20)}${suffix}`;
}

function maskGenericKey(key: string): string {
  if (key.length < 12) return "•".repeat(key.length);
  // Detect prefix-længde dynamisk: alt før første underscore + det første tegn efter
  const underscoreIdx = key.indexOf("_");
  const prefixEnd = underscoreIdx > 0 ? underscoreIdx + 1 : 4;
  const prefix = key.slice(0, Math.min(prefixEnd + 4, 10));
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(20)}${suffix}`;
}

function maskGeminiKey(key: string): string {
  if (key.length < 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
