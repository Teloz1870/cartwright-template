"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction } from "./actions";
import { SCOPE_GROUPS, SCOPES } from "@/lib/scopes";

export default function ApiKeyForm() {
  const [pending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<{ plaintext: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());

  function handleSubmit(formData: FormData) {
    setError(null);
    setNewKey(null);
    setCopied(false);

    // If using controlled inputs, we might want to ensure formData matches state,
    // but name="scopes" on the checkboxes will naturally include checked values.

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

  function applyPreset(preset: "catalog" | "support" | "admin") {
    let nextScopes: string[] = [];
    if (preset === "catalog") {
      nextScopes = ["catalog:read", "products:write", "categories:write", "products:read", "categories:read"];
    } else if (preset === "support") {
      nextScopes = ["orders:read", "customer:read"];
    } else if (preset === "admin") {
      nextScopes = [...SCOPES];
    }
    setSelectedScopes(new Set(nextScopes));
  }

  function toggleScope(scope: string) {
    const next = new Set(selectedScopes);
    if (next.has(scope)) {
      next.delete(scope);
    } else {
      next.add(scope);
    }
    setSelectedScopes(next);
  }

  if (newKey) {
    return (
      <div className="rounded-2xl border-2 border-sol-accent bg-sol-sand p-6">
        <p className="text-xs font-black uppercase tracking-widest text-sol-accent">
          New API key created — &quot;{newKey.name}&quot;
        </p>
        <p className="mt-2 text-sm font-bold text-sol-ink">
          ⚠️ This key is shown ONCE and cannot be retrieved. Copy it now and store
          et sikkert sted.
        </p>

        <div className="mt-4 flex items-stretch gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-sol-ink px-4 py-3 font-mono text-sm text-sol-cream">
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
          Create another key
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Name (shown in the list)
        </span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="e.g. 'Claude Desktop' or 'iPhone Shortcuts'"
          className="rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-xs font-black uppercase tracking-widest text-sol-muted">
            Scopes (check what this key can do)
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyPreset("catalog")}
              className="rounded bg-sol-sand px-2 py-1 text-xs font-bold text-sol-ink hover:bg-sol-sand/80"
            >
              Catalog Manager
            </button>
            <button
              type="button"
              onClick={() => applyPreset("support")}
              className="rounded bg-sol-sand px-2 py-1 text-xs font-bold text-sol-ink hover:bg-sol-sand/80"
            >
              Support Agent
            </button>
            <button
              type="button"
              onClick={() => applyPreset("admin")}
              className="rounded bg-sol-sand px-2 py-1 text-xs font-bold text-sol-ink hover:bg-sol-sand/80"
            >
              Full Admin
            </button>
          </div>
        </div>

        {Object.entries(SCOPE_GROUPS).map(([group, scopes]) => (
          <div key={group} className="rounded-lg border border-sol-ink/10 bg-sol-sand p-3">
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
                    checked={selectedScopes.has(scope)}
                    onChange={() => toggleScope(scope)}
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
        {pending ? "Creating…" : "Generate API key"}
      </button>
    </form>
  );
}
