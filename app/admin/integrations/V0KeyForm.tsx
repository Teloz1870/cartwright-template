"use client";

import { useState, useTransition } from "react";
import { clearV0KeyAction, setV0KeyAction } from "./actions";

type IntegrationStatus = {
  isSet: boolean;
  preview: string | null;
  envFallback: boolean;
};

type Props = {
  initialStatus: IntegrationStatus;
};

export default function V0KeyForm({ initialStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(
    initialStatus.preview,
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await setV0KeyAction(formData);
      if (r.ok) {
        setSavedPreview(r.preview);
        setInput(""); // clear the input so plaintext does not sit in state
      } else {
        setError(r.error);
      }
    });
  }

  function handleClear() {
    if (
      !confirm(
        "Remove the v0 API key? Generating UI with the v0 engine in the Vibe Sandbox will stop working until a new key is set.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await clearV0KeyAction();
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
              Configured
            </span>
            <code className="rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
              {savedPreview}
            </code>
          </>
        ) : initialStatus.envFallback ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            Using .env fallback (V0_API_KEY) — override here
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
            Not configured — the v0 engine in Vibe Sandbox won&apos;t work
          </span>
        )}
      </div>

      {/* Form */}
      <form action={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Vercel v0 API key
          </span>
          <input
            type="password"
            name="apiKey"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="v0 platform API key..."
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <span className="mt-1 block text-xs text-sol-muted">
            Used to generate storefront sections via v0 (text→UI) in Vibe Sandbox. Get a
            key at{" "}
            <a
              href="https://v0.dev/chat/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sol-accent underline"
            >
              v0.dev/chat/settings/keys
            </a>
            . The key is only sent to the server and is never returned in clear text.
            <br />
            <span className="text-sol-ink/60">
              Privacy: v0 is opt-out by default. For GDPR production, choose a
              zero-retention tier and sign a DPA with Vercel before sending brand data.
            </span>
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
