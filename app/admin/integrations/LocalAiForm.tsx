"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  setAiSettingsAction,
  listOllamaModelsAction,
  testAiProviderAction,
} from "./actions";
import OllamaInstallCard from "@/components/admin/OllamaInstallCard";
import ModelRecommendationCards from "@/components/admin/ModelRecommendationCards";
import InstalledModelsList from "@/components/admin/InstalledModelsList";

/**
 * Local-AI plan Fase 1+7: provider-skifte + Ollama-discovery + pull + delete.
 *
 * Commit 8 extended the form with polished empty states: an install card if
 * Ollama is down, recommendation cards (Tiny/Recommended/Power) if empty,
 * and an installed list with delete + total disk usage if ≥1 model.
 */

type Initial = {
  provider: "anthropic" | "local" | "auto";
  anthropicModel: string;
  localAiEndpoint: string | null;
  localAiModel: string | null;
  localAiFallbackMode: "off" | "on-error" | "after-3-failures";
  anthropicConfigured: boolean;
  localConfigured: boolean;
  lastDegradedAt: string | null;
};

type Props = {
  initial: Initial;
};

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast + cheap, recommended)" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (better reasoning)" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 (most expensive, deepest reasoning)" },
];

const TIER_LABELS: Record<string, string> = {
  "read-only": "Read-only (~10 tools)",
  "low-risk-writes": "Low-risk writes (~15 tools)",
  all: "All 37 admin tools",
};

