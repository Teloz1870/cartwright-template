"use client";

import { useState, useTransition } from "react";
import { setResendKeyAction, clearResendKeyAction } from "./actions";
import { brand } from "@/brand.config";

type Props = {
  initial: { isSet: boolean; preview: string | null };
};

export default function ResendKeyForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(initial.preview);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await setResendKeyAction(formData);
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
        "Fjern Resend API-key? Magic-links og kvitteringer falder tilbage til preview-mode (kun lokale .mail-previews/, INGEN rigtige emails).",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await clearResendKeyAction();
      setSavedPreview(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {savedPreview ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
            Konfigureret — rigtige emails sendes
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Preview-mode — mails skrives til <code>.mail-previews/</code>
          </span>
        )}
        {savedPreview && (
          <code className="rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
            {savedPreview}
          </code>
        )}
      </div>

      <form action={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Resend API-nøgle
          </span>
          <input
            type="password"
            name="apiKey"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="re_..."
            className="mt-1 block w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <span className="mt-1 block text-xs text-sol-muted">
            Få en key på{" "}
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sol-accent underline"
            >
              resend.com/api-keys
            </a>
            . Gratis tier: 100 mails/dag. Husk DKIM + SPF i Resend-dashboard
            for {brand.domain}.
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
            {pending ? "Gemmer…" : savedPreview ? "Erstat key" : "Gem key"}
          </button>
          {savedPreview && (
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="rounded-full border border-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              Fjern key
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
