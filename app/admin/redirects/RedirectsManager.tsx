"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { RedirectImportError, RedirectImportPlan } from "@/lib/redirects/import";
import {
  addRedirect,
  importRedirectsFromCsv,
  previewRedirectImport,
  removeRedirect,
} from "./actions";

type Redirect = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
};

const input = "rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-3 py-2 text-sm text-sol-ink";
const btn =
  "rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-50";

type Notice = { tone: "ok" | "warn" | "error"; text: string; errors?: RedirectImportError[] };
const TONE = { ok: "text-emerald-700", warn: "text-amber-700", error: "text-red-600" } as const;
const rows = (n: number) => `${n} row${n === 1 ? "" : "s"}`;

/** Per-line errors — the same list after the preview and after the import. */
function ErrorLines({ errors }: { errors: RedirectImportError[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="mt-2 list-disc pl-5 text-red-600">
      {errors.map((e) => (
        <li key={`${e.line}-${e.reason}`}>{e.line > 0 ? `Line ${e.line}: ` : ""}{e.reason}</li>
      ))}
    </ul>
  );
}

export function RedirectsManager({ initial }: { initial: Redirect[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState(301);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csv, setCsv] = useState("");
  // The preview is keyed by the text it was computed from: a response that
  // lands after the owner kept typing belongs to the OLD text, so it neither
  // shows nor arms the Import button, and the import sends exactly the text
  // that was previewed — never different rows than the owner reviewed.
  const [preview, setPreview] = useState<{ csv: string; plan: RedirectImportPlan } | null>(null);
  const live = preview && preview.csv === csv ? preview : null;
  const plan = live?.plan ?? null;
  const [importMsg, setImportMsg] = useState<Notice | null>(null);

  function runPreview() {
    setImportMsg(null);
    const text = csv;
    startTransition(async () => {
      const r = await previewRedirectImport(text);
      if (r.ok) setPreview({ csv: text, plan: r.plan });
      else setImportMsg({ tone: "error", text: r.error });
    });
  }

  function runImport() {
    if (!live) return;
    setImportMsg(null);
    const text = live.csv;
    startTransition(async () => {
      const r = await importRedirectsFromCsv(text);
      if (!r.ok) {
        setImportMsg({ tone: "error", text: r.error });
        return;
      }
      const { imported, errors } = r.result;
      // The preview is stale once rows are saved (and must not re-fire the
      // import); the result carries the errors, and the file stays until every
      // line landed so the owner can fix the ones that did not.
      setPreview(null);
      if (imported === 0) {
        setImportMsg({ tone: "warn", text: `Nothing imported — ${rows(errors.length)} had errors.`, errors });
        return;
      }
      const skipped = errors.length ? `; skipped ${rows(errors.length)} with errors` : "";
      setImportMsg({ tone: "ok", text: `Imported ${imported} redirects${skipped}.`, errors });
      if (errors.length === 0) setCsv("");
      router.refresh();
    });
  }

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await addRedirect(from, to, status);
      if (r.ok) {
        setFrom("");
        setTo("");
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-sol-muted">Fra-sti</span>
          <input className={input} placeholder="/gammel-side" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-sol-muted">To (path or URL)</span>
          <input className={input} placeholder="/ny-side" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-sol-muted">Status</span>
          <select className={input} value={status} onChange={(e) => setStatus(Number(e.target.value))}>
            <option value={301}>301</option>
            <option value={302}>302</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !from.trim() || !to.trim()}
          onClick={submit}
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}

      <section className="flex flex-col gap-3 rounded-xl border-2 border-sol-ink/10 p-4">
        <h2 className="text-xs font-bold uppercase text-sol-muted">Import CSV</h2>
        <p className="text-sm text-sol-muted">
          One redirect per line as <code>from,to,status</code> — header and status optional (301 by default,
          302 allowed), <code>#</code> lines ignored. Preview first; nothing is saved until you import. An
          existing source is replaced; chains and loops are refused, so point every old URL at its final destination,
          written without the /da or /en prefix (the redirect keeps the reader&apos;s locale).
        </p>
        <textarea
          className={`${input} min-h-32 font-mono text-xs`}
          placeholder={"/old-page,/new-page\n/sale,/campaign,302"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !csv.trim()} onClick={runPreview} className={btn}>
            Preview (dry run)
          </button>
          <button type="button" disabled={pending || !plan?.valid.length} onClick={runImport} className={btn}>
            Import {plan?.valid.length ?? 0} redirects
          </button>
        </div>
        {plan && (
          <div className="text-sm text-sol-ink">
            <p>
              {plan.summary.valid} valid · {plan.summary.invalid} with errors · {plan.summary.replaces} replace an
              existing redirect
            </p>
            <ErrorLines errors={plan.errors} />
          </div>
        )}
        {importMsg && (
          <div className={`text-sm ${TONE[importMsg.tone]}`}>
            <p>{importMsg.text}</p>
            <ErrorLines errors={importMsg.errors ?? []} />
          </div>
        )}
      </section>

      {initial.length === 0 ? (
        <p className="text-sol-muted">No redirects yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
              <tr>
                <th className="px-3 py-2">Fra</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {initial.map((r) => (
                <tr key={r.id} className="border-t border-sol-ink/10">
                  <td className="px-3 py-2 font-mono text-xs text-sol-ink">{r.fromPath}</td>
                  <td className="px-3 py-2 font-mono text-xs text-sol-muted">{r.toPath}</td>
                  <td className="px-3 py-2">{r.statusCode}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await removeRedirect(r.id);
                          router.refresh();
                        })
                      }
                      className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
