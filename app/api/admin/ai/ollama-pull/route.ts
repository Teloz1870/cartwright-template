import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai/settings";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby tier caps maxDuration at 300s; Pro unlocks up to 900.
// On Hobby the largest Ollama pulls (gemma4:31b ~20GB) may time out —
// pull those locally and push the weights to the runtime cache, or
// upgrade to Pro to restore the 15-min window.
export const maxDuration = 300;

/**
 * Local-AI plan: pull en Ollama-model fra admin UI med live progress.
 *
 * Server-side flow:
 *   1. requireAdmin
 *   2. Validér model mod hardcoded ALLOWED_PULL_MODELS allow-list (defense-
 *      in-depth — vi tillader ikke admin at pulle vilkårlige modeller selv
 *      om de er authenticated, fordi modelnavne i form-input kunne være
 *      mistroet input fra DB-edit)
 *   3. Hent endpoint fra body eller fra getAiSettings()
 *   4. POST {endpoint}/api/pull med {name, stream: true}
 *   5. Transformér Ollama's JSON-lines response til SSE-frames og pipe til
 *      browseren via ReadableStream
 *   6. Audit-log start (pending) + final status (success/error) så audit-log
 *      har spor af "hvem pulled hvilke modeller hvornår"
 *
 * Cancellation: hvis browseren lukker stream, AbortSignal propagerer til
 * upstream-Ollama-request via signal-prop på fetch.
 */

const ALLOWED_PULL_MODELS = [
  // Gemma 4 — multimodal, 128K-256K context
  "gemma4:e2b",
  "gemma4:e4b",
  "gemma4:e2b-mlx",
  "gemma4:e4b-mlx",
  "gemma4:26b",
  "gemma4:31b",
  // Gemma 3 — legacy, kunder der allerede har dem
  "gemma3:4b",
  "gemma3:12b",
  "gemma3:27b",
  // Llama 3.x — alternativ til Gemma
  "llama3.2:3b",
  "llama3.3:70b",
  // Qwen — alternativ til Gemma
  "qwen2.5:7b",
] as const;

const bodySchema = z.object({
  model: z.string().min(1).max(64),
  endpoint: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const { model, endpoint: bodyEndpoint } = parsed.data;
  if (!(ALLOWED_PULL_MODELS as readonly string[]).includes(model)) {
    return Response.json(
      {
        error: `Model '${model}' er ikke i allow-listen. Kontakt support hvis du har brug for at pull den.`,
      },
      { status: 400 },
    );
  }

  // Endpoint: bodyens 'endpoint' (typisk admin's klient-state), fallback til
  // settings, fallback til standard localhost. Vi normaliserer /v1-suffix væk
  // fordi Ollama's pull-API ligger på root.
  const aiSettings = await getAiSettings();
  const rawEndpoint =
    bodyEndpoint ?? aiSettings.localAiEndpoint ?? "http://localhost:11434";
  const baseUrl = rawEndpoint.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const pullUrl = `${baseUrl}/api/pull`;

  const actor = `user:${session.user.id ?? "unknown"}` as const;
  const requestId = randomUUID();
  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  // Audit "start" — pulled (pending)
  await prisma.auditLog
    .create({
      data: {
        actor,
        tool: "ollama.pull",
        argsJson: JSON.stringify({ model, endpoint: baseUrl }),
        ok: true,
        errorMsg: "pull started",
        requestId,
        ip,
        userAgent,
        provider: "local",
        model,
        modality: "text",
      },
    })
    .catch(() => {
      // Audit-failure må ikke blokere pull
    });

  // Propagér client-cancellation til Ollama
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(pullUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
      signal: abortController.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Pull-request failed";
    await writePullCompletion(actor, model, requestId, false, msg, ip, userAgent);
    return Response.json({ error: msg }, { status: 502 });
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const msg = `Ollama returnerede ${upstreamResponse.status}`;
    await writePullCompletion(actor, model, requestId, false, msg, ip, userAgent);
    return Response.json({ error: msg }, { status: 502 });
  }

  // Transformér Ollama's JSON-lines → SSE frames
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let lastStatus = "";
      let finalOk = false;
      let finalErr: string | null = null;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsedEvent = JSON.parse(trimmed) as {
                status?: string;
                error?: string;
              };
              if (parsedEvent.error) {
                finalErr = parsedEvent.error;
              }
              if (parsedEvent.status) {
                lastStatus = parsedEvent.status;
                if (parsedEvent.status === "success") finalOk = true;
              }
            } catch {
              // Forward malformed line as-is — admin UI vil ignorere
            }
            controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
        finalErr = msg;
      } finally {
        controller.close();
        await writePullCompletion(
          actor,
          model,
          requestId,
          finalOk,
          finalErr ?? (finalOk ? `pull complete (${lastStatus})` : "pull aborted"),
          ip,
          userAgent,
        );
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function writePullCompletion(
  actor: `user:${string}`,
  model: string,
  requestId: string,
  ok: boolean,
  message: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actor,
        tool: "ollama.pull",
        argsJson: JSON.stringify({ model }),
        ok,
        errorMsg: message,
        requestId,
        ip,
        userAgent,
        provider: "local",
        model,
        modality: "text",
      },
    })
    .catch(() => {
      // ignore
    });
}
