"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createMissingLegalPages } from "./actions";

type LegalStatus = { slug: string; title: string; exists: boolean };

export function LegalPagesPanel({ initial }: { initial: LegalStatus[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const missing = initial.filter((p) => !p.exists);

  return (
    <div className="rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
      <h2 className="mb-1 text-lg font-black text-sol-ink">Juridiske sider</h2>
      <p className="mb-3 text-xs text-sol-muted">
        The footer links to <code className="rounded bg-sol-ink/5 px-1">/&lt;locale&gt;/privacy</code>,{" "}
        <code className="rounded bg-sol-ink/5 px-1">/info/terms</code> and{" "}
        <code className="rounded bg-sol-ink/5 px-1">/info/cookies</code>. Mangler de,
        create them here (boilerplate you should review). Existing pages are untouched.
      </p>
      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {initial.map((p) => (
          <li key={p.slug} className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                p.exists ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {p.exists ? "exists" : "missing"}
            </span>
            <span className="text-sol-ink">{p.title}</span>
            <code className="text-[11px] text-sol-muted">/info/{p.slug}</code>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending || missing.length === 0}
        onClick={() =>
          startTransition(async () => {
            const r = await createMissingLegalPages();
            setMsg(
              r.created.length
                ? `Created: ${r.created.join(", ")}.`
                : "No missing pages.",
            );
            router.refresh();
          })
        }
        className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-50"
      >
        {pending
          ? "Creating…"
          : missing.length
            ? `Create ${missing.length} missing page(s)`
            : "All pages exist"}
      </button>
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
