"use client";

import { useState, useTransition } from "react";
import { deleteOllamaModelAction } from "@/app/admin/integrations/actions";

/**
 * Shows already-pulled Ollama models with size + capability tier +
 * a delete button. Rendered in LocalAiForm below the model dropdown once at
 * least one model is pulled. Together with a "Total" line at the top so an admin
 * can easily see how much the Ollama cache takes up before pulling a new large model.
 *
 * The delete button calls deleteOllamaModelAction (a server action) which both
 * removes the model from disk and logs to AuditLog. A confirm dialog first
 * because delete is not reversible — only re-pulling helps.
 */

type InstalledModel = {
  name: string;
  tier: string;
  sizeBytes: number;
  modifiedAt: string | null;
};

const TIER_LABELS: Record<string, string> = {
  "read-only": "Read-only",
  "low-risk-writes": "Low-risk writes",
  all: "All tools",
};

export default function InstalledModelsList({
  models,
  totalBytes,
  activeModel,
  onDeleted,
}: {
  models: InstalledModel[];
  totalBytes: number;
  activeModel: string;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(name: string) {
    const sizeNote = models.find((m) => m.name === name);
    const gb = sizeNote ? (sizeNote.sizeBytes / 1e9).toFixed(1) : "?";
    if (
      !window.confirm(
        `Delete ${name} (${gb} GB)?\n\nThis removes the model from your local Ollama. You can always pull it again later — but it takes time and bandwidth.`,
      )
    ) {
      return;
    }
    setError(null);
    setDeletingName(name);
    startTransition(async () => {
      const r = await deleteOllamaModelAction(name);
      setDeletingName(null);
      if (r.ok) {
        onDeleted();
      } else {
        setError(r.error);
      }
    });
  }

  if (models.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-sol-ink/10 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Installed models
        </h4>
        <span className="font-mono text-[11px] text-sol-muted">
          {formatBytes(totalBytes)} total
        </span>
      </div>
      <ul className="divide-y divide-sol-ink/10">
        {models.map((m) => {
          const isActive = m.name === activeModel;
          const isDeleting = deletingName === m.name;
          return (
            <li
              key={m.name}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono text-xs font-bold text-sol-ink">
                    {m.name}
                  </code>
                  {isActive && (
                    <span className="rounded-full bg-sol-accent/15 px-1.5 text-[9px] font-black uppercase tracking-wider text-sol-accent">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex gap-2 text-[10px] text-sol-muted">
                  <span>{formatBytes(m.sizeBytes)}</span>
                  <span>·</span>
                  <span>{TIER_LABELS[m.tier] ?? m.tier}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(m.name)}
                disabled={pending || isDeleting || isActive}
                title={
                  isActive
                    ? "Switch to another model first — then this one can be deleted"
                    : "Delete model from disk"
                }
                className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 GB";
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(0)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}
