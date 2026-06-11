import { auth } from "@/lib/auth";
import { generateText } from "ai";
import { chatModelResolved } from "@/lib/ai/client";
import { getAiSettings } from "@/lib/ai/settings";
import { getInitialAiStatus } from "@/lib/ai/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Local-AI plan Fase 3.1: real end-to-end health-check af AI-providern.
 *
 * AiStatusPill poller denne hver 30s for at vise live latency.
 *
 * Skelner mellem:
 *   - "provider configured but unreachable" → kind=offline
 *   - "responding but slow" → kind=cloud/local-online + høj latency
 *   - "configured + responding" → kind=cloud/local-online + lav latency
 *
 * Bruger 1-token generation som probe — billigere end at lade Ollama loade
 * en hel response, men nok til at validere at modellen rent faktisk svarer
 * (ikke kun at endpoint TCP-listen).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAiSettings();
  const initial = await getInitialAiStatus();

  if (
    (settings.provider === "anthropic" && !settings.anthropicConfigured) ||
    (settings.provider === "local" && !settings.localConfigured) ||
    (settings.provider === "auto" &&
      !settings.anthropicConfigured &&
      !settings.localConfigured)
  ) {
    return Response.json({ ...initial, kind: "offline", latencyMs: null });
  }

  let resolved: Awaited<ReturnType<typeof chatModelResolved>>;
  try {
    resolved = await chatModelResolved("chat");
  } catch {
    return Response.json({ ...initial, kind: "offline", latencyMs: null });
  }

  const start = Date.now();
  try {
    await generateText({
      model: resolved.handle,
      prompt: "ok",
    });
    const latencyMs = Date.now() - start;
    return Response.json({
      ...initial,
      provider: resolved.provider,
      model: resolved.model,
      latencyMs,
    });
  } catch (err) {
    console.error(
      `[admin/ai/health] provider=${resolved.provider} model=${resolved.model} failed:`,
      err,
    );
    return Response.json({
      ...initial,
      kind: "offline",
      latencyMs: null,
    });
  }
}
