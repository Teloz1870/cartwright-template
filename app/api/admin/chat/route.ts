import { NextRequest } from "next/server";
import { streamText, tool, stepCountIs, convertToModelMessages, NoSuchToolError } from "ai";
import { z } from "zod";
import {
  chatModelResolved,
  getAnthropicApiKey,
  ADMIN_TOOL_ALLOWLIST,
  ADMIN_MAX_TOOL_CALLS_PER_SESSION,
  filterToolsForCapability,
} from "@/lib/ai/client";
import { createAdminToolExecutor } from "@/lib/ai/admin-chat-executor";
import { recordAiUsage } from "@/lib/ai/usage";
import { RetiredModelError } from "@/lib/ai/model-retirements";
import { OPERATOR_SYSTEM_PROMPT } from "@/lib/ai/operator-prompt";
import { getTool } from "@/lib/tools/registry";
import { requireAdminApi } from "@/lib/admin";
import { adminChatRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { withAuditContext } from "@/lib/audit-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // admin workflows kan være længere end customer chat

/**
 * Operatør-chat-endpoint. Lever bag requireAdminApi-guard. Sender SSE-
 * streamed responses med tool-calling fra ADMIN_TOOL_ALLOWLIST.
 *
 * Capability tier: the model is resolved first, and it is offered only the
 * tools its tier reaches (`filterToolsForCapability`). A call to an admin tool
 * outside the tier fails in the AI SDK (NoSuchToolError) before any execute;
 * `repairToolCall` has the executor (lib/ai/admin-chat-executor.ts) audit that
 * refusal and tell the model its tier, and nothing runs. An unknown model id
 * gets the read-only tier.
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
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  // 2. Rate-limit per admin-user-id
  const rl = adminChatRateLimiter.check(guard.user.id);
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
          "Operator AI is not configured. Go to /admin/integrations to add an Anthropic API key.",
      },
      { status: 503 },
    );
  }

  const resolved = await chatModelResolved("chat");
  const offered = filterToolsForCapability(ADMIN_TOOL_ALLOWLIST, resolved.capabilities);
  const executeAdminTool = createAdminToolExecutor({
    offered,
    tier: resolved.capabilities.tools,
    adminUserId: guard.user.id,
    suggestMode,
    confirmations,
    ip: request.headers.get("x-forwarded-for") ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  });

  // Anthropic API kræver tool-navne der matcher /^[a-zA-Z0-9_-]{1,128}$/.
  // Vores registry bruger "domain.verb" — vi konverterer "." → "_" når vi
  // registrerer med AI SDK og oversætter tilbage i executor. Reverse-lookup
  // bruger en pre-bygget map så vi ikke gætter på ambiguous navne.
  const apiNameToRegistryName: Record<string, string> = {};
  for (const registryName of offered) {
    apiNameToRegistryName[registryName.replace(/\./g, "_")] = registryName;
  }

  // Byg tool-table — én entry per tool i modellens tier (med api-safe navne)
  const aiTools = Object.fromEntries(
    offered.map((registryName) => {
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

  // Local-AI plan: wrap streamText i withAuditContext så alle tool-calls
  // under denne session får provider+model stamps på audit-rows.
  // AsyncLocalStorage propagerer gennem streamText's async tool.execute callbacks.
  return withAuditContext(
    {
      provider: resolved.provider,
      model: resolved.model,
      modality: "text",
    },
    () => {
      const result = streamText({
        model: resolved.handle,
        system: OPERATOR_SYSTEM_PROMPT,
        messages: modelMessages,
        tools: aiTools,
        stopWhen: stepCountIs(ADMIN_MAX_TOOL_CALLS_PER_SESSION),
        // A tool the model was not offered is a NoSuchToolError here, before
        // any execute — the executor never sees it. For an admin tool outside
        // the tier, the executor writes the refusal to the audit log, and the
        // thrown text is the tool error the model reads ("Error repairing tool
        // call: … capability tier is read-only …"). Nothing is repaired or run;
        // any other name keeps the SDK's own error.
        async repairToolCall({ toolCall, error }) {
          if (!NoSuchToolError.isInstance(error)) return null;
          const refusal = await executeAdminTool.refuseUnofferedCall(
            toolCall.toolName,
            toolCall.input,
          );
          if (refusal === null) return null;
          throw new Error(refusal);
        },
        onError({ error }) {
          console.error("[admin/chat] streamText error:", error);
        },
        // Hul E: optag faktisk token-forbrug (aggregeret over alle tool-steps).
        // AI SDK v7: onFinish→onEnd, totalUsage→usage (begge var deprecated-men-
        // virkende aliaser i v7; migreret til den stabile flade).
        async onEnd({ usage }) {
          await recordAiUsage({
            provider: resolved.provider,
            model: resolved.model,
            modality: "text",
            usage,
          });
        },
      });

      // The SDK masks stream errors as "An error occurred." so no server detail
      // leaks. A retired model is the exception: its message names only the
      // model, the day and the successor, and it is the owner's fix to make.
      return result.toUIMessageStreamResponse({
        onError: (error) =>
          error instanceof RetiredModelError ? error.message : "An error occurred.",
      });
    },
  );
}
