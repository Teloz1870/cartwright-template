import "server-only";

import { getAiSettings } from "@/lib/ai/settings";
import type { AiStatus, StatusKind } from "@/components/admin/AiStatusPill";

/**
 * Bygger initial AiStatus til AiStatusPill ved server-side render.
 * Kører ingen netværkskald (det er for slow til at blokere layout-render);
 * pill'en poller selv health-endpointet efter mount for at få live latency.
 */
export async function getInitialAiStatus(): Promise<AiStatus> {
  const settings = await getAiSettings();

  let kind: StatusKind = "unknown";
  let provider: string = settings.provider;
  let model: string = "—";

  if (settings.provider === "anthropic") {
    kind = settings.anthropicConfigured ? "cloud" : "offline";
    provider = "anthropic";
    model = settings.anthropicModel;
  } else if (settings.provider === "local") {
    kind = settings.localConfigured ? "local-online" : "offline";
    provider = "local";
    model = settings.localAiModel ?? "—";
  } else if (settings.provider === "auto") {
    if (settings.localConfigured) {
      // Hvis degraded for nylig (< 1 time), vis degraded-state
      const recentlyDegraded =
        settings.lastDegradedAt &&
        Date.now() - settings.lastDegradedAt.getTime() < 60 * 60 * 1000;
      kind = recentlyDegraded ? "degraded" : "local-online";
      provider = "auto (local primary)";
      model = settings.localAiModel ?? "—";
    } else if (settings.anthropicConfigured) {
      kind = "cloud";
      provider = "auto (cloud-only — local not configured)";
      model = settings.anthropicModel;
    } else {
      kind = "offline";
      provider = "auto";
      model = "—";
    }
  }

  return {
    kind,
    provider,
    model,
    latencyMs: null,
    lastDegradedAt: settings.lastDegradedAt?.toISOString() ?? null,
  };
}
