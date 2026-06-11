"use client";

import { useState } from "react";

/**
 * Vises i LocalAiForm når Ollama kører men 0 modeller er pulled.
 * Tre kort (e2b/e4b/26b) med hardware-guidance + "Pull this model"-knap
 * der kalder /api/admin/ai/ollama-pull og streamer progress via
 * Server-Sent Events.
 *
 * Apple Silicon detection: i v1 bruger vi navigator.userAgent. Vi kan ikke
 * pålideligt detektere x86 vs ARM fra browser. Derfor: vis altid -mlx
 * variant som anbefaling på Mac. På Linux/Windows skjules -mlx.
 */

export type ModelRecommendation = {
  baseName: string; // fx "gemma4:e4b"
  mlxName?: string; // fx "gemma4:e4b-mlx" (Apple Silicon-optimized)
  label: string;
  sizeGb: number;
  ramRequiredGb: number;
  tier: "read-only" | "low-risk-writes" | "all";
  description: string;
};

const RECOMMENDATIONS: ModelRecommendation[] = [
  {
    baseName: "gemma4:e2b",
    mlxName: "gemma4:e2b-mlx",
    label: "Tiny",
    sizeGb: 7.2,
    ramRequiredGb: 8,
    tier: "read-only",
    description:
      "Smallest Gemma 4. Read-only tools (products.search, orders.get). Good for dev/test or 8GB laptops.",
  },
  {
    baseName: "gemma4:e4b",
    mlxName: "gemma4:e4b-mlx",
    label: "Recommended",
    sizeGb: 9.6,
    ramRequiredGb: 16,
    tier: "low-risk-writes",
    description:
      "Sweet spot. Reads + low-risk writes (categories, pages, discount codes). Ideal for most shops.",
  },
  {
    baseName: "gemma4:26b",
    label: "Power",
    sizeGb: 18,
    ramRequiredGb: 32,
    tier: "all",
    description:
      "All 37 admin tools. Requires 32GB+ RAM. Slower but can perform destructive operations like product.delete.",
  },
];

const TIER_LABELS: Record<string, string> = {
  "read-only": "Read-only (~10 tools)",
  "low-risk-writes": "Low-risk writes (~15 tools)",
  all: "All 37 admin tools",
};

