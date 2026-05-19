"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction } from "./actions";
import { SCOPE_GROUPS } from "@/lib/scopes";

export default function ApiKeyForm() {
  const [pending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<{ plaintext: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setNewKey(null);
    setCopied(false);

    startTransition(async () => {
      const result = await createApiKeyAction(formData);
      if (result.ok) {
        setNewKey({ plaintext: result.plaintext, name: result.name });
      } else {
        setError(result.error);
      }
    });
  }

  async function copyToClipboard() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (newKey) {
    return (
      <div className="rounded-2xl border-2 border-sol-accent bg-sol-sand p-6">
        <p className="text-xs font-black uppercase tracking-widest text-sol-accent">
          Ny API-key oprettet — &quot;{newKey.name}&quot;
        </p>
        <p className="mt-2 text-sm font-bold text-sol-ink">
          ⚠️ Denne key vises ÉN gang og kan ikke genfindes. Kopiér den nu og gem
          et sikkert sted.
        </p>

        <div className="mt-4 flex items-stretch gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-sol-ink px-4 py-3 font-mono text-sm text-white">
            {newKey.plaintext}
          </code>
          <button
            type="button"
            onClick={copyToClipboard}
            className="shrink-0 rounded-lg bg-sol-accent px-5 text-sm font-bold text-white transition hover:bg-sol-accent/90"
          >
            {copied ? "Kopieret ✓" : "Kopiér"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setNewKey(null)}
          className="mt-4 text-xs font-bold text-sol-muted underline hover:text-sol-ink"
        >
          Opret endnu en key
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Navn (vises i listen)
        </span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="fx 'Claude Desktop' eller 'iPhone Shortcuts'"
          className="rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Scopes (tjek hvad denne key må)
        </legend>
        {Object.entries(SCOPE_GROUPS).map(([group, scopes]) => (
          <div key={group} className="rounded-lg border border-sol-ink/10 bg-white p-3">
            <p className="text-xs font-black uppercase tracking-wider text-sol-ink">
              {group}
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {scopes.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-sm text-sol-ink"
                >
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    className="h-4 w-4 rounded border-sol-ink/30 text-sol-accent focus:ring-sol-accent"
                  />
                  <code className="font-mono text-xs">{scope}</code>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-sol-accent px-6 py-2.5 text-sm font-black uppercase tracking-wider text-white shadow transition hover:bg-sol-accent/90 disabled:opacity-60"
      >
        {pending ? "Opretter…" : "Generér API-key"}
      </button>
    </form>
  );
}
