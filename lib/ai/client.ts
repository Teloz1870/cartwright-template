import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

/**
 * AI-client for storefront-chatten.
 *
 * Default model er Haiku 4.5 — billig + hurtig, perfekt til tool-orchestration
 * og produkt-anbefaling. Hvis vi senere får brug for dybere reasoning kan vi
 * eskalere til Sonnet/Opus i specifikke flows.
 */
export const CHAT_MODEL = "claude-haiku-4-5";

// Memory-cache så vi ikke rammer DB ved hvert chat-kald. 30 sek TTL —
// kort nok til at admin-changes slår igennem hurtigt, langt nok til at
// chat-burst ikke spammer DB.
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
 * Returnerer en konfigureret model-handle. Async fordi vi kan have brug for
 * at læse key fra DB.
 */
export async function chatModel() {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "Ingen Anthropic API-key — sæt en i /admin/integrations eller via ANTHROPIC_API_KEY i .env",
    );
  }
  // createAnthropic gør det muligt at injicere keyen i stedet for at SDK'et
  // automatisk læser fra process.env (som ikke fanger DB-keyen).
  const provider = createAnthropic({ apiKey });
  return provider(CHAT_MODEL);
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
  "marketing.create_campaign",
  "audit.revert",
  // Billed-håndtering — IKKE i CONFIRM_REQUIRED da search er read-only og
  // attach_image er additivt (ikke destructive).
  "images.search_unsplash",
  "products.attach_image",
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
  "marketing.create_campaign",
  "audit.revert",
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
