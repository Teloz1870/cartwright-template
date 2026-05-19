"use client";

import { useState, useTransition } from "react";
import { revertAuditEntryAction } from "./actions";

export default function RevertButton({
  auditLogId,
  toolName,
}: {
  auditLogId: string;
  toolName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function handleClick() {
    if (
      !confirm(
        `Rul '${toolName}' tilbage? Det vil forsøge at gendanne før-tilstanden fra audit-snapshottet.`,
      )
    ) {
      return;
    }
    setError(null);
    setDone(null);
    startTransition(async () => {
      const r = await revertAuditEntryAction(auditLogId);
      if (r.ok) setDone(r.summary);
      else setError(r.error);
    });
  }

  if (done) {
    return (
      <span className="text-xs font-bold text-green-700">✓ {done}</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full border border-sol-accent px-3 py-1 text-xs font-black uppercase tracking-wide text-sol-accent transition hover:bg-sol-accent hover:text-white disabled:opacity-50"
      >
        {pending ? "Ruller…" : "Rul tilbage"}
      </button>
      {error && <span className="max-w-[180px] text-right text-[10px] text-red-700">{error}</span>}
    </div>
  );
}
