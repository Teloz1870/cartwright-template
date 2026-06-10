"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Prompt → design (AI). Describe a design in words → POST /api/admin/designs/
 * generate → a real DesignPack is scaffolded. Requires an Anthropic key
 * (structured output); shows the clear "configure a key" error otherwise.
 */
export default function DesignPromptForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function generate() {
    if (prompt.trim().length < 8) return;
    setMsg(null);
    start(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/designs/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = (await res.json()) as { ok?: boolean; slug?: string; error?: string };
          if (data.ok) {
            setMsg({ ok: true, text: `✓ Created design "${data.slug}". Refresh the page to see it in the list and preview it.` });
            router.refresh();
          } else {
            setMsg({ ok: false, text: data.error ?? "Generation failed." });
          }
        } catch (e) {
          setMsg({ ok: false, text: e instanceof Error ? e.message : "Generation failed." });
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-sol-ink/10 bg-white p-5 dark:border-white/10 dark:bg-sol-sand">
      <div>
        <h3 className="text-base font-black text-sol-ink dark:text-white">
          ✨ Describe a design (AI)
        </h3>
        <p className="mt-1 text-sm font-medium text-sol-muted dark:text-white/60">
          Describe the look you want — the AI authors a real design pack you can
          preview, edit, and publish. Requires an Anthropic key (set in{" "}
          <code className="rounded bg-sol-ink/5 px-1 py-0.5 text-xs dark:bg-white/10">/admin/integrations</code>).
        </p>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="e.g. A warm, editorial architecture-studio site — cream paper, charcoal text, a single rust accent, a big serif display, generous whitespace."
        className="w-full rounded-xl border border-sol-ink/15 bg-sol-sand/40 px-3 py-2 text-sm text-sol-ink outline-none focus-visible:border-sol-accent dark:border-white/15 dark:bg-black/20 dark:text-white"
      />
      {msg ? (
        <div
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            msg.ok
              ? "border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {msg.text}
        </div>
      ) : null}
      <button
        type="button"
        onClick={generate}
        disabled={pending || prompt.trim().length < 8}
        className="self-start rounded-full bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate design"}
      </button>
    </div>
  );
}
