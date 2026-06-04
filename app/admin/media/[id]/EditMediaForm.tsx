"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMediaAction,
  retryAltAction,
  updateMediaAction,
  type UpdateMediaInput,
} from "../actions";

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

type Props = {
  assetId: string;
  initialValues: UpdateMediaInput & { [K in keyof UpdateMediaInput]: string };
  canDelete: boolean;
};

export default function EditMediaForm({ assetId, initialValues, canDelete }: Props) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [savingState, startSaving] = useTransition();
  const [retryState, startRetry] = useTransition();
  const [deleteState, startDelete] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function field<K extends keyof typeof values>(key: K) {
    return {
      value: values[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValues((v) => ({ ...v, [key]: e.target.value })),
    };
  }

  function handleSave() {
    setFeedback(null);
    startSaving(() => {
      void (async () => {
        const result = await updateMediaAction(assetId, {
          altDa: values.altDa,
          altEn: values.altEn,
          title: values.title,
          caption: values.caption,
          geoSnippet: values.geoSnippet,
          suggestedSlug: values.suggestedSlug,
        });
        if (!result.ok) {
          setFeedback(`Fejl: ${result.error}`);
          return;
        }
        setFeedback("Gemt.");
        router.refresh();
      })();
    });
  }

  function handleRetry() {
    if (!confirm("Reset AI-status så cron'en genererer nye værdier? Dine manuelle ændringer bevares indtil næste run overskriver dem.")) {
      return;
    }
    setFeedback(null);
    startRetry(() => {
      void (async () => {
        const result = await retryAltAction(assetId);
        if (!result.ok) {
          setFeedback(`Retry fejlede: ${result.error}`);
          return;
        }
        setFeedback("Reset til pending. Ny generation indenfor 5 min.");
        router.refresh();
      })();
    });
  }

  function handleDelete() {
    if (!confirm("Slet denne MediaAsset permanent?")) return;
    setFeedback(null);
    startDelete(() => {
      void (async () => {
        const result = await deleteMediaAction(assetId);
        if (!result.ok) {
          setFeedback(`Slet fejlede: ${result.error}`);
          return;
        }
        router.push("/admin/media");
      })();
    });
  }

  const busy = savingState || retryState || deleteState;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-black text-sol-ink">Rediger metadata</h2>

      <Field label="Alt-tekst (dansk)" hint="Beskrivende, max 125 tegn">
        <input
          type="text"
          maxLength={125}
          className={inputClass}
          {...field("altDa")}
        />
      </Field>

      <Field label="Alt-tekst (engelsk)" hint="Same, ≤125 chars">
        <input
          type="text"
          maxLength={125}
          className={inputClass}
          {...field("altEn")}
        />
      </Field>

      <Field label="Titel" hint="6-10 ord, læselig overskrift">
        <input
          type="text"
          maxLength={120}
          className={inputClass}
          {...field("title")}
        />
      </Field>

      <Field label="Caption" hint="1-2 sætninger, max 200 tegn">
        <textarea
          rows={2}
          maxLength={200}
          className={`${inputClass} resize-none`}
          {...field("caption")}
        />
      </Field>

      <Field label="GEO-snippet" hint="Optimeret til LLM-søgemaskine-indeksering">
        <textarea
          rows={3}
          maxLength={300}
          className={`${inputClass} resize-none`}
          {...field("geoSnippet")}
        />
      </Field>

      <Field label="Foreslået filename-slug" hint="kebab-case, ≤60 tegn">
        <input
          type="text"
          maxLength={60}
          className="sol-input font-mono text-xs"
          {...field("suggestedSlug")}
        />
      </Field>

      {feedback && (
        <p className={`text-xs font-black ${feedback.startsWith("Fejl") || feedback.includes("fejlede") ? "text-rose-700" : "text-emerald-700"}`}>
          {feedback}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {savingState ? "Gemmer…" : "Gem ændringer"}
        </button>
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent disabled:opacity-50"
        >
          {retryState ? "Resetter…" : "Genkør AI"}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {deleteState ? "Sletter…" : "Slet asset"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-sol-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10px] text-sol-muted">{hint}</span>}
    </label>
  );
}
