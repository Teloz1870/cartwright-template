"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSupplier, deleteSupplier } from "./actions";

type Supplier = { id: string; name: string; email: string | null; mode: string };

const input = "rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-2 py-1.5 text-sm text-sol-ink";

export function SupplierManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState("manual");
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Error.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-3">
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className={input} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="manual">Manual</option>
          <option value="email">Email + confirm</option>
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(async () => { const r = await createSupplier(name, email, mode); if (r.ok) { setName(""); setEmail(""); } return r; })}
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Supplier
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sol-muted">No suppliers yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg border-2 border-sol-ink/10 px-3 py-2">
              <span>
                <span className="font-bold text-sol-ink">{s.name}</span>
                {s.email && <span className="text-sol-muted"> · {s.email}</span>}
                <span className="ml-2 rounded-full bg-sol-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase">{s.mode}</span>
              </span>
              <button type="button" disabled={pending} onClick={() => run(() => deleteSupplier(s.id))} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
