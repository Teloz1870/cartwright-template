import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import {
  chatModel,
  getAnthropicApiKey,
  ADMIN_TOOL_ALLOWLIST,
  ADMIN_MAX_TOOL_CALLS_PER_SESSION,
  CONFIRM_REQUIRED,
  isAdminTool,
} from "@/lib/ai/client";
import { OPERATOR_SYSTEM_PROMPT } from "@/lib/ai/operator-prompt";
import { getTool, invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { adminChatRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
} from "@/lib/confirmation-tokens";
import { redactSensitive } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // admin workflows kan være længere end customer chat

/**
 * Operatør-chat-endpoint. Lever bag Auth.js requireAdmin-guard. Sender SSE-
 * streamed responses med tool-calling fra ADMIN_TOOL_ALLOWLIST.
 *
 * Plan-først-confirmation (kritisk sikkerheds-lag):
 *   Tools i CONFIRM_REQUIRED-listen udføres IKKE direkte. Første kald
 *   returnerer { requiresConfirmation:true, tool, args, preview }. Klient
 *   viser plan-card; admin klikker bekræft → ny request sendes med samme
 *   args + 'confirm:true'. AI'en kan IKKE selv sætte confirm:true (vi
 *   tjekker FØR vi giver args videre til tool-handler — confirm fjernes
 *   fra args inden første kald).
 *
 * Suggest-mode: hvis request body har 'suggestMode:true', filtreres
 * ADMIN_TOOL_ALLOWLIST til kun read-tools (write-tools returnerer 403).
 */
export async function POST(request: NextRequest) {
  // 1. Auth — kun admin
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit per admin-user-id
  const rl = adminChatRateLimiter.check(session.user.id);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  // 3. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, suggestMode, confirmations } = body as {
    messages?: unknown;
    suggestMode?: boolean;
    /** Map af tool → confirmation-token, sendt fra klient når admin har klikket
     *  bekræft på et plan-card. Server slår op i pending-map for at validere. */
    confirmations?: Record<string, string>;
  };
  if (!Array.isArray(messages)) {
    return Response.json(
      { error: "Missing 'messages' array in body" },
      { status: 400 },
    );
  }

  // 4. API-key tjek
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Operatør-AI er ikke konfigureret. Gå til /admin/integrations for at tilføje en Anthropic API-key.",
      },
      { status: 503 },
    );
  }

  const actor = `operator-chat:${session.user.id}` as const;
  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  let toolCallCount = 0;

  async function executeAdminTool(
    name: string,
    args: unknown,
  ): Promise<unknown> {
    // Budget-loft
    if (toolCallCount >= ADMIN_MAX_TOOL_CALLS_PER_SESSION) {
      return {
        error:
          "Tool-budget brugt op for denne session. Refresh siden for at starte forfra.",
      };
    }
    toolCallCount++;

    // Defense-in-depth: bekræft tool er på allowlist
    if (!isAdminTool(name)) {
      await prisma.auditLog.create({
        data: {
          actor,
          tool: name,
          argsJson: JSON.stringify(redactSensitive(args)),
          ok: false,
          errorMsg: "Operatør-chat forsøgte at kalde ikke-tilladt tool",
          requestId: randomUUID(),
          ip,
          userAgent,
        },
      });
      return { error: "Det værktøj er ikke tilgængeligt for operatør-chat." };
    }

    // Suggest-mode: bloker alle write-tools (CONFIRM_REQUIRED = vores write-set)
    if (suggestMode && CONFIRM_REQUIRED.has(name as never)) {
      return {
        error:
          "Suggest mode er aktiv — write-tools er disabled. Slå suggest mode fra for at udføre handlingen.",
      };
    }

    // Plan-først: write-tools kræver server-state-baseret confirmation-token.
    // AI'en kan ALDRIG generere et gyldigt token selv — det udstedes af
    // serveren, gemmes i memory-map med (tool, argsHash, adminId, expiry),
    // og kan kun konsumeres af klienten via request-body 'confirmations'-map
    // efter at admin har klikket Bekræft på plan-card.
    if (CONFIRM_REQUIRED.has(name as never)) {
      // Strip eventuel AI-genereret 'confirm:true' fra args så den ikke kan
      // overleve consumeConfirmation's hash-tjek (vi compare'r mod args UDEN
      // confirm-felt for at få deterministisk hash uanset AI's adfærd).
      const cleanArgs = stripConfirm(args);

      // Tjek om klienten har sendt et token for dette tool
      const token = confirmations?.[name];

      if (!token) {
        // INGEN token: returnér plan-card med nyt token → klienten viser
        // bekræft-knap → ved klik sender klient request igen med token
        const newToken = createPendingConfirmation({
          tool: name,
          toolArgs: cleanArgs,
          ownerId: session!.user.id,
        });
        return {
          requiresConfirmation: true,
          tool: name,
          args: cleanArgs,
          preview: buildPlanPreview(name, cleanArgs),
          confirmationToken: newToken,
        };
      }

      // Token sendt: verificér + consume
      const verify = consumeConfirmation({
        token,
        tool: name,
        toolArgs: cleanArgs,
        ownerId: session!.user.id,
      });
      if (!verify.ok) {
        return { error: `Bekræftelse afvist: ${verify.reason}` };
      }
      // Verified → tilføj confirm:true til args. Tools' Zod-schema kræver
      // dette flag for at beskytte MCP/REST-konsumenter; her ER det
      // legitimt at sætte det fordi vi lige har konsumeret et token.
      args = { ...(cleanArgs as Record<string, unknown>), confirm: true };
    }

    const result = await invokeTool(
      name,
      args,
      { actor, requestId: randomUUID(), ip, userAgent },
      ADMIN_CHAT_SCOPES,
    );
    return result.ok ? result.result : { error: result.error };
  }

  // Anthropic API kræver tool-navne der matcher /^[a-zA-Z0-9_-]{1,128}$/.
  // Vores registry bruger "domain.verb" — vi konverterer "." → "_" når vi
  // registrerer med AI SDK og oversætter tilbage i executor. Reverse-lookup
  // bruger en pre-bygget map så vi ikke gætter på ambiguous navne.
  const apiNameToRegistryName: Record<string, string> = {};
  for (const registryName of ADMIN_TOOL_ALLOWLIST) {
    apiNameToRegistryName[registryName.replace(/\./g, "_")] = registryName;
  }

  // Byg tool-table — én entry per tool i allowlist (med api-safe navne)
  const aiTools = Object.fromEntries(
    ADMIN_TOOL_ALLOWLIST.map((registryName) => {
      const reg = getTool(registryName);
      if (!reg) return [registryName, undefined];
      const apiName = registryName.replace(/\./g, "_");
      return [
        apiName,
        tool({
          description: reg.description,
          inputSchema: reg.input as unknown as z.ZodObject<z.ZodRawShape>,
          execute: (args: unknown) =>
            executeAdminTool(apiNameToRegistryName[apiName] ?? apiName, args),
        }),
      ];
    }).filter(([, v]) => v !== undefined),
  ) as Record<string, ReturnType<typeof tool>>;

  const modelMessages = await convertToModelMessages(messages);
  const model = await chatModel();

  const result = streamText({
    model,
    system: OPERATOR_SYSTEM_PROMPT,
    messages: modelMessages,
    tools: aiTools,
    stopWhen: stepCountIs(ADMIN_MAX_TOOL_CALLS_PER_SESSION),
    onError({ error }) {
      console.error("[admin/chat] streamText error:", error);
    },
  });

  return result.toUIMessageStreamResponse();
}

