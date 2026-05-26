"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Adapter = "cartwright" | "stitch" | "claude-design";

/**
 * Drag-drop upload for design.md (eller Claude Design .tsx for adapter-flow).
 * POST'er FormData til /api/admin/designs/import med ?adapter=<choice>.
 *
 * Auto-detect: hvis filen er .md OG indeholder `schema: cartwright-design-v1`
 * frontmatter, vi forsætter "cartwright"-adapter (= ingen translation).
 * Hvis Stitch-frontmatter detected → "stitch". Hvis .tsx fil → "claude-design".
 */
export default function DesignUploader() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adapter, setAdapter] = useState<Adapter | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    slug: string;
    files: string[];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("adapter", adapter);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/designs/import", {
            method: "POST",
            body: fd,
          });
          const body = (await res.json()) as
            | { ok: true; slug: string; files: string[] }
            | { ok: false; error: string };
          if (body.ok) {
            setSuccess({ slug: body.slug, files: body.files });
            router.refresh();
          } else {
            setError(body.error);
          }
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-xs font-black uppercase tracking-widest text-sol-muted dark:text-white/60">
          Adapter
        </label>
        <select
          value={adapter}
          onChange={(e) => setAdapter(e.target.value as Adapter | "auto")}
          className="rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-1.5 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25 dark:border-white/15 dark:text-white"
        >
          <option value="auto">Auto-detect</option>
          <option value="cartwright">cartwright-design-v1 (direct)</option>
          <option value="stitch">Gemini Stitch</option>
          <option value="claude-design">Claude Design / v0 / Loveable</option>
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-sol-sand ${
          isDragging
            ? "border-sol-accent bg-sol-accent/5"
            : "border-sol-ink/20 hover:border-sol-ink/40 dark:border-white/20 dark:hover:border-white/40"
        } ${pending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md,.tsx,.jsx,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
        />
        <div className="text-3xl">📂</div>
        <p className="text-sm font-bold text-sol-ink dark:text-white">
          {pending ? "Importing..." : "Drag-drop design.md eller klik for at vælge"}
        </p>
        <p className="text-xs text-sol-muted dark:text-white/60">
          .md (Cartwright / Stitch) eller .tsx (Claude Design / v0)
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <pre className="whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ Design "<code>{success.slug}</code>" importeret. Filer oprettet:
          <ul className="mt-2 list-disc pl-5 font-mono text-xs">
            {success.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2">
            Den nye design er nu valgbar i listen ovenfor. Klik for at aktivere
            den.
          </p>
        </div>
      ) : null}
    </div>
  );
}