type PullState =
  | { kind: "idle" }
  | { kind: "starting" }
  | {
      kind: "progress";
      percent: number;
      status: string;
      completedBytes: number;
      totalBytes: number;
    }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function ModelRecommendationCards({
  endpoint,
  onPullComplete,
}: {
  endpoint: string;
  onPullComplete: (modelName: string) => void;
}) {
  const isMac = useIsMac();
  const [pulling, setPulling] = useState<string | null>(null);
  const [state, setState] = useState<PullState>({ kind: "idle" });

  async function handlePull(modelName: string) {
    setPulling(modelName);
    setState({ kind: "starting" });
    try {
      const res = await fetch("/api/admin/ai/ollama-pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modelName, endpoint }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res
          .json()
          .catch(() => ({ error: "Pull-endpoint fejlede" }));
        setState({
          kind: "error",
          message: (errBody as { error?: string }).error ?? "Pull fejlede",
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              status: string;
              completed?: number;
              total?: number;
              error?: string;
            };
            if (event.error) {
              setState({ kind: "error", message: event.error });
              continue;
            }
            if (event.status === "success") {
              setState({ kind: "success" });
              onPullComplete(modelName);
            } else if (event.completed && event.total) {
              setState({
                kind: "progress",
                percent: Math.round((event.completed / event.total) * 100),
                status: event.status,
                completedBytes: event.completed,
                totalBytes: event.total,
              });
            } else {
              setState((prev) =>
                prev.kind === "progress"
                  ? { ...prev, status: event.status }
                  : { kind: "starting" },
              );
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Pull fejlede",
      });
    }
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Anbefalede modeller
        </p>
        <p className="text-[10px] text-sol-muted">
          {isMac ? "MLX-variant valgt automatisk for Apple Silicon" : ""}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {RECOMMENDATIONS.map((rec) => {
          const name = isMac && rec.mlxName ? rec.mlxName : rec.baseName;
          const isCurrentlyPulling = pulling === name;
          const isAnotherPulling = pulling !== null && !isCurrentlyPulling;
          const showProgress =
            isCurrentlyPulling &&
            (state.kind === "progress" ||
              state.kind === "starting" ||
              state.kind === "success");
          const showError = isCurrentlyPulling && state.kind === "error";

          return (
            <div
              key={rec.baseName}
              className={`rounded-xl border bg-white dark:bg-sol-sand p-3 transition ${
                rec.label === "Anbefalet"
                  ? "border-sol-accent shadow-sm"
                  : "border-sol-ink/15"
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <h4 className="text-sm font-black text-sol-ink">{rec.label}</h4>
                {rec.label === "Anbefalet" && (
                  <span className="rounded-full bg-sol-accent/15 px-1.5 text-[9px] font-black uppercase tracking-wider text-sol-accent">
                    Anbefalet
                  </span>
                )}
              </div>
              <code className="block font-mono text-[11px] text-sol-muted">
                {name}
              </code>
              <div className="mt-1 flex gap-3 text-[10px] text-sol-muted">
                <span>{rec.sizeGb}GB</span>
                <span>{rec.ramRequiredGb}GB+ RAM</span>
              </div>
              <p className="mt-1 text-[11px] text-sol-muted">
                {TIER_LABELS[rec.tier]}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-sol-muted">
                {rec.description}
              </p>

              {showProgress && state.kind === "progress" && (
                <div className="mt-2">
                  <div className="mb-0.5 flex justify-between text-[10px] text-sol-muted">
                    <span>{state.status}</span>
                    <span>{state.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-sol-ink/10">
                    <div
                      className="h-full rounded-full bg-sol-accent transition-all"
                      style={{ width: `${state.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {showProgress && state.kind === "starting" && (
                <p className="mt-2 text-[10px] text-sol-muted">Starter pull…</p>
              )}
              {showProgress && state.kind === "success" && (
                <p className="mt-2 text-[11px] font-bold text-green-700">
                  ✓ Modellen er pulled
                </p>
              )}
              {showError && state.kind === "error" && (
                <p className="mt-2 text-[10px] text-red-700">
                  ✗ {state.message}
                </p>
              )}

              <button
                type="button"
                onClick={() => handlePull(name)}
                disabled={isCurrentlyPulling || isAnotherPulling}
                className={`mt-2 w-full rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition disabled:opacity-50 ${
                  rec.label === "Anbefalet"
                    ? "bg-sol-accent text-white hover:bg-sol-accent/90"
                    : "border border-sol-ink/15 dark:border-white/15 bg-white dark:bg-sol-sand text-sol-ink dark:text-white hover:bg-sol-cream dark:hover:bg-white/5"
                }`}
              >
                {isCurrentlyPulling
                  ? state.kind === "success"
                    ? "Pulled ✓"
                    : "Henter…"
                  : `Pull ${name.split(":")[1]}`}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-sol-muted">
        The model is pulled directly to your local Ollama. You can also run{" "}
        <code className="rounded bg-sol-cream px-1 py-0.5">
          ollama pull gemma4:e4b
        </code>{" "}
        in the terminal if you prefer.
      </p>
    </div>
  );
}

function useIsMac(): boolean {
  // Lazy initializer — kører kun ved første render. Returnerer false på server
  // (SSR) og post-hydration tilfælde der ikke har navigator. Hydration-mismatch
  // er acceptabel her: button-label "Pull <name>" er identisk uanset isMac,
  // det er kun mlx-variant valg der ændres post-mount.
  const [isMac] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return navigator.userAgent.toLowerCase().includes("mac");
  });
  return isMac;
}