/**
 * Menneske-læseligt resume af et tool-kald til plan-card-rendering.
 * Skal være ÉN linje — admin scanner planen hurtigt før klik.
 */
function buildPlanPreview(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case "products.delete":
      return `Slet (soft-delete) produktet '${a.slug}'`;
    case "products.create":
      return `Opret produkt '${a.name}' (slug: ${a.slug}) til ${formatPrice(a.priceDkk)}`;
    case "products.update":
      return `Opdater produkt '${a.slug}' med ændringer: ${JSON.stringify(a.patch ?? {})}`;
    case "orders.update_status":
      return `Sæt ordre ${a.orderId} til status '${a.status}'`;
    case "discounts.create":
      return `Opret rabatkode '${a.code}' (${a.type === "percent" ? `${a.value}%` : `${formatPrice(a.value)}`})`;
    case "discounts.toggle":
      return `Toggle rabatkode '${a.code}' aktiv/inaktiv`;
    case "categories.upsert":
      return `Opret/opdater kategori '${a.slug}' ('${a.name}')`;
    case "categories.delete":
      return `Slet kategori '${a.slug}'`;
    case "pages.upsert":
      return `Opret/opdater /info/${a.slug} ('${a.title}')`;
    case "pages.delete":
      return `Slet side /info/${a.slug}`;
    case "settings.update_shipping":
      return `Sæt fragt: ${formatPrice(a.shippingFeeOere)} | gratis over ${formatPrice(a.freeShippingThresholdOere)}`;
    case "settings.update_branding":
      return `Opdater branding (butiksnavn '${a.storeName}', announcement '${a.announcement}')`;
    case "marketing.create_campaign":
      return `KAMPAGNE: rabatkode '${a.discountCode}' (${a.discountType === "percent" ? `${a.discountValue}%` : `${formatPrice(a.discountValue)}`}) + nyt banner '${a.announcement}'`;
    case "audit.revert":
      return `RUL TILBAGE audit-entry ${a.auditLogId}`;
    default:
      return `Udfør ${name}`;
  }
}

function formatPrice(v: unknown): string {
  if (typeof v !== "number") return String(v);
  return `${(v / 100).toFixed(2).replace(".", ",")} kr`;
}
