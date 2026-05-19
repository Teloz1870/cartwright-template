"use client";

import { useRef, useState, type DragEvent } from "react";

type Props = {
  /** Kaldes med Vercel Blob URL når upload lykkes. */
  onUploaded: (url: string) => void;
  /** Hvis sat: viser eksisterende preview-URL ved siden af upload-knap. */
  currentUrl?: string | null;
  /** Tillader video (mp4) udover billeder. Default: kun billeder. */
  acceptVideo?: boolean;
  /** Custom label på knappen. Default: "Vælg fil". */
  buttonLabel?: string;
};

/**
 * Admin-image-upload med drag-drop + click-to-pick. Uploader til Vercel Blob
 * via /api/admin/upload, returnerer CDN-URL.
 *
 * Bagudkompatibel: bruges side-om-side med eksisterende URL-tekstfelt så admin
 * kan EITHER uploade en fil ELLER paste en URL (fx Unsplash).
 *
 * Loading-state: viser "Uploader…" + disabled-knap.
 * Error-state: viser fejlbesked under knappen i 5 sek.
 */
export default function ImageUpload({
  onUploaded,
  currentUrl,
  acceptVideo,
  buttonLabel = "Vælg fil",
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = acceptVideo
    ? "image/jpeg,image/png,image/webp,video/mp4"
    : "image/jpeg,image/png,image/webp";

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Upload fejlede");
        return;
      }
      onUploaded(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netværk-fejl");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = ""; // reset så samme fil kan vælges igen
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  const isVideo = currentUrl && /\.(mp4|webm|mov)$/i.test(currentUrl);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition ${
          dragOver
            ? "border-sol-accent bg-sol-accent/5"
            : "border-sol-ink/15 bg-sol-cream/30"
        }`}
      >
        {currentUrl && !isVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Preview"
            className="h-12 w-12 shrink-0 rounded object-cover"
          />
        )}
        {currentUrl && isVideo && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-sol-accent text-xs font-black text-white">
            VIDEO
          </span>
        )}
        <div className="min-w-0 flex-1 text-xs text-sol-muted">
          {dragOver
            ? "Slip filen her"
            : currentUrl
              ? "Træk ny fil hertil eller klik for at erstatte"
              : `Træk ${acceptVideo ? "billede eller video" : "billede"} hertil eller klik`}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 rounded-lg bg-sol-accent px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploader…" : buttonLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {error && (
        <p className="text-xs font-bold text-red-700">{error}</p>
      )}
    </div>
  );
}
