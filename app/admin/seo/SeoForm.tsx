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
      setMsg(r.ok ? "Saved — takes effect in robots.txt within 30 sec." : r.error);
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
          <span className="block text-sm font-bold text-sol-ink">Block indexing (noindex)</span>
          <span className="block text-xs text-sol-muted">
            Ask ALL search engines not to index the site. For staging / while you
            build. robots.txt disallow + meta robots noindex.
          </span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
        <legend className="sr-only">AI crawler policy</legend>
        <span className="text-sm font-bold text-sol-ink">AI crawlers</span>
        <span className="-mt-2 text-xs text-sol-muted">
          Three kinds of AI bots visit a shop: <strong>search</strong> (index you for AI
          answers — citations), <strong>agent</strong> (shop on a customer&apos;s behalf —
          revenue) and <strong>training</strong> (harvest for model training).
        </span>
        {(
          [
            {
              value: "allow",
              title: "Allow all (recommended)",
              body: "Welcome search, agent and training crawlers in robots.txt. Maximum AI visibility.",
            },
            {
              value: "block-training",
              title: "Block training crawlers only",
              body: "Reject GPTBot, ClaudeBot, Google-Extended and other training bots — while AI search and customers' shopping agents stay welcome.",
            },
            {
              value: "block",
              title: "Block all AI crawlers",
              body: "Reject every AI bot, including AI search and shopping agents. Regular search engines (Google) may still index.",
            },
          ] as const
        ).map((opt) => (
          <label key={opt.value} className="flex items-start gap-3">
            <input
              type="radio"
              name="aiCrawlers"
              checked={s.aiCrawlers === opt.value}
              disabled={pending}
              onChange={() => apply({ aiCrawlers: opt.value })}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="block text-sm font-bold text-sol-ink">{opt.title}</span>
              <span className="block text-xs text-sol-muted">{opt.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {msg && <p className="text-sm text-sol-muted">{msg}</p>}
    </div>
  );
}
