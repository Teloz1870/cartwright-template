"use client";

import { useState, useTransition } from "react";
import { clearGeminiKeyAction, setGeminiKeyAction } from "./actions";

type IntegrationStatus = {
  isSet: boolean;
  preview: string | null;
  envFallback: boolean;
};

type Props = {
  initialStatus: IntegrationStatus;
};

export default function GeminiKeyForm({ initialStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(
    initialStatus.preview,
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await setGeminiKeyAction(formData);
      if (r.ok) {
        setSavedPreview(r.preview);
        setInput(""); // ryd input så plaintext ikke ligger i state
      } else {
        setError(r.error);
      }
    });
  }

  function handleClear() {
    if (
      !confirm(
        "Fjern Google Gemini API-nøgle? AI-genereret SEO-content, theme-palette og kategori-beskrivelser stopper med at virke indtil en ny nøgle er sat.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await clearGeminiKeyAction();
      setSavedPreview(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Status-pille */}
      <div className="flex flex-wrap items-center gap-2">
        {savedPreview ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Konfigureret
            </span>
            <code className="rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
              {savedPreview}
            </code>
          </>
        ) : initialStatus.envFallback ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            Bruger fallback fra .env (ikke ideel — overskriv her)
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
            Ikke konfigureret — AI SEO/theme-generator virker ikke
          </span>
        )}
      </div>

      {/* Form */}
      <form action={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Google Gemini API-nøgle
          </span>
          <input
            type="password"
            name="apiKey"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza..."
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <span className="mt-1 block text-xs text-sol-muted">
            Bruges til AI-genereret SEO-content, kategori-beskrivelser og theme-palette. Hent en gratis nøgle
            på{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sol-accent underline"
            >
              Google AI Studio
            </a>
            . Nøglen sendes kun til serveren og kommer aldrig tilbage i klar
            tekst.
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            className="rounded-full bg-sol-accent px-5 py-2 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
          >
            {pending ? "Gemmer…" : initialStatus.isSet ? "Erstat nøgle" : "Gem nøgle"}
          </button>
          {savedPreview && (
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="rounded-full border border-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              Fjern nøgle
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
