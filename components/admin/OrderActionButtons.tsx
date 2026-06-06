"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resendConfirmation,
  sendShippingNotification,
  issueRefund,
} from "@/app/admin/ordrer/actions";

/**
 * Ordre-handlinger på detalje-siden: gensend kvittering, send forsendelses-
 * notifikation, og manuel refund (fuld eller delvis). `fulfillmentPdf` og
 * `returns` har egne paneler — dette er kerne-handlingerne under orderWorkspace.
 */
export default function OrderActionButtons({
  orderId,
  hasStripePayment,
}: {
  orderId: string;
  hasStripePayment: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [refundKr, setRefundKr] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await fn();
        setMessage(res.ok ? okMsg : (res.error ?? "Noget gik galt"));
        if (res.ok) router.refresh();
      })();
    });
  }

  function doRefund() {
    const trimmed = refundKr.trim();
    let amountOere: number | undefined;
    if (trimmed) {
      const kr = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(kr) || kr <= 0) {
        setMessage("Ugyldigt refund-beløb");
        return;
      }
      amountOere = Math.round(kr * 100);
    }
    run(
      () => issueRefund(orderId, { amountOere, reason: refundReason || undefined }),
      amountOere ? "Delvis refund udstedt" : "Fuld refund udstedt",
    );
  }

  return (
    <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-black text-sol-ink">Handlinger</h2>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => run(() => resendConfirmation(orderId), "Kvittering gensendt")}
          disabled={busy}
          className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream/60 disabled:opacity-50"
        >
          Gensend kvittering
        </button>
        <button
          onClick={() =>
            run(() => sendShippingNotification(orderId), "Forsendelses-notifikation sendt")
          }
          disabled={busy}
          className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream/60 disabled:opacity-50"
        >
          Send forsendelses-notifikation
        </button>
      </div>

      <div className="mt-5 border-t border-sol-ink/10 pt-4">
        <h3 className="mb-2 text-sm font-black uppercase text-sol-muted">Refund</h3>
        {hasStripePayment ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-bold text-sol-muted">
                Beløb (kr) — tom = fuld refund
              </label>
              <input
                value={refundKr}
                onChange={(e) => setRefundKr(e.target.value)}
                placeholder="fx 199,00"
                className="w-40 rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              />
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-bold text-sol-muted">Årsag</label>
              <input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-56 rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
              />
            </div>
            <button
              onClick={doRefund}
              disabled={busy}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {busy ? "Behandler…" : "Udsted refund"}
            </button>
          </div>
        ) : (
          <p className="text-sm font-semibold text-sol-muted">
            Ingen Stripe-betaling på denne ordre — refundér manuelt.
          </p>
        )}
        <p className="mt-2 text-xs text-sol-muted">
          Refund returnerer penge. Status finaliseres af Stripe-webhooken. Lager
          genindsættes IKKE af en refund — brug retur-panelet til det.
        </p>
      </div>

      {message && (
        <p className="mt-4 text-sm font-bold text-sol-muted">{message}</p>
      )}
    </section>
  );
}
