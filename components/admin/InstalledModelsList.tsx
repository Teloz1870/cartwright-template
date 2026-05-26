"use client";

import { useState, useTransition } from "react";
import { deleteOllamaModelAction } from "@/app/admin/integrations/actions";

/**
 * Viser allerede pullede Ollama-modeller med størrelse + capability-tier +
 * delete-knap. Vises i LocalAiForm under model-dropdown'en når mindst én
 * model er pulled. Sammen med en "Total"-linje øverst så admin nemt kan se
 * hvor meget Ollama-cachen samlet fylder før de pull'er en ny stor model.
 *
 * Delete-knappen kalder deleteOllamaModelAction (server action) der både
 * fjerner modellen fra disk og logger til AuditLog. Confirm-dialog først
 * fordi delete ikke er reversible — kun re-pulling helper.
 */

type InstalledModel = {
  name: string;
  tier: string;
  sizeBytes: number;
  modifiedAt: string | null;
};

const TIER_LABELS: Record<string, string> = {
  "read-only": "Læs-only",
  "low-risk-writes": "Lav-risk writes",
  all: "Alle tools",
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
        `Slet ${name} (${gb} GB)?\n\nDette fjerner modellen fra din lokale Ollama. Du kan altid pulle den igen senere — men det tager tid og bandbreddet.`,
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
          Installerede modeller
        </h4>
        <span className="font-mono text-[11px] text-sol-muted">
          {formatBytes(totalBytes)} samlet
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
                      Aktiv
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
                    ? "Skift først til en anden model — så kan denne slettes"
                    : "Slet model fra disk"
                }
                className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              >
                {isDeleting ? "Sletter…" : "Slet"}
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
