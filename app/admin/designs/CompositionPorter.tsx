"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Palette = {
  accent: string;
  accentDeep: string;
  cream: string;
  sand: string;
  ink: string;
  muted: string;
};

type Preview = {
  name: string;
  description: string;
  skin: string;
  palette: Palette | null;
  identity: Record<string, string> | null;
  voiceFields: number;
  chrome: { headerKey?: string; footerKey?: string } | null;
  scene: string | null;
  homepageSections: number;
};

type Applied = {
  name: string;
  appliedSkin: string;
  appliedPalette: boolean;
  appliedScene: string | null;
  fields: number;
  appliedHomepage: string | null;
  skipped: string[];
};

/**
 * Mixer 2.0 Phase 2 — export/import the composed look as ONE file.
 *
 * Export is a plain link to GET /api/admin/compositions/export (the server
 * streams a cartwright-composition-v1 JSON attachment). Import mirrors the
 * DesignUploader "confirm before import" flow: choose file → POST dryRun=true
 * → validated preview card → confirm → real POST (one atomic, audited apply).
 */
export default function CompositionPorter() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 1: dry-run → validated preview.
  function handleFile(file: File) {
    setError(null);
    setApplied(null);
    setPreview(null);
    setPendingFile(file);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("dryRun", "true");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/compositions/import", {
            method: "POST",
            body: fd,
          });
          const body = (await res.json()) as
            | { ok: true; preview: Preview }
            | { ok: false; error: string };
          if (body.ok) setPreview(body.preview);
          else setError(body.error);
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    });
  }

  // Step 2: confirm → atomic apply.
  function confirmApply() {
    if (!pendingFile) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", pendingFile);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/compositions/import", {
            method: "POST",
            body: fd,
          });
          const body = (await res.json()) as
            | { ok: true; applied: Applied }
            | { ok: false; error: string };
          if (body.ok) {
            setApplied(body.applied);
            setPreview(null);
            setPendingFile(null);
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

  function reset() {
    setPreview(null);
    setPendingFile(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- not a page: this API route streams a JSON attachment (Content-Disposition), so we need a real full navigation, never next/link client-nav/prefetch */}
        <a
          href="/api/admin/compositions/export"
          className="rounded-xl bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90"
        >
          ↓ Export current look
        </a>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="rounded-xl border border-sol-ink/15 px-5 py-2.5 text-sm font-bold text-sol-ink transition-colors hover:border-sol-ink/40 disabled:opacity-50 dark:border-white/15 dark:text-white dark:hover:border-white/40"
        >
          {pending ? "Analyzing…" : "↑ Import composition…"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {/* Preview card: confirm before the atomic apply */}
      {preview ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-sol-accent/40 bg-white p-5 dark:bg-sol-sand">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sol-accent">
                Ready to install · cartwright-composition-v1
              </p>
              <h3 className="mt-1 text-xl font-black text-sol-ink dark:text-white">
                {preview.name}
              </h3>
              {preview.description ? (
                <p className="text-sm text-sol-muted dark:text-white/60">
                  {preview.description}
                </p>
              ) : null}
            </div>
            <code className="shrink-0 rounded bg-sol-ink/5 px-2 py-1 font-mono text-xs text-sol-ink dark:bg-white/10 dark:text-white">
              {preview.skin}
            </code>
          </div>

          {preview.palette ? (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["accent", preview.palette.accent],
                  ["accentDeep", preview.palette.accentDeep],
                  ["cream", preview.palette.cream],
                  ["sand", preview.palette.sand],
                  ["ink", preview.palette.ink],
                  ["muted", preview.palette.muted],
                ] as const
              ).map(([name, hex]) => (
                <span
                  key={name}
                  className="h-9 w-9 rounded-lg border border-sol-ink/15 dark:border-white/15"
                  style={{ backgroundColor: hex }}
                  title={`${name}: ${hex}`}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-sol-muted dark:text-white/60">
            <span>skin: {preview.skin}</span>
            {preview.voiceFields > 0 ? (
              <>
                <span className="text-sol-ink/30 dark:text-white/30">·</span>
                <span>voice: {preview.voiceFields} copy fields</span>
              </>
            ) : null}
            {preview.chrome?.headerKey ? (
              <>
                <span className="text-sol-ink/30 dark:text-white/30">·</span>
                <span>header: {preview.chrome.headerKey}</span>
              </>
            ) : null}
            {preview.chrome?.footerKey ? (
              <>
                <span className="text-sol-ink/30 dark:text-white/30">·</span>
                <span>footer: {preview.chrome.footerKey}</span>
              </>
            ) : null}
            {preview.scene ? (
              <>
                <span className="text-sol-ink/30 dark:text-white/30">·</span>
                <span>3D: {preview.scene}</span>
              </>
            ) : null}
            {preview.homepageSections > 0 ? (
              <>
                <span className="text-sol-ink/30 dark:text-white/30">·</span>
                <span>homepage: {preview.homepageSections} sections</span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmApply}
              disabled={pending}
              className="rounded-xl bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Installing…" : "✓ Install this look"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-xl border border-sol-ink/15 px-5 py-2.5 text-sm font-bold text-sol-ink transition-colors hover:border-sol-ink/40 disabled:opacity-50 dark:border-white/15 dark:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <pre className="whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      ) : null}

      {applied ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ Look &quot;{applied.name}&quot; installed — skin <code>{applied.appliedSkin}</code>
          {applied.appliedPalette ? ", palette" : ""}
          {applied.fields > 0 ? `, ${applied.fields} voice fields` : ""}
          {applied.appliedScene ? `, 3D scene ${applied.appliedScene}` : ""}
          {applied.appliedHomepage ? `, homepage layout (${applied.appliedHomepage})` : ""}.
          {applied.skipped.length > 0
            ? ` Skipped: ${applied.skipped.join(", ")}.`
            : ""}{" "}
          Revertible via the audit log.
        </div>
      ) : null}
    </div>
  );
}
