"use client";

import { useState, useTransition } from "react";
import { clearVideoGenKeyAction, setVideoGenKeyAction } from "./actions";

type IntegrationStatus = {
  isSet: boolean;
  preview: string | null;
  provider: string;
};

type Props = {
  initialStatus: IntegrationStatus;
};

export default function VideoKeyForm({ initialStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState(initialStatus.provider || "luma");
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(
    initialStatus.preview,
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      formData.append("provider", provider);
      const r = await setVideoGenKeyAction(formData);
      if (r.ok) {
        setSavedPreview(r.preview);
        setInput("");
      } else {
        setError(r.error);
      }
    });
  }

  function handleClear() {
    if (
      !confirm(
        "Remove Video Generation API key? You will not be able to generate AI Cinematic Video Banners until a new key is set.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await clearVideoGenKeyAction();
      setSavedPreview(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex flex-wrap items-center gap-2">
        {savedPreview ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Configured ({provider})
            </span>
            <code className="rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
              {savedPreview}
            </code>
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
            Not configured — Cinematic Banners disabled
          </span>
        )}
      </div>

      {/* Form */}
      <form action={handleSubmit} className="space-y-3">
        <label className="block mb-3">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Provider
          </span>
          <select 
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
          >
            <option value="luma">Luma AI (Dream Machine API)</option>
            <option value="runway">Runway Gen-3 (Coming soon)</option>
            <option value="veo">Google Veo (Coming soon)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            API key
          </span>
          <input
            type="password"
            name="apiKey"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Key..."
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <span className="mt-1 block text-xs text-sol-muted">
            Used to transform static product images into 5-second cinematic videos. Get a free Luma key at{" "}
            <a
              href="https://lumalabs.ai/dream-machine/api"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sol-accent underline"
            >
              Luma AI
            </a>
            .
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
            {pending ? "Saving..." : initialStatus.isSet ? "Replace key" : "Save key"}
          </button>
          {savedPreview && (
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="rounded-full border border-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              Remove key
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
