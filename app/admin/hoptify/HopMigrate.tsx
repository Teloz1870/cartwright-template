"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { migrateAction } from "./actions";
import type { MigrateResult } from "@/lib/hoptify/migrate";

const STEPS = [
  "Forbinder til Shopify…",
  "Befrier dine produkter fra abonnementet…",
  "Løfter dit look (farver + vibe)…",
  "Fjerner den månedlige husleje 💸…",
  "Pakker det hele ind i Cartwright…",
];

const input = "w-full rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 text-sm text-sol-ink";

export function HopMigrate() {
  const router = useRouter();
  const [storeUrl, setStoreUrl] = useState("");
  const [productUrls, setProductUrls] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<MigrateResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function migrate() {
    setResult(null);
    setRunning(true);
    setStep(0);
    timer.current = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    (async () => {
      try {
        const r = await migrateAction({
          storeUrl,
          productUrls: productUrls.split("\n").map((s) => s.trim()).filter(Boolean),
        });
        setResult(r);
        router.refresh();
      } finally {
        if (timer.current) clearInterval(timer.current);
        setRunning(false);
      }
    })();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-sol-muted">Din Shopify-shop-URL</span>
        <input className={input} placeholder="https://din-butik.myshopify.com" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-sol-muted">Produkt-URL'er (én pr. linje, valgfrit)</span>
        <textarea className={`${input} min-h-[90px] font-mono text-xs`} placeholder="https://din-butik.myshopify.com/products/…" value={productUrls} onChange={(e) => setProductUrls(e.target.value)} />
      </label>
      <p className="text-xs text-sol-muted">
        Med en gyldig URL + FIRECRAWL_API_KEY henter vi faktisk dit look + dine produkter.
        Uden: ren parodi-demo (Hoptify-designet anvendes stadig). Kun fra sider du ejer.
      </p>

      <button
        type="button"
        disabled={running || !storeUrl.trim()}
        onClick={migrate}
        className="self-start rounded-xl bg-sol-accent px-6 py-3 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {running ? "Migrerer…" : "Hop off Shopify →"}
      </button>

      {running && (
        <div className="rounded-xl border-2 border-sol-accent/30 bg-sol-accent/5 p-4">
          <p className="text-sm font-bold text-sol-ink">{STEPS[step]}</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sol-ink/10">
            <div className="h-full rounded-full bg-sol-accent transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm">
          <p className="font-black text-emerald-800">
            {result.mode === "real" ? "🎉 Du er hoppet af Shopify!" : "🎭 Hoptify-demo klar!"}
          </p>
          <ul className="mt-2 list-inside list-disc text-emerald-900">
            <li>Hoptify-design: {result.designApplied ? "anvendt" : "—"}</li>
            <li>Palette importeret: {result.paletteApplied ? "ja" : "nej (demo)"}</li>
            <li>Produkter importeret: {result.productsImported}</li>
          </ul>
          {result.notes.length > 0 && (
            <p className="mt-2 text-xs text-emerald-800/70">{result.notes.slice(0, 3).join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
