"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { runGeoNow } from "./actions";

export function RunGeoButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await runGeoNow();
            setMsg(`AI citation: ${r.cited}/${r.total} prompts mentioned the shop.`);
            router.refresh();
          })
        }
        className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {pending ? "Measuring…" : "Measure GEO now"}
      </button>
      {msg && <span className="text-sm text-sol-muted">{msg}</span>}
    </div>
  );
}
