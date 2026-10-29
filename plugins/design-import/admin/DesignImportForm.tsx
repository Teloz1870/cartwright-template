"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { extractAction, applyAction } from "./actions";
import type { DesignTokens } from "@/plugins/design-import/lib/extract";

const input = "w-full rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-3 py-2 text-sm text-sol-ink";

export function DesignImportForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [tokens, setTokens] = useState<DesignTokens | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function extract() {
    setMsg(null);
    setTokens(null);
    startTransition(async () => {
      const r = await extractAction(url);
      if (r.ok) setTokens(r.tokens);
      else setMsg({ ok: false, text: r.error });
    });
  }

  function apply() {
    if (!tokens) return;
    setMsg(null);
    startTransition(async () => {
      const r = await applyAction(tokens.palette);
      if (r.ok) {
        setMsg({ ok: true, text: "Applied — the theme takes effect within 30 sec." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex gap-2">
        <input className={input} placeholder="https://inspiration.dk" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          disabled={pending || !url.trim()}
          onClick={extract}
          className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {pending ? "Loading…" : "Import"}
        </button>
      </div>
      <p className="text-xs text-sol-muted">
        Pulls a color palette + typography hint + tone from the site. Layout is not
        copied (design vibe only). Requires FIRECRAWL_API_KEY.
      </p>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}

      {tokens && (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-sol-muted">Palette</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {Object.entries(tokens.palette).map(([k, v]) => (
                <div key={k} className="flex flex-col items-center gap-1">
                  <span className="h-12 w-12 rounded-lg border border-sol-ink/10" style={{ background: v }} />
                  <span className="text-[10px] font-bold text-sol-muted">{k}</span>
                  <span className="text-[10px] text-sol-muted">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-sol-muted">
            Fonts: {tokens.fonts.heading} / {tokens.fonts.body}
            {tokens.toneKeywords.length > 0 && <> · Tone: {tokens.toneKeywords.join(", ")}</>}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={apply}
            className="self-start rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply palette"}
          </button>
        </div>
      )}
    </div>
  );
}
