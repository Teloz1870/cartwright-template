"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_LABELS,
  isOrderStatus,
  legalNextStates,
  statusColor,
  statusLabel,
} from "@/lib/orders/status";
import { updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import type { OrderNoteView } from "@/app/admin/ordrer/types";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

function authorLabel(actor: string): string {
  if (actor.startsWith("user:") || actor.startsWith("operator-chat:"))
    return "Admin";
  if (actor.startsWith("stripe-webhook")) return "Stripe";
  if (actor.startsWith("system:")) return "System";
  return actor;
}

export default function OrderTimeline({
  orderId,
  currentStatus,
  notes,
}: {
  orderId: string;
  currentStatus: string;
  notes: OrderNoteView[];
}) {
  const router = useRouter();
  const nextStates = isOrderStatus(currentStatus)
    ? legalNextStates(currentStatus)
    : [];
  const [target, setTarget] = useState<string>(nextStates[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeStatus() {
    if (!target) return;
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await updateOrderStatusAdmin(orderId, target);
        setMessage(res.ok ? "Status opdateret" : res.error);
        if (res.ok) router.refresh();
      })();
    });
  }

  return (
    <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-sol-ink">Status & timeline</h2>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusColor(currentStatus)}`}
        >
          {statusLabel(currentStatus)}
        </span>
      </div>

      {nextStates.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-black uppercase text-sol-muted">
              Skift status til
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
            >
              {nextStates.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={changeStatus}
            disabled={isPending}
            className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {isPending ? "Opdaterer…" : "Opdatér"}
          </button>
          {message && (
            <span className="text-sm font-bold text-sol-muted">{message}</span>
          )}
        </div>
      ) : (
        <p className="mb-5 text-sm font-semibold text-sol-muted">
          Ingen videre status-skift mulige (terminal eller ukendt status).
        </p>
      )}

      <ol className="space-y-3 border-l-2 border-sol-ink/10 pl-4">
        {notes.length === 0 && (
          <li className="text-sm italic text-sol-muted">Ingen aktivitet endnu.</li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="relative">
            <span
              className={`absolute -left-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full ${
                n.type === "system" ? "bg-sol-accent/60" : "bg-sol-ink/40"
              }`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p
                className={`text-sm ${n.type === "private" ? "font-bold text-sol-ink" : "font-semibold text-sol-ink/90"}`}
              >
                {n.body}
              </p>
              <span className="text-xs text-sol-muted">
                {authorLabel(n.author)} · {dateFormatter.format(new Date(n.createdAt))}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
