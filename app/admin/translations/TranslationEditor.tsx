"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { saveTranslation } from "./actions";
import type { EntityTranslation } from "@/lib/translations";

export function TranslationEditor({ entity }: { entity: EntityTranslation }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [translating, setTranslating] = useState(false);
  const [en, setEn] = useState<Record<string, string>>(() => ({ ...entity.en }));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function autoTranslate() {
    setMsg(null);
    setTranslating(true);
    try {
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: entity.source, targetLocale: "en", sourceLocale: "da" }),
      });
      if (!res.ok) throw new Error("Auto-oversæt fejlede.");
      const data = (await res.json()) as Record<string, string>;
      setEn((prev) => {
        const next = { ...prev };
        for (const f of entity.fields) if (typeof data[f] === "string") next[f] = data[f];
        return next;
      });
      setMsg({ ok: true, text: "Auto-oversat — gennemse og gem." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Fejl." });
    } finally {
      setTranslating(false);
    }
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveTranslation(entity.type, entity.id, en);
      if (r.ok) {
        setMsg({ ok: true, text: "Gemt." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  const busy = pending || translating;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link href="/admin/translations" className="text-sm font-bold text-sol-accent hover:underline">
        ← Oversættelser
      </Link>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={autoTranslate}
          className="rounded-lg border-2 border-sol-accent px-4 py-2 text-sm font-bold text-sol-accent transition hover:bg-sol-accent/5 disabled:opacity-50"
        >
          {translating ? "Oversætter…" : "✨ Auto-oversæt → en"}
        </button>
      </div>

      {entity.fields.map((field) => (
        <div key={field} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-sol-muted">{field} (da)</span>
            <textarea
              readOnly
              value={entity.source[field] ?? ""}
              className="min-h-[80px] rounded-lg border-2 border-sol-ink/10 bg-sol-sand px-3 py-2 text-sm text-sol-muted"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-sol-muted">{field} (en)</span>
            <textarea
              value={en[field] ?? ""}
              disabled={busy}
              onChange={(e) => setEn((prev) => ({ ...prev, [field]: e.target.value }))}
              className="min-h-[80px] rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 text-sm text-sol-ink"
            />
          </label>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {pending ? "Gemmer…" : "Gem"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
