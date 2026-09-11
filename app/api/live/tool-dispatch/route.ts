import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAuditContext } from "@/lib/audit-context";
import { invokeTool } from "@/lib/tools/registry";
import { CUSTOMER_CHAT_SCOPES } from "@/lib/scopes";
import { CUSTOMER_CONFIRM_REQUIRED } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { redactSensitive } from "@/lib/audit";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
  ConfirmationLimitExceeded,
} from "@/lib/confirmation-tokens";
import { auth } from "@/lib/auth";
import { getVoiceShopSettings } from "@/lib/voice/settings";
import { buildVoiceShopTools } from "@/lib/voice/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  sessionId: z.string().min(1).max(128),
  toolCallId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128), // Gemini snake_case format
  args: z.unknown(),
  confirmationToken: z.string().optional(),
});

/**
 * Voice-plan Fase 1.3: tool-dispatch endpoint.
 *
 * Server-side tool execution flow for voice sessions:
 *   1. Verify cart_session cookie (forhindrer cross-session token-replay)
 *   2. Map Gemini snake_case → registry dot-format
 *   3. Defense-in-depth: check tool er i DB-allowed-list OG i
 *      CUSTOMER_TOOL_ALLOWLIST (token låste det allerede, men double-check)
 *   4. CONFIRM_REQUIRED gate: udsted token første gang, konsumér ved gen-kald
 *   5. invokeTool med CUSTOMER_CHAT_SCOPES
 *   6. withAuditContext({ modality: "voice", provider: "google", model }) →
 *      audit-row får voice-stamps automatisk
 *   7. Returnér enten { kind: "result", functionResponses } (browser forwarder
 *      til Gemini) eller { kind: "confirmation_required", preview, ... }
 *      (browser viser kort, kunde siger ja/nej)
 *
 * Voice-sessioner har ikke samme budget-loft som streamText-flow'et fordi
 * Gemini begrænser sig selv via maxMinutesPerSession (sessionen lukker
 * automatisk). Per-IP rate-limit på token-endpoint catcher abuse-vinklen.
 */

export async function POST(request: NextRequest) {
  const sessionCookie =
    request.cookies.get("cart_session")?.value ??
    request.cookies.get("kurv_session")?.value ?? // legacy
    null;
  if (!sessionCookie) {
    return Response.json(
      { kind: "error", error: "Ingen cart_session cookie." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { kind: "error", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { kind: "error", error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { sessionId, toolCallId, toolName, args, confirmationToken } =
    parsed.data;

  // Cross-session-replay-beskyttelse: sessionId i body skal matche cookie.
  if (sessionId !== sessionCookie) {
    return Response.json(
      { kind: "error", error: "Session-id mismatch." },
      { status: 403 },
    );
  }

  const settings = await getVoiceShopSettings();
  if (!settings.enabled) {
    return Response.json(
      { kind: "error", error: "Voice shop er ikke aktiveret." },
      { status: 503 },
    );
  }

  const bundle = buildVoiceShopTools(settings.allowedTools);
  const registryName = bundle.nameMap[toolName];

  const actor = `storefront-voice:${sessionId}` as const;
  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  if (!registryName) {
    // Token-låsen burde have forhindret dette — log det højt fordi det betyder
    // enten en bug eller et brud-forsøg.
    await prisma.auditLog.create({
      data: {
        actor,
        tool: toolName,
        argsJson: JSON.stringify(redactSensitive(args)),
        ok: false,
        errorMsg: "Voice-dispatch: tool ikke i allowlist",
        requestId: randomUUID(),
        ip,
        userAgent,
        provider: "google",
        model: settings.model,
        modality: "voice",
      },
    });
    return Response.json(
      { kind: "error", error: "Tool ikke tilladt i voice-mode." },
      { status: 403 },
    );
  }

  // CONFIRM_REQUIRED gate
  let effectiveArgs = args;
  if (CUSTOMER_CONFIRM_REQUIRED.has(registryName)) {
    const cleanArgs = stripConfirm(args);

    if (!confirmationToken) {
      let newToken: string;
      try {
        newToken = createPendingConfirmation({
          tool: registryName,
          toolArgs: cleanArgs,
          ownerId: sessionId,
        });
      } catch (err) {
        if (err instanceof ConfirmationLimitExceeded) {
          return Response.json(
            { kind: "error", error: err.message },
            { status: 429 },
          );
        }
        throw err;
      }
      await prisma.auditLog.create({
        data: {
          actor,
          tool: registryName,
          argsJson: JSON.stringify(redactSensitive(cleanArgs)),
          ok: true,
          errorMsg: "proposed (awaiting customer voice confirmation)",
          requestId: randomUUID(),
          ip,
          userAgent,
          provider: "google",
          model: settings.model,
          modality: "voice",
        },
      });
      return Response.json({
        kind: "confirmation_required",
        toolCallId,
        toolName,
        registryName,
        preview: await buildVoicePreview(registryName, cleanArgs),
        confirmationToken: newToken,
      });
    }

    const verify = consumeConfirmation({
      token: confirmationToken,
      tool: registryName,
      toolArgs: cleanArgs,
      ownerId: sessionId,
    });
    if (!verify.ok) {
      return Response.json(
        {
          kind: "error",
          error: `Bekræftelse afvist: ${verify.reason}`,
        },
        { status: 403 },
      );
    }
    effectiveArgs = cleanArgs;
  }

  // Tool-invocation gennem registry — wrap i withAuditContext så row får
  // modality="voice" + provider/model stamps automatisk.
  const cookieMap = new Map<string, string>();
  for (const c of request.cookies.getAll()) {
    cookieMap.set(c.name, c.value);
  }
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const result = await withAuditContext(
    {
      provider: "google",
      model: settings.model,
      modality: "voice",
    },
    () =>
      invokeTool(
        registryName,
        effectiveArgs,
        {
          actor,
          requestId: randomUUID(),
          ip,
          userAgent,
          cookies: cookieMap,
          userId,
        },
        CUSTOMER_CHAT_SCOPES,
      ),
  );

  // Pak resultatet i Gemini's BidiGenerateContentToolResponse-format så
  // browseren kan forwarde direkte til WS.
  const response: Record<string, unknown> = result.ok
    ? { result: result.result }
    : { error: result.error };

  return Response.json({
    kind: "result",
    functionResponses: [
      {
        id: toolCallId,
        name: toolName,
        response,
      },
    ],
  });
}

async function buildVoicePreview(
  name: string,
  args: unknown,
): Promise<string> {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case "orders.create":
      return `Opret ordre til ${a.shippingName ?? "kunde"} (${a.email ?? "?"}) — ${a.shippingAddress ?? ""}, ${a.shippingZip ?? ""} ${a.shippingCity ?? ""}`;
    default:
      return `Udfør ${name}`;
  }
}
