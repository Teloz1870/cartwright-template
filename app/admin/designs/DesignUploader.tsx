"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Adapter = "cartwright" | "stitch" | "claude-design";

type Palette = {
  accent: string;
  accentDeep: string;
  cream: string;
  sand: string;
  ink: string;
  muted: string;
};

type Preview = {
  slug: string;
  name: string;
  description: string;
  mode: "website" | "webshop" | "both";
  premium: boolean;
  palette: Palette;
  sectionTypes: string[];
  detectedAdapter: string;
};

/**
 * v0.9.4 — design.md upload med "bekræft før import"-flow.
 *
 * Flow: vælg/drop fil → POST dryRun=true → vis parsed preview (navn, mode,
 * palette-swatches, sektioner, advarsel ved mode-mismatch) → kunden bekræfter
 * → POST det rigtige import. Det undgår den tidligere "drop = øjeblikkelig,
 * uoverskuelig import" og gør at kunden ser HVAD de importerer + at paletten
 * faktisk fanges korrekt, før noget skrives.
 */
const EXAMPLE_DESIGN_MD = `---
schema: cartwright-design-v1
slug: my-design
name: My Design
description: A short description of this look.
mode: both
premium: false
tokens:
  prefix: sol
  palette:
    accent: "#2e7d6b"
    accentDeep: "#1c5246"
    cream: "#f3f8f6"
    sand: "#e4efe9"
    ink: "#13241f"
    muted: "#5d736c"
sections:
  - type: hero
    eyebrow: "NEW"
    headline: "Your headline here"
    tagline: "A supporting sentence under the headline."
    cta: { label: "Shop now", href: "/produkter" }
  - type: feature-grid
    title: "Why us"
    items:
      - { title: "Point one", body: "Detail." }
      - { title: "Point two", body: "Detail." }
  - type: cta-footer
    title: "Ready?"
    cta: { label: "Get started", href: "/produkter" }
---

# My Design
Free-form designer notes (not rendered).
`;

export default function DesignUploader({
  ecommerceEnabled = true,
}: {
  ecommerceEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adapter, setAdapter] = useState<Adapter | "auto">("auto");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [success, setSuccess] = useState<{ slug: string; files: string[] } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 1: dry-run → preview
  function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    setPreview(null);
    setPendingFile(file);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("adapter", adapter);
    fd.set("dryRun", "true");
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/designs/import", {
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

  // Step 2: confirm → real import
  function confirmImport() {
    if (!pendingFile) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", pendingFile);
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

  const shopMode = ecommerceEnabled ? "webshop" : "website";
  const modeMismatch =
    preview && preview.mode !== "both" && preview.mode !== shopMode;

  function downloadExample() {
    const blob = new Blob([EXAMPLE_DESIGN_MD], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "design.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <button
          type="button"
          onClick={downloadExample}
          className="ml-auto rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-bold text-sol-ink transition-colors hover:border-sol-ink/40 dark:border-white/15 dark:text-white dark:hover:border-white/40"
        >
          ↓ Download eksempel design.md
        </button>
      </div>

      {/* Dropzone — skjult når en preview vises */}
      {!preview ? (
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
            {pending ? "Analyserer..." : "Drag-drop design.md eller klik for at vælge"}
          </p>
          <p className="text-xs text-sol-muted dark:text-white/60">
            .md (Cartwright / Stitch) eller .tsx (Claude Design / v0)
          </p>
        </div>
      ) : null}

      {/* Preview-kort: bekræft før import */}
      {preview ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-sol-accent/40 bg-white p-5 dark:bg-sol-sand">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sol-accent">
                Klar til import · adapter: {preview.detectedAdapter}
              </p>
              <h3 className="mt-1 text-xl font-black text-sol-ink dark:text-white">
                {preview.name}
              </h3>
              <p className="text-sm text-sol-muted dark:text-white/60">
                {preview.description}
              </p>
            </div>
            <code className="shrink-0 rounded bg-sol-ink/5 px-2 py-1 font-mono text-xs text-sol-ink dark:bg-white/10 dark:text-white">
              {preview.slug}
            </code>
          </div>

          {/* Palette swatches */}
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-sol-muted dark:text-white/60">
              Palette
            </p>
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
                <div key={name} className="flex flex-col items-center gap-1">
                  <span
                    className="h-9 w-9 rounded-lg border border-sol-ink/15 dark:border-white/15"
                    style={{ backgroundColor: hex }}
                    title={`${name}: ${hex}`}
                  />
                  <span className="text-[9px] font-semibold text-sol-muted dark:text-white/50">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mode + sektioner */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-sol-muted dark:text-white/60">
            <span>mode: {preview.mode}</span>
            <span className="text-sol-ink/30 dark:text-white/30">·</span>
            <span>
              {preview.sectionTypes.length} sektioner: {preview.sectionTypes.join(", ")}
            </span>
          </div>

          {modeMismatch ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              ⚠ Dette design er <strong>{preview.mode}</strong>-mode, men din shop
              er <strong>{shopMode}</strong>-mode. Det importeres fint, men dele af
              homepage-layoutet passer måske bedre til en {preview.mode}-shop.
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmImport}
              disabled={pending}
              className="rounded-xl bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Importerer..." : "✓ Importér dette design"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-xl border border-sol-ink/15 px-5 py-2.5 text-sm font-bold text-sol-ink transition-colors hover:border-sol-ink/40 disabled:opacity-50 dark:border-white/15 dark:text-white"
            >
              Annullér
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <pre className="whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ Design "<code>{success.slug}</code>" importeret. Den er nu valgbar i
          listen ovenfor — klik for at aktivere den, og hele shoppen adopterer
          designets palette.
        </div>
      ) : null}
    </div>
  );
}
