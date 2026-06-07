"use client";

import { useState, useTransition } from "react";

import { setThreeDAction, type ThreeDUiData } from "./actions";

/**
 * Live Canvas config editor. Scene radio cards + intensity slider + palette
 * source. Saves via the shared setThreeDAction (same core as the AI tool). v1
 * uses static descriptions; a live WebGL preview is Phase 6.
 */
export function ThreeDForm({ initial }: { initial: ThreeDUiData }) {
  const [scene, setScene] = useState(initial.config.scene);
  const [intensity, setIntensity] = useState(initial.config.intensity);
  const [paletteSource, setPaletteSource] = useState(initial.config.paletteSource);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save(next: {
    scene?: string;
    intensity?: number;
    paletteSource?: "theme" | "custom";
  }) {
    setMsg(null);
    startTransition(async () => {
      const res = await setThreeDAction(next);
      if (res.ok) setMsg({ ok: true, text: "Gemt — slår igennem på storefront inden for 30 sek." });
      else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-1 text-lg font-black text-sol-ink">Scene</h2>
        <p className="mb-4 text-xs text-sol-muted">
          Vælg den indbyggede 3D-scene. Farverne hentes automatisk fra dit tema.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {initial.scenes.map((s) => {
            const selected = s.id === scene;
            return (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => {
                  setScene(s.id as typeof scene);
                  save({ scene: s.id });
                }}
                className={`rounded-xl border-2 p-4 text-left transition disabled:opacity-60 ${
                  selected
                    ? "border-sol-accent bg-sol-accent/5"
                    : "border-sol-ink/10 bg-sol-sand hover:border-sol-ink/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-sol-ink">{s.label}</span>
                  {selected && (
                    <span className="rounded-full bg-sol-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      Valgt
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-sol-muted">{s.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="mb-1 text-lg font-black text-sol-ink">Intensitet</h2>
        <p className="mb-3 text-xs text-sol-muted">
          Tæthed, hastighed og amplitude. {Math.round(intensity * 100)}%
        </p>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          disabled={pending}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          onPointerUp={() => save({ intensity })}
          onKeyUp={() => save({ intensity })}
          className="w-full accent-sol-accent"
        />
      </section>

      <section className="max-w-md">
        <h2 className="mb-1 text-lg font-black text-sol-ink">Farvekilde</h2>
        <label className="mt-2 flex items-center gap-3">
          <input
            type="checkbox"
            checked={paletteSource === "theme"}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked ? "theme" : "custom";
              setPaletteSource(next);
              save({ paletteSource: next });
            }}
            className="h-5 w-5 rounded border-sol-ink/15"
          />
          <span className="text-sm text-sol-ink">
            Brug tema-farver (anbefalet) — scenen matcher automatisk dit brand
          </span>
        </label>
      </section>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
