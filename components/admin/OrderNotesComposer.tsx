"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOrderNote } from "@/app/admin/ordrer/actions";

export default function OrderNotesComposer({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!body.trim()) return;
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await addOrderNote(orderId, body);
        if (res.ok) {
          setBody("");
          router.refresh();
        } else {
          setMessage(res.error);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-black uppercase text-sol-muted">
        Internal note
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Visible to admins only — shown in the timeline above."
        className="w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={add}
          disabled={isPending || !body.trim()}
          className="self-start rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream/60 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add note"}
        </button>
        {message && (
          <span className="text-sm font-bold text-sol-muted">{message}</span>
        )}
      </div>
    </div>
  );
}
