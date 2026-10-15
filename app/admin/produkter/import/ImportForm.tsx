"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { importProductsAction } from "./actions";
import type { ImportResult } from "@/lib/products-csv";

export function ImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsv);
  }

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await importProductsAction(csv);
      setResult(r);
      if (r.created || r.updated) router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="…or paste CSV here (header on the first line)"
        className="min-h-[200px] w-full rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 font-mono text-xs text-sol-ink"
      />
      <div>
        <button
          type="button"
          disabled={pending || !csv.trim()}
          onClick={run}
          className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>

      {result && (
        <div className="rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4 text-sm">
          <p className="font-bold text-sol-ink">
            {result.created} created · {result.updated} updated · {result.errors.length} errors
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-red-600">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>Row {e.row}: {e.error}</li>
              ))}
              {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
