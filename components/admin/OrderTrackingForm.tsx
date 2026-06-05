"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTracking } from "@/app/admin/ordrer/actions";

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";
const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

/** YYYY-MM-DD til <input type=date>, eller "" hvis null. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function OrderTrackingForm({
  orderId,
  carrier,
  trackingNumber,
  trackingUrl,
  estDeliveryFrom,
  estDeliveryTo,
}: {
  orderId: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estDeliveryFrom: string | null;
  estDeliveryTo: string | null;
}) {
  const router = useRouter();
  const [c, setC] = useState(carrier ?? "");
  const [num, setNum] = useState(trackingNumber ?? "");
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [from, setFrom] = useState(toDateInput(estDeliveryFrom));
  const [to, setTo] = useState(toDateInput(estDeliveryTo));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await setTracking(orderId, {
          carrier: c,
          trackingNumber: num,
          trackingUrl: url,
          estDeliveryFrom: from || undefined,
          estDeliveryTo: to || undefined,
        });
        setMessage(res.ok ? "Tracking gemt" : res.error);
        if (res.ok) router.refresh();
      })();
    });
  }

  return (
    <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-black text-sol-ink">Forsendelse & tracking</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Fragtfirma</label>
          <input
            value={c}
            onChange={(e) => setC(e.target.value)}
            placeholder="GLS / PostNord / DAO…"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Tracking-nummer</label>
          <input
            value={num}
            onChange={(e) => setNum(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Tracking-URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Forventet levering fra</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Forventet levering til</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {isPending ? "Gemmer…" : "Gem tracking"}
        </button>
        {message && (
          <span className="text-sm font-bold text-sol-muted">{message}</span>
        )}
      </div>
    </section>
  );
}
