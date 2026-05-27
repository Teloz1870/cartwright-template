"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveReviewAction,
  rejectReviewAction,
  spamReviewAction,
} from "../actions";

export default function ModerationActions({
  reviewId,
  initialNote,
}: {
  reviewId: string;
  initialNote: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function run(action: typeof approveReviewAction, kind: string) {
    setFeedback(null);
    startTransition(() => {
      void (async () => {
        const result = await action(reviewId, note);
        if (!result.ok) {
          setFeedback(`Fejl: ${result.error}`);
          return;
        }
        setFeedback(`${kind} ✓`);
        router.refresh();
      })();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-black uppercase tracking-wide text-sol-muted">
          Moderator-note (intern)
        </span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
          placeholder="Hvorfor approved/rejected/spam? Synlig kun internt."
        />
      </label>

      {feedback && (
        <p className={`text-xs font-black ${feedback.startsWith("Fejl") ? "text-rose-700" : "text-emerald-700"}`}>
          {feedback}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(approveReviewAction, "Godkendt")}
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
        >
          Godkend
        </button>
        <button
          type="button"
          onClick={() => run(rejectReviewAction, "Afvist")}
          disabled={isPending}
          className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent disabled:opacity-50"
        >
          Afvis
        </button>
        <button
          type="button"
          onClick={() => run(spamReviewAction, "Spam")}
          disabled={isPending}
          className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
        >
          Spam
        </button>
      </div>
    </div>
  );
}
