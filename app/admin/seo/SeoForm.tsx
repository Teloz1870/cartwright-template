"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setSeo } from "./actions";
import type { SeoSettings } from "@/lib/seo-settings";

export function SeoForm({ initial }: { initial: SeoSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [s, setS] = useState<SeoSettings>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  function apply(patch: Partial<SeoSettings>) {
    setS((prev) => ({ ...prev, ...patch }));
    setMsg(null);
    startTransition(async () => {
      const r = await setSeo(patch);
      setMsg(r.ok ? "Gemt — slår igennem på robots.txt inden for 30 sek." : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <label className="flex items-start gap-3 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
        <input
          type="checkbox"
          checked={s.indexing === "noindex"}
          disabled={pending}
          onChange={(e) => apply({ indexing: e.target.checked ? "noindex" : "public" })}
          className="mt-1 h-5 w-5"
        />
        <span>
          <span className="block text-sm font-bold text-sol-ink">Bloker indeksering (noindex)</span>
          <span className="block text-xs text-sol-muted">
            Bed ALLE søgemaskiner om ikke at indeksere sitet. Til staging / mens du
            bygger. robots.txt disallow + meta robots noindex.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
        <input
          type="checkbox"
          checked={s.aiCrawlers === "block"}
          disabled={pending}
          onChange={(e) => apply({ aiCrawlers: e.target.checked ? "block" : "allow" })}
          className="mt-1 h-5 w-5"
        />
        <span>
          <span className="block text-sm font-bold text-sol-ink">Bloker AI-crawlere</span>
          <span className="block text-xs text-sol-muted">
            Afvis GPTBot, ClaudeBot, PerplexityBot m.fl. i robots.txt — mens
            almindelige søgemaskiner (Google) stadig må indeksere. "Vil ikke trænes på".
          </span>
        </span>
      </label>

      {msg && <p className="text-sm text-sol-muted">{msg}</p>}
    </div>
  );
}
