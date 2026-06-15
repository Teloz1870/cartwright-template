"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addRedirect, removeRedirect } from "./actions";

type Redirect = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
};

const input = "rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-3 py-2 text-sm text-sol-ink";

export function RedirectsManager({ initial }: { initial: Redirect[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState(301);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await addRedirect(from, to, status);
      if (r.ok) {
        setFrom("");
        setTo("");
        setMsg({ ok: true, text: "Gemt." });
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
          <span className="text-xs font-bold uppercase text-sol-muted">Til (sti eller URL)</span>
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
          Tilføj
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}

      {initial.length === 0 ? (
        <p className="text-sol-muted">Ingen redirects endnu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
              <tr>
                <th className="px-3 py-2">Fra</th>
                <th className="px-3 py-2">Til</th>
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
                      Slet
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
