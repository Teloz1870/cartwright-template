"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPriceDkk } from "@/lib/format";
import {
  createReturn,
  approveReturn,
  rejectReturn,
  receiveAndRestock,
  refundReturn,
} from "@/app/admin/ordrer/actions";
import type { OrderItemView, ReturnView } from "@/app/admin/ordrer/types";

const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  received: "Received",
  refunded: "Refunded",
  rejected: "Rejected",
  closed: "Closed",
};

export default function OrderReturnsPanel({
  orderId,
  items,
  returns,
  hasStripePayment,
}: {
  orderId: string;
  items: OrderItemView[];
  returns: ReturnView[];
  hasStripePayment: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundKr, setRefundKr] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await fn();
        setMessage(res.ok ? okMsg : (res.error ?? "Something went wrong"));
        if (res.ok) router.refresh();
      })();
    });
  }

  function submitNewReturn() {
    const chosen = items
      .map((it) => ({ orderItemId: it.id, quantity: qty[it.id] ?? 0 }))
      .filter((x) => x.quantity > 0);
    if (chosen.length === 0) {
      setMessage("Select at least one item");
      return;
    }
    if (!reason.trim()) {
      setMessage("Enter a reason");
      return;
    }
    run(() => createReturn(orderId, { items: chosen, reason }), "Return created");
    setQty({});
    setReason("");
  }

  function doRefund(returnId: string) {
    const kr = Number((refundKr[returnId] ?? "").replace(",", "."));
    if (!Number.isFinite(kr) || kr <= 0) {
      setMessage("Invalid refund amount");
      return;
    }
    run(() => refundReturn(returnId, Math.round(kr * 100)), "Return refunded");
  }

  return (
    <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-black text-sol-ink">Returns</h2>

      {/* Eksisterende returneringer */}
      {returns.length > 0 && (
        <ul className="mb-6 space-y-3">
          {returns.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-sol-ink/10 bg-white/60 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex rounded-full bg-sol-cream px-2.5 py-0.5 text-xs font-bold text-sol-ink">
                  {RETURN_STATUS_LABELS[r.status] ?? r.status}
                </span>
                <span className="text-xs text-sol-muted">
                  {r.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                  {r.refundDkk > 0 && ` · refund ${formatPriceDkk(r.refundDkk)}`}
                  {r.restocked && " · restocked"}
                </span>
              </div>
              <p className="text-sm text-sol-ink">{r.reason}</p>
              <ul className="mt-1 text-xs text-sol-muted">
                {r.items.map((i) => (
                  <li key={i.id}>
                    {i.productName} × {i.quantity}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                {r.status === "requested" && (
                  <>
                    <button
                      onClick={() => run(() => approveReturn(r.id), "Return approved")}
                      disabled={busy}
                      className="rounded-lg bg-sol-accent px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => run(() => rejectReturn(r.id, ""), "Return rejected")}
                      disabled={busy}
                      className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {r.status === "approved" && (
                  <button
                    onClick={() =>
                      run(() => receiveAndRestock(r.id), "Return received + restocked")
                    }
                    disabled={busy}
                    className="rounded-lg bg-sol-accent px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                  >
                    Receive + restock
                  </button>
                )}
                {(r.status === "approved" || r.status === "received") &&
                  hasStripePayment && (
                    <div className="flex items-end gap-2">
                      <input
                        value={refundKr[r.id] ?? ""}
                        onChange={(e) =>
                          setRefundKr((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="kr"
                        className="w-24 rounded-lg border border-sol-ink/15 bg-transparent px-2 py-1.5 text-xs font-semibold text-sol-ink focus:border-sol-accent focus:outline-none"
                      />
                      <button
                        onClick={() => doRefund(r.id)}
                        disabled={busy}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                      >
                        Refund
                      </button>
                    </div>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Opret ny retur */}
      <div className="border-t border-sol-ink/10 pt-4">
        <h3 className="mb-3 text-sm font-black uppercase text-sol-muted">
          Create return
        </h3>
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-sol-ink">
                {it.productName}{" "}
                <span className="text-sol-muted">(ordered {it.quantity})</span>
              </span>
              <input
                type="number"
                min={0}
                max={it.quantity}
                value={qty[it.id] ?? 0}
                onChange={(e) =>
                  setQty((prev) => ({
                    ...prev,
                    [it.id]: Math.max(
                      0,
                      Math.min(it.quantity, Number(e.target.value) || 0),
                    ),
                  }))
                }
                className="w-20 rounded-lg border border-sol-ink/15 bg-transparent px-2 py-1.5 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for return"
          className="mt-3 w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
        />
        <button
          onClick={submitNewReturn}
          disabled={busy}
          className="mt-3 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create return"}
        </button>
      </div>

      {message && (
        <p className="mt-4 text-sm font-bold text-sol-muted">{message}</p>
      )}
    </section>
  );
}
