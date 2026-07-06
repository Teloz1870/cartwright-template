"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createZone, deleteZone, createRate, deleteRate } from "./actions";

type Rate = {
  id: string;
  name: string;
  feeDkk: number;
  freeThresholdDkk: number | null;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
};
type Zone = { id: string; name: string; countries: string; rates: Rate[] };

const input = "rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-2 py-1.5 text-sm text-sol-ink";

export function ShippingManager({ zones }: { zones: Zone[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [zoneName, setZoneName] = useState("");
  const [countries, setCountries] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-3">
        <input className={input} placeholder="Zone-navn (fx Norden)" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
        <input className={input} placeholder="Lande (DK, SE, NO)" value={countries} onChange={(e) => setCountries(e.target.value)} />
        <button
          type="button"
          disabled={pending}
          onClick={() => run(async () => { const r = await createZone(zoneName, countries); if (r.ok) { setZoneName(""); setCountries(""); } return r; })}
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Zone
        </button>
      </div>

      {zones.map((z) => (
        <ZoneCard key={z.id} zone={z} pending={pending} run={run} />
      ))}
    </div>
  );
}

function ZoneCard({ zone, pending, run }: { zone: Zone; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [rName, setRName] = useState("");
  const [fee, setFee] = useState("");
  const [free, setFree] = useState("");
  const [dMin, setDMin] = useState("2");
  const [dMax, setDMax] = useState("5");

  let countryList = "";
  try { countryList = (JSON.parse(zone.countries) as string[]).join(", "); } catch { /* ignore */ }

  return (
    <div className="rounded-xl border-2 border-sol-ink/10 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-black text-sol-ink">{zone.name} <span className="text-xs font-medium text-sol-muted">· {countryList}</span></h3>
        <button type="button" disabled={pending} onClick={() => run(() => deleteZone(zone.id))} className="text-xs font-bold text-red-600 hover:underline">Slet zone</button>
      </div>
      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {zone.rates.map((r) => (
          <li key={r.id} className="flex items-center justify-between border-t border-sol-ink/10 py-1">
            <span>
              {r.name} — {(r.feeDkk / 100).toFixed(0)} kr
              {r.freeThresholdDkk != null && <> (gratis over {(r.freeThresholdDkk / 100).toFixed(0)} kr)</>}
              {" "}· {r.deliveryDaysMin}–{r.deliveryDaysMax} dage
            </span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteRate(r.id))} className="text-xs text-red-600 hover:underline">Slet</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input className={`${input} w-32`} placeholder="Rate-navn" value={rName} onChange={(e) => setRName(e.target.value)} />
        <input className={`${input} w-20`} placeholder="Pris kr" value={fee} onChange={(e) => setFee(e.target.value)} />
        <input className={`${input} w-28`} placeholder="Gratis over kr" value={free} onChange={(e) => setFree(e.target.value)} />
        <input className={`${input} w-16`} placeholder="min" value={dMin} onChange={(e) => setDMin(e.target.value)} />
        <input className={`${input} w-16`} placeholder="max" value={dMax} onChange={(e) => setDMax(e.target.value)} />
        <button
          type="button"
          disabled={pending}
          onClick={() => run(async () => { const r = await createRate({ zoneId: zone.id, name: rName, feeKr: Number(fee), freeThresholdKr: free ? Number(free) : undefined, deliveryDaysMin: Number(dMin), deliveryDaysMax: Number(dMax) }); if (r.ok) { setRName(""); setFee(""); setFree(""); } return r; })}
          className="rounded-lg bg-sol-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Rate
        </button>
      </div>
    </div>
  );
}
