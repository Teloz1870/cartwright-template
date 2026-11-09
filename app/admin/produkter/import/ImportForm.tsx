"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { importProductsAction } from "./actions";
import type { ImportResult } from "@/lib/products-csv";
import { CSV_IMPORT_MAX_LABEL, csvImportBodyBytes, csvImportSizeError } from "@/lib/products-csv-limit";

export function ImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      // Refused here, before the owner clicks Import: Next would answer a body over its
      // Server Action limit with an error page and save nothing (lib/products-csv-limit.ts).
      const tooLarge = csvImportSizeError(csvImportBodyBytes(text));
      setResult(null);
      setError(tooLarge);
      if (tooLarge) {
        input.value = "";
        setCsv("");
      } else {
        setCsv(text);
      }
    });
  }

  function run() {
    setResult(null);
    // Pasted text gets the same check the file picker does.
    const tooLarge = csvImportSizeError(csvImportBodyBytes(csv));
    setError(tooLarge);
    if (tooLarge) return;
    startTransition(async () => {
      try {
        const r = await importProductsAction(csv);
        if ("error" in r) {
          setError(r.error);
          return;
        }
        setResult(r);
        if (r.created || r.updated) router.refresh();
      } catch (err) {
        // A rejected action is a message here, not the error page.
        setError(
          `The import failed before a result came back (${err instanceof Error ? err.message : String(err)}). ` +
            "Check the product list; running it again is safe, since rows are upserted by slug.",
        );
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
      <p className="text-xs text-sol-ink/60">
        One import takes up to {CSV_IMPORT_MAX_LABEL}. Split a larger file into parts that each start
        with the header row.
      </p>
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

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

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
