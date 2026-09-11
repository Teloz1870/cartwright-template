"use client";

/**
 * logo-generator plugin (cartwright-plugin-v1) — the /admin/indstillinger
 * logo panel. Moved from app/admin/indstillinger/LogoForm.tsx (a shim keeps
 * that path). Sections 1–2 (upload + SVG outline editor/generator) are core
 * branding UI that travels with the form; section 3 (Gemini raster) is the
 * flag-gated generator (`logoGeneratorEnabled` prop ⇐ features.logoGenerator).
 * Persistence (updateLogoSettings) stays core — only generation is the plugin.
 */
import { useState, useTransition } from "react";
import { updateLogoSettings } from "@/app/admin/indstillinger/actions";
import { generateLogoWithGemini } from "./actions";

export default function LogoForm({
  initialPaths,
  initialViewBox,
  initialStrokeWidth,
  initialImageUrl,
  logoGeneratorEnabled = false,
}: {
  initialPaths: string[];
  initialViewBox: string;
  initialStrokeWidth: number;
  initialImageUrl: string | null;
  logoGeneratorEnabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingRaster, setIsGeneratingRaster] = useState(false);
  const [rasterPrompt, setRasterPrompt] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [paths, setPaths] = useState<string[]>(initialPaths);
  const [viewBox, setViewBox] = useState(initialViewBox);
  const [strokeWidth, setStrokeWidth] = useState(initialStrokeWidth);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await updateLogoSettings(paths, viewBox, strokeWidth, imageUrl);
      if (res.ok) {
        setMessage({ type: "success", text: "Logo saved and updated!" });
      } else {
        setMessage({ type: "error", text: res.error || "An error occurred." });
      }
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/generate-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Generation failed");
      }
      
      setPaths(data.markPaths);
      setViewBox(data.markViewBox);
      setStrokeWidth(data.markStrokeWidth || 2);
      setMessage({ type: "success", text: "New logo generated! Remember to save if you want to keep it." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateRaster = async () => {
    if (!rasterPrompt.trim()) return;
    setIsGeneratingRaster(true);
    setMessage(null);
    try {
      const res = await generateLogoWithGemini(rasterPrompt);
      if (!res.ok) throw new Error(res.error);
      setImageUrl(res.url);
      setMessage({ type: "success", text: "Gemini logo generated, uploaded and saved! 🎨" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: (err instanceof Error ? err.message : "") || "Gemini generation failed." });
    } finally {
      setIsGeneratingRaster(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setImageUrl(data.url);
      setMessage({ type: "success", text: "Image uploaded! Remember to save." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-sol-sand p-6 rounded-xl border border-sol-ink/10 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-sol-ink">Logo & Branding</h2>
        
        {/* Preview Box */}
        <div className="h-16 w-16 bg-sol-accent-deep text-white rounded-xl flex items-center justify-center p-3 shadow-md relative overflow-hidden">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin logo-upload preview uses a dynamic/blob src
            <img src={imageUrl} alt="Logo Preview" loading="lazy" decoding="async" className="w-full h-full object-contain" />
          ) : (
            <svg
              viewBox={viewBox}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-full h-full"
            >
              {paths.map((p, i) => (
                <path key={i} d={p} />
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 bg-sol-cream/50 rounded-lg border border-sol-ink/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase text-sol-muted">1. Upload Logo Image</h3>
            <p className="text-sm text-sol-muted mt-1">Upload a .png or .svg image to override the outline logo.</p>
          </div>
          <div className="flex items-center gap-3">
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                className="text-xs text-red-500 font-bold hover:underline"
              >
                Remove image
              </button>
            )}
            <label className="cursor-pointer rounded-md border border-sol-ink/20 px-4 py-2 text-sm font-bold text-sol-ink transition hover:bg-sol-ink/5 flex items-center gap-2">
              {isUploading ? "Uploading..." : "Choose file"}
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={isUploading} />
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 bg-sol-cream/50 rounded-lg border border-sol-ink/5">
        <h3 className="text-sm font-black uppercase text-sol-muted">2. ✨ Or AI-Generate an Outline Logo</h3>
        <p className="text-sm text-sol-muted">If you haven&apos;t uploaded an image, this AI-generated stroke icon is shown.</p>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. 'A minimalist sunglasses outline' or 'A coffee cup'"
            className="flex-1 rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="rounded-md bg-sol-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-ink/90 disabled:opacity-50 flex-shrink-0"
          >
            {isGenerating ? "Generating..." : "Generate Logo"}
          </button>
        </div>
      </div>

      {logoGeneratorEnabled && (
        <div className="space-y-4 p-4 bg-sol-accent/5 rounded-lg border border-sol-accent/20">
          <h3 className="text-sm font-black uppercase text-sol-muted">3. 🎨 Gemini logo (raster, real image)</h3>
          <p className="text-sm text-sol-muted">
            Generates a real image logo with Gemini, uploads it to Vercel Blob and sets it
            as the brand&apos;s logo. Requires a Gemini key + BLOB_READ_WRITE_TOKEN.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={rasterPrompt}
              onChange={(e) => setRasterPrompt(e.target.value)}
              placeholder="E.g. 'Hoptify — a happy green frog hopping, modern flat logo'"
              className="flex-1 rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateRaster();
                }
              }}
            />
            <button
              type="button"
              onClick={handleGenerateRaster}
              disabled={isGeneratingRaster || !rasterPrompt.trim()}
              className="rounded-md bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent/90 disabled:opacity-50 flex-shrink-0"
            >
              {isGeneratingRaster ? "Generating…" : "Generate with Gemini"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-sol-ink/10">
        <div>
          <label className="block text-sm font-bold text-sol-ink mb-1">SVG Paths (d-attributter)</label>
          <textarea
            value={JSON.stringify(paths, null, 2)}
            onChange={(e) => {
              try {
                setPaths(JSON.parse(e.target.value));
              } catch {
                // Ignore invalid JSON while typing
              }
            }}
            rows={4}
            className="w-full rounded-md border font-mono text-xs border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-sol-ink mb-1">ViewBox</label>
            <input
              type="text"
              value={viewBox}
              onChange={(e) => setViewBox(e.target.value)}
              className="w-full rounded-md border font-mono border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-sol-ink mb-1">Stroke Width</label>
            <input
              type="number"
              step="0.1"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-full rounded-md border font-mono border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
            />
          </div>
        </div>

        <div className="pt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-sol-accent px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Logo"}
          </button>
          {message && (
            <p className={`text-sm font-medium ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