export default function LocalAiForm({ initial }: Props) {
  const [provider, setProvider] = useState(initial.provider);
  const [anthropicModel, setAnthropicModel] = useState(initial.anthropicModel);
  const [localAiEndpoint, setLocalAiEndpoint] = useState(
    initial.localAiEndpoint ?? "http://localhost:11434/v1",
  );
  const [localAiModel, setLocalAiModel] = useState(initial.localAiModel ?? "");
  const [localAiFallbackMode, setLocalAiFallbackMode] = useState(
    initial.localAiFallbackMode,
  );
  const [saved, setSaved] = useState(true);

  const [savePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const [discoverPending, startDiscoverTransition] = useTransition();
  const [discoveredModels, setDiscoveredModels] = useState<
    Array<{ name: string; tier: string; sizeBytes: number; modifiedAt: string | null }>
  >([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverLatency, setDiscoverLatency] = useState<number | null>(null);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  // null = not tested yet, true = Ollama responds, false = ECONNREFUSED/timeout
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  // Auto-poll after a pull completes so the model appears without a manual click
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [testPending, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<
    | { kind: "ok"; provider: string; model: string; response: string; latencyMs: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  function handleSave() {
    setSaveError(null);
    const fd = new FormData();
    fd.set("provider", provider);
    fd.set("anthropicModel", anthropicModel);
    fd.set("localAiEndpoint", localAiEndpoint);
    fd.set("localAiModel", localAiModel);
    fd.set("localAiFallbackMode", localAiFallbackMode);
    startSaveTransition(async () => {
      const r = await setAiSettingsAction(fd);
      if (r.ok) {
        setSaved(true);
      } else {
        setSaveError(r.error);
      }
    });
  }

  function handleDiscover() {
    setDiscoverError(null);
    setDiscoveredModels([]);
    setDiscoverLatency(null);
    startDiscoverTransition(async () => {
      const r = await listOllamaModelsAction(localAiEndpoint);
      if (r.ok) {
        setDiscoveredModels(r.models);
        setDiscoverLatency(r.latencyMs);
        setTotalBytes(r.totalBytes);
        setOllamaReachable(true);
      } else {
        setDiscoverError(r.error);
        // ECONNREFUSED/timeout → show the install card. Other errors (404 etc.) →
        // beholder generel error-besked.
        const connectivityError =
          /timeout|cannot reach|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(
            r.error,
          );
        setOllamaReachable(!connectivityError);
      }
    });
  }

  // Auto-poll loop: once a pull has just finished, try refreshing the model list
  // every 3s for up to 30s so the new model appears without a user click.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  function handlePullComplete(modelName: string) {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const r = await listOllamaModelsAction(localAiEndpoint);
      if (r.ok && r.models.some((m) => m.name === modelName)) {
        setDiscoveredModels(r.models);
        setDiscoverLatency(r.latencyMs);
        setTotalBytes(r.totalBytes);
        setOllamaReachable(true);
        setLocalAiModel(modelName);
        setSaved(false);
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      } else if (attempts > 10) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };
    void poll();
    pollTimerRef.current = setInterval(poll, 3000);
  }

  function handleTest() {
    setTestResult(null);
    startTestTransition(async () => {
      if (!saved) {
        const fd = new FormData();
        fd.set("provider", provider);
        fd.set("anthropicModel", anthropicModel);
        fd.set("localAiEndpoint", localAiEndpoint);
        fd.set("localAiModel", localAiModel);
        fd.set("localAiFallbackMode", localAiFallbackMode);
        const saveResult = await setAiSettingsAction(fd);
        if (!saveResult.ok) {
          setTestResult({ kind: "error", message: `Save failed: ${saveResult.error}` });
          return;
        }
        setSaved(true);
      }
      const r = await testAiProviderAction("chat", "Say exactly: OK");
      if (r.ok) {
        setTestResult({
          kind: "ok",
          provider: r.provider,
          model: r.model,
          response: r.response,
          latencyMs: r.latencyMs,
        });
      } else {
        setTestResult({ kind: "error", message: r.error });
      }
    });
  }

  function onAnyChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setSaved(false);
    };
  }

  const showLocalFields = provider === "local" || provider === "auto";

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-widest text-sol-muted">
          Provider
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <ProviderRadio
            value="anthropic"
            current={provider}
            onSelect={onAnyChange(setProvider)}
            label="Anthropic"
            description="Cloud · Claude Haiku/Sonnet. Best quality, requires API key."
            badge={initial.anthropicConfigured ? "Configured" : "Missing key"}
            badgeOk={initial.anthropicConfigured}
          />
          <ProviderRadio
            value="local"
            current={provider}
            onSelect={onAnyChange(setProvider)}
            label="Local (Ollama)"
            description="On-device · Gemma/Llama. Free, private, no cloud roundtrip."
            badge={initial.localConfigured ? "Configured" : "Missing endpoint"}
            badgeOk={initial.localConfigured}
          />
          <ProviderRadio
            value="auto"
            current={provider}
            onSelect={onAnyChange(setProvider)}
            label="Auto"
            description="Prefer local if configured, otherwise Anthropic. On-error fallback."
            badge={
              initial.lastDegradedAt
                ? `Degraded ${new Date(initial.lastDegradedAt).toLocaleString("da-DK")}`
                : undefined
            }
            badgeOk={!initial.lastDegradedAt}
          />
        </div>
      </div>

      {(provider === "anthropic" || provider === "auto") && (
        <div>
          <label
            htmlFor="anthropicModel"
            className="mb-1 block text-xs font-black uppercase tracking-widest text-sol-muted"
          >
            Anthropic model
          </label>
          <select
            id="anthropicModel"
            value={anthropicModel}
            onChange={(e) => onAnyChange(setAnthropicModel)(e.target.value)}
            className="rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
          >
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showLocalFields && (
        <div className="space-y-3 rounded-lg border border-sol-ink/10 bg-sol-cream/40 p-4">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-sol-ink">
              Ollama configuration
            </h4>
            <p className="mt-1 text-xs text-sol-muted">
              Run Ollama locally:{" "}
              <code className="rounded bg-sol-cream px-1.5 py-0.5">
                ollama serve
              </code>
              {" "}+{" "}
              <code className="rounded bg-sol-cream px-1.5 py-0.5">
                ollama pull gemma4:e4b
              </code>
              . Remember{" "}
              <code className="rounded bg-sol-cream px-1.5 py-0.5">
                OLLAMA_ORIGINS=*
              </code>
              {" "}env if admin runs on a different origin.
            </p>
          </div>

          <div>
            <label
              htmlFor="localAiEndpoint"
              className="mb-1 block text-[10px] font-black uppercase tracking-widest text-sol-muted"
            >
              Endpoint URL
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="localAiEndpoint"
                type="text"
                value={localAiEndpoint}
                onChange={(e) => onAnyChange(setLocalAiEndpoint)(e.target.value)}
                placeholder="http://localhost:11434/v1"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 min-w-[260px] rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 font-mono text-sm text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              />
              <button
                type="button"
                onClick={handleDiscover}
                disabled={discoverPending || !localAiEndpoint.trim()}
                className="rounded-full border border-sol-ink/15 bg-sol-cream px-4 py-2 text-xs font-black uppercase tracking-wider text-sol-ink transition hover:bg-sol-accent hover:text-white hover:border-sol-accent disabled:opacity-50"
              >
                {discoverPending ? "Fetching…" : "Fetch models"}
              </button>
            </div>
            {discoverError && ollamaReachable === false && (
              <OllamaInstallCard
                errorMessage={discoverError}
                onRecheck={handleDiscover}
                rechecking={discoverPending}
              />
            )}
            {discoverError && ollamaReachable !== false && (
              <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {discoverError}
              </p>
            )}
            {discoverLatency !== null &&
              discoveredModels.length === 0 &&
              !discoverError && (
                <>
                  <p className="mt-2 text-xs text-sol-muted">
                    ✓ Connection OK ({discoverLatency}ms) — no models
                    installed yet.
                  </p>
                  <ModelRecommendationCards
                    endpoint={localAiEndpoint}
                    onPullComplete={handlePullComplete}
                  />
                </>
              )}
            {discoveredModels.length > 0 && (
              <>
                <p className="mt-2 text-xs text-sol-muted">
                  {discoveredModels.length} models found ({discoverLatency}ms)
                </p>
                <InstalledModelsList
                  models={discoveredModels}
                  totalBytes={totalBytes}
                  activeModel={localAiModel}
                  onDeleted={handleDiscover}
                />
              </>
            )}
          </div>

          <div>
            <label
              htmlFor="localAiModel"
              className="mb-1 block text-[10px] font-black uppercase tracking-widest text-sol-muted"
            >
              Model
            </label>
            {discoveredModels.length > 0 ? (
              <select
                id="localAiModel"
                value={localAiModel}
                onChange={(e) => onAnyChange(setLocalAiModel)(e.target.value)}
                className="w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 font-mono text-sm text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              >
                <option value="">— select model —</option>
                {discoveredModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} — {TIER_LABELS[m.tier] ?? m.tier}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="localAiModel"
                type="text"
                value={localAiModel}
                onChange={(e) => onAnyChange(setLocalAiModel)(e.target.value)}
                placeholder="gemma4:e4b"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 font-mono text-sm text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              />
            )}
            {localAiModel && (
              <p className="mt-1 text-[11px] text-sol-muted">
                Capability tier:{" "}
                <strong className="font-bold text-sol-ink">
                  {TIER_LABELS[
                    discoveredModels.find((m) => m.name === localAiModel)?.tier ??
                      "read-only"
                  ] ?? "read-only (default for unknown model)"}
                </strong>
              </p>
            )}
          </div>

          {provider === "auto" && (
            <div>
              <label
                htmlFor="localAiFallbackMode"
                className="mb-1 block text-[10px] font-black uppercase tracking-widest text-sol-muted"
              >
                Fallback mode (when local fails)
              </label>
              <select
                id="localAiFallbackMode"
                value={localAiFallbackMode}
                onChange={(e) =>
                  onAnyChange(setLocalAiFallbackMode)(
                    e.target.value as Initial["localAiFallbackMode"],
                  )
                }
                className="w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              >
                <option value="off">Off — fail request if local is down</option>
                <option value="on-error">On-error — fall back to Anthropic on first error</option>
                <option value="after-3-failures">After-3-failures — fall back after 3 errors in a row</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-sol-ink/10 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending || saved}
          className="rounded-full bg-sol-accent px-5 py-2 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
        >
          {savePending ? "Saving…" : saved ? "Saved" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testPending}
          className="rounded-full border border-sol-ink/15 bg-sol-cream px-4 py-2 text-xs font-black uppercase tracking-wider text-sol-ink transition hover:bg-sol-accent hover:text-white hover:border-sol-accent disabled:opacity-50"
        >
          {testPending ? "Testing…" : "Test connection"}
        </button>
        {saveError && (
          <span className="text-xs font-bold text-red-700">{saveError}</span>
        )}
      </div>

      {testResult?.kind === "ok" && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm">
          <div className="font-bold text-green-800">
            ✓ {testResult.provider} · {testResult.model} · {testResult.latencyMs}ms
          </div>
          <div className="mt-1 font-mono text-xs text-green-900">
            &quot;{testResult.response}&quot;
          </div>
        </div>
      )}
      {testResult?.kind === "error" && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {testResult.message}
        </p>
      )}
    </div>
  );
}

function ProviderRadio({
  value,
  current,
  onSelect,
  label,
  description,
  badge,
  badgeOk,
}: {
  value: "anthropic" | "local" | "auto";
  current: string;
  onSelect: (v: "anthropic" | "local" | "auto") => void;
  label: string;
  description: string;
  badge?: string;
  badgeOk: boolean;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg border-2 p-3 text-left transition ${
        selected
          ? "border-sol-accent bg-sol-accent/5"
          : "border-sol-ink/10 bg-sol-cream hover:border-sol-ink/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-sm font-black ${selected ? "text-sol-accent" : "text-sol-ink"}`}
        >
          {label}
        </span>
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
              badgeOk
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-snug text-sol-muted">{description}</p>
    </button>
  );
}
