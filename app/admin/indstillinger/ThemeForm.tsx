"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ThemeForm({
  initialVibeHtml: _initialVibeHtml
}: {
  initialVibeHtml: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const router = useRouter();

  const handleSelectTemplate = async (template: "ecommerce" | "saas" | "minimalist") => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template })
      });
      if (res.ok) {
        alert("Design Template opdateret!");
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      alert("Noget gik galt");
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const res = await fetch("/api/admin/vibe/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: "home", targetLocales: ["en", "de", "es"] })
      });
      if (res.ok) {
        alert("Design oversat til Engelsk, Tysk og Spansk!");
        router.refresh();
      } else {
        const err = await res.json();
        alert("Oversættelse fejlede: " + err.error);
      }
    } catch (error) {
      console.error(error);
      alert("Noget gik galt under oversættelsen");
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="bg-sol-sand rounded-xl shadow-sm border border-sol-ink/10 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-sol-ink">Themes & AI Design</h2>
        <p className="text-sm text-sol-muted mt-1">
          Skift mellem pre-definerede &quot;Vibe Templates&quot;, eller brug Vibe API&apos;et til at injecte AI-genererede layouts fra Cursor/v0.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          disabled={loading}
          onClick={() => handleSelectTemplate("ecommerce")}
          className="border-2 border-sol-ink/10 rounded-xl p-4 text-left hover:border-sol-accent transition-all"
        >
          <div className="font-bold text-sol-ink mb-1">Modern E-commerce</div>
          <div className="text-xs text-sol-muted">Det klassiske Golden Stack layout. Billeder, bento grids, hero video.</div>
        </button>
        <button
          disabled={loading}
          onClick={() => handleSelectTemplate("saas")}
          className="border-2 border-sol-ink/10 rounded-xl p-4 text-left hover:border-sol-accent transition-all"
        >
          <div className="font-bold text-sol-ink mb-1">B2B SaaS</div>
          <div className="text-xs text-sol-muted">Mørkt tech-design til bureaus, software og B2B-salg. Vercel-style.</div>
        </button>
        <button
          disabled={loading}
          onClick={() => handleSelectTemplate("minimalist")}
          className="border-2 border-sol-ink/10 rounded-xl p-4 text-left hover:border-sol-accent transition-all"
        >
          <div className="font-bold text-sol-ink mb-1">Minimalist Portfolio</div>
          <div className="text-xs text-sol-muted">Meget stilrent og eksklusivt look til arkitekter og designere.</div>
        </button>
      </div>

      <div className="mt-8 pt-6 border-t border-sol-ink/10 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sol-ink">Vibe Localization (Auto-Oversæt)</h3>
          <p className="text-sm text-sol-muted mt-1 max-w-lg">
            Kør dit AI-genererede Vibe design igennem Google Gemini for at bevare al Tailwind styling, men oversætte de synlige tekster til Engelsk, Tysk og Spansk (<code>/en</code>, <code>/de</code>, <code>/es</code>).
          </p>
        </div>
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="bg-sol-accent text-white px-4 py-2 rounded-lg font-bold text-sm hover:brightness-95 disabled:opacity-50"
        >
          {translating ? "Oversætter (tager 5-10s)..." : "🌐 Auto-Oversæt"}
        </button>
      </div>

      <div className="mt-8 pt-6 border-t border-sol-ink/10">
        <h3 className="font-bold text-sol-ink mb-2">Vibe Coding API (Cursor / v0)</h3>
        <p className="text-sm text-sol-muted mb-4">
          For at lade Vercel v0 eller Cursor injecte kode direkte, send et POST request til <code className="bg-sol-cream px-1 py-0.5 rounded text-xs">/api/admin/vibe/push</code> med din Vibe API Key.
        </p>
        <div className="bg-sol-cream rounded-lg p-4 font-mono text-xs text-sol-muted overflow-x-auto">
          {`curl -X POST https://din-shop.com/api/admin/vibe/push \\
  -H "Authorization: Bearer DIN_VIBE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"target": "page", "targetId": "home", "html": "<div>Nyt Design</div>"}'`}
        </div>
      </div>
    </div>
  );
}
