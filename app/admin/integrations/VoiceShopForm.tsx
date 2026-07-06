"use client";

import { useState, useTransition } from "react";
import {
  setVoiceShopSettingsAction,
  testVoiceShopAction,
} from "./actions";

type VoiceShopUiData = {
  enabled: boolean;
  apiKeyConfigured: boolean;
  model: string;
  voice: string;
  allowedTools: string[];
  maxMinutesPerSession: number;
  maxMinutesPerDay: number;
  visionEnabled: boolean;
  todayUsage: { date: string; minutesUsed: number };
  availableTools: string[];
  availableModels: string[];
  availableVoices: string[];
};

export default function VoiceShopForm({ initial }: { initial: VoiceShopUiData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    | { ok: true; latencyMs: number; effectiveTools: number; model: string }
    | { ok: false; error: string }
    | null
  >(null);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model);
  const [voice, setVoice] = useState(initial.voice);
  const [visionEnabled, setVisionEnabled] = useState(initial.visionEnabled);
  const [maxSession, setMaxSession] = useState(initial.maxMinutesPerSession);
  const [maxDay, setMaxDay] = useState(initial.maxMinutesPerDay);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(initial.allowedTools),
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    setOkMessage(null);
    for (const t of selectedTools) {
      formData.append("allowedTools", t);
    }
    startTransition(async () => {
      const res = await setVoiceShopSettingsAction(formData);
      if (res.ok) {
        setOkMessage("Voice shop settings saved.");
      } else {
        setError(res.error);
      }
    });
  }

  function runTest() {
    setTestResult(null);
    startTransition(async () => {
      const res = await testVoiceShopAction();
      setTestResult(res);
    });
  }

  function toggleTool(name: string) {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-sol-ink/15"
        />
        <span className="text-sm font-bold text-sol-ink">
          Voice Shop aktiveret
        </span>
        {!initial.apiKeyConfigured && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
            Kræver Gemini-nøgle
          </span>
        )}
      </label>

      <div className="rounded-xl bg-sol-cream/40 p-3 text-xs text-sol-muted">
        <div className="font-bold text-sol-ink">I dag</div>
        <div className="font-mono">
          {initial.todayUsage.minutesUsed} / {initial.maxMinutesPerDay} min brugt
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Model
          </span>
          <select
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm"
          >
            {initial.availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Voice
          </span>
          <select
            name="voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm"
          >
            {initial.availableVoices.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Max minutter per session
          </span>
          <input
            type="number"
            name="maxMinutesPerSession"
            value={maxSession}
            min={1}
            max={60}
            onChange={(e) => setMaxSession(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Max minutter per dag (shop)
          </span>
          <input
            type="number"
            name="maxMinutesPerDay"
            value={maxDay}
            min={1}
            max={10000}
            onChange={(e) => setMaxDay(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="visionEnabled"
          checked={visionEnabled}
          onChange={(e) => setVisionEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-sol-ink/15"
        />
        <span className="text-sm font-bold text-sol-ink">
          Vision aktiveret (kamera-input)
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Tilladte tools i voice-mode
        </legend>
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {initial.availableTools.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedTools.has(t)}
                onChange={() => toggleTool(t)}
                className="h-4 w-4 rounded border-sol-ink/15"
              />
              <code className="font-mono text-xs">{t}</code>
              {t === "orders.create" && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                  advanced
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
      {okMessage && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
          {okMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-sol-accent px-5 py-2 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={runTest}
          disabled={pending || !enabled || !initial.apiKeyConfigured}
          className="rounded-full border border-sol-ink/15 px-4 py-2 text-xs font-black uppercase tracking-wider transition hover:bg-sol-cream disabled:opacity-50"
        >
          Test voice connection
        </button>
      </div>

      {testResult && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            testResult.ok
              ? "border-green-300 bg-green-50 text-green-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {testResult.ok ? (
            <span>
              ✅ Connection OK — {testResult.latencyMs}ms,{" "}
              {testResult.effectiveTools} tools, model {testResult.model}
            </span>
          ) : (
            <span>❌ {testResult.error}</span>
          )}
        </div>
      )}
    </form>
  );
}
