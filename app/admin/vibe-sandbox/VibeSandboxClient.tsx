"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPage, updatePage } from "../actions";
import { Monitor, Tablet, Smartphone, Copy, Check, FileCode, Settings, Globe } from "lucide-react";

type PageData = {
  id: string;
  slug: string;
  title: string;
  body: string;
  heroImage?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  showInNav: boolean;
  navOrder: number;
  vibeHtml?: string | null;
  translations?: {
    en?: {
      title?: string;
      body?: string;
      vibeHtml?: string;
    };
  } | null;
};

type Props = {
  pages: PageData[];
};

const defaultNewPage: Omit<PageData, "id"> = {
  slug: "",
  title: "",
  body: "Vibe Page Layout",
  heroImage: "",
  metaTitle: "",
  metaDescription: "",
  showInNav: false,
  navOrder: 0,
  vibeHtml: `<!-- Vibe-coded HTML template -->
<div className="py-20 text-center">
  <div className="max-w-4xl mx-auto px-4">
    <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Cartwright 2.0 Engine</span>
    <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter mt-4 mb-6">
      Autonomt Bygget Landing Page
    </h1>
    <p className="text-xl text-white/60 leading-relaxed font-light mb-8 max-w-2xl mx-auto">
      Dette design er genereret 100% via AI (Vibe Coding) og renderes direkte på tværs af platformens hærdede backend-arkitektur.
    </p>
    <div className="flex justify-center gap-4">
      <a href="https://github.com/Teloz1870" target="_blank" rel="noopener noreferrer" className="px-8 py-3.5 bg-white text-black font-black rounded-full hover:bg-white/90 transition">
        Se GitHub
      </a>
      <a href="/admin/vibe-sandbox" className="px-8 py-3.5 border border-white/20 hover:bg-white/10 font-bold rounded-full transition">
        Rediger Sandkasse
      </a>
    </div>
  </div>
</div>`,
  translations: {
    en: {
      title: "",
      body: "Vibe Page Layout",
      vibeHtml: `<!-- Vibe-coded HTML template (EN) -->
<div className="py-20 text-center">
  <div className="max-w-4xl mx-auto px-4">
    <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Cartwright 2.0 Engine</span>
    <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter mt-4 mb-6">
      Autonomously Built Landing Page
    </h1>
    <p className="text-xl text-white/60 leading-relaxed font-light mb-8 max-w-2xl mx-auto">
      This design is generated 100% via AI (Vibe Coding) and renders directly on our hardened backend architecture.
    </p>
    <div className="flex justify-center gap-4">
      <a href="https://github.com/Teloz1870" target="_blank" rel="noopener noreferrer" className="px-8 py-3.5 bg-white text-black font-black rounded-full hover:bg-white/90 transition">
        View GitHub
      </a>
      <a href="/admin/vibe-sandbox" className="px-8 py-3.5 border border-white/20 hover:bg-white/10 font-bold rounded-full transition">
        Edit Sandbox
      </a>
    </div>
  </div>
</div>`
    }
  }
};

export default function VibeSandboxClient({ pages }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id");
  const [isPending, startTransition] = useTransition();

  // Active page selection
  const [selectedPageId, setSelectedPageId] = useState<string>("new");

  // Load target page based on URL parameter on mount
  useEffect(() => {
    if (urlId && pages.some((p) => p.id === urlId)) {
      setSelectedPageId(urlId);
    }
  }, [urlId, pages]);

  // Editor states
  const [title, setTitle] = useState(defaultNewPage.title);
  const [slug, setSlug] = useState(defaultNewPage.slug);
  const [vibeHtml, setVibeHtml] = useState(defaultNewPage.vibeHtml || "");
  
  // English translation states
  const [enTitle, setEnTitle] = useState(defaultNewPage.translations?.en?.title || "");
  const [enVibeHtml, setEnVibeHtml] = useState(defaultNewPage.translations?.en?.vibeHtml || "");

  // Settings states
  const [metaTitle, setMetaTitle] = useState(defaultNewPage.metaTitle || "");
  const [metaDescription, setMetaDescription] = useState(defaultNewPage.metaDescription || "");
  const [showInNav, setShowInNav] = useState(defaultNewPage.showInNav);
  const [navOrder, setNavOrder] = useState(defaultNewPage.navOrder);

  // Tabs: "code-da" | "code-en" | "settings"
  const [activeTab, setActiveTab] = useState<"code-da" | "code-en" | "settings">("code-da");
  // Preview locale: "da" | "en"
  const [previewLocale, setPreviewLocale] = useState<"da" | "en">("da");
  // Responsive mode: "desktop" | "tablet" | "mobile"
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // AI states
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Load selected page into editor
  useEffect(() => {
    if (selectedPageId === "new") {
      setTitle(defaultNewPage.title);
      setSlug(defaultNewPage.slug);
      setVibeHtml(defaultNewPage.vibeHtml || "");
      setEnTitle(defaultNewPage.translations?.en?.title || "");
      setEnVibeHtml(defaultNewPage.translations?.en?.vibeHtml || "");
      setMetaTitle(defaultNewPage.metaTitle || "");
      setMetaDescription(defaultNewPage.metaDescription || "");
      setShowInNav(defaultNewPage.showInNav);
      setNavOrder(defaultNewPage.navOrder);
    } else {
      const page = pages.find((p) => p.id === selectedPageId);
      if (page) {
        setTitle(page.title);
        setSlug(page.slug);
        setVibeHtml(page.vibeHtml || "");
        setEnTitle(page.translations?.en?.title || "");
        setEnVibeHtml(page.translations?.en?.vibeHtml || "");
        setMetaTitle(page.metaTitle || "");
        setMetaDescription(page.metaDescription || "");
        setShowInNav(page.showInNav);
        setNavOrder(page.navOrder);
      }
    }
    // Refresh preview
    setIframeKey(k => k + 1);
  }, [selectedPageId, pages]);

  // Trigger preview update when code changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setIframeKey((k) => k + 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [vibeHtml, enVibeHtml, previewLocale]);

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/vibe/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Noget gik galt." });
        return;
      }

      if (data.html) {
        if (activeTab === "code-en") {
          setEnVibeHtml(data.html);
        } else {
          setVibeHtml(data.html);
        }
        setMessage({ type: "success", text: "AI Design genereret succesfuldt! 🎉" });
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Netværksfejl under AI generering." });
    } finally {
      setIsGenerating(false);
      setAiPrompt("");
    }
  };

  // Auto-clean function to extract HTML from React component
  const handleAutoClean = (code: string, isEnglish: boolean) => {
    let cleanCode = code;
    
    if (cleanCode.includes("export default function") || cleanCode.includes("return (")) {
      const returnMatch = cleanCode.match(/return\s*\(\s*([\s\S]*)\s*\)\s*;?\s*}/);
      if (returnMatch && returnMatch[1]) {
        cleanCode = returnMatch[1].trim();
      }
    }

    cleanCode = cleanCode.replace(/className=/g, "class=");
    cleanCode = cleanCode.replace(/htmlFor=/g, "for=");

    if (isEnglish) {
      setEnVibeHtml(cleanCode);
    } else {
      setVibeHtml(cleanCode);
    }
    
    setMessage({ type: "success", text: "Koden blev automatisk renset for React-komponenter!" });
  };

  // Handle Save Page
  const handleSave = () => {
    if (!title.trim() || !slug.trim()) {
      setMessage({ type: "error", text: "Titel og slug skal udfyldes!" });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("title", title);
        formData.append("slug", slug.replace(/\s+/g, "-").toLowerCase());
        formData.append("body", "Vibe Page Layout"); // required body placeholder
        formData.append("vibeHtml", vibeHtml);
        formData.append("metaTitle", metaTitle);
        formData.append("metaDescription", metaDescription);
        if (showInNav) formData.append("showInNav", "on");
        formData.append("navOrder", String(navOrder));

        const translationsObj = {
          en: {
            title: enTitle || title,
            body: "Vibe Page Layout",
            vibeHtml: enVibeHtml
          }
        };
        formData.append("translations", JSON.stringify(translationsObj));

        let res;
        if (selectedPageId === "new") {
          res = await createPage(formData);
        } else {
          res = await updatePage(selectedPageId, formData);
        }

        if (res.ok) {
          setMessage({
            type: "success",
            text: `Siden er udgivet! Du kan se den på /info/${slug}`
          });
          router.refresh();
        } else {
          setMessage({ type: "error", text: res.error || "Kunne ikke gemme siden." });
        }
      } catch (err: any) {
        setMessage({ type: "error", text: err.message || "Netværksfejl under lagring." });
      }
    });
  };

  const currentPreviewCode = previewLocale === "da" ? vibeHtml : (enVibeHtml || vibeHtml);

  // Setup IFrame content document
  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Clear contents
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title || "Vibe Preview"}</title>
        </head>
        <body class="bg-[#0A0A0A] text-white">
          <div id="preview-root">${currentPreviewCode}</div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // Copy parent document's styles
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach((style) => {
      iframeDoc.head.appendChild(style.cloneNode(true));
    });

    // Add additional reset CSS
    const customStyles = iframeDoc.createElement("style");
    customStyles.textContent = `
      body {
        margin: 0;
        padding: 2rem;
        background-color: #0A0A0A;
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        min-height: 100vh;
        overflow-x: hidden;
      }
      /* Clean scrollbars */
      ::-webkit-scrollbar {
        width: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 99px;
      }
    `;
    iframeDoc.head.appendChild(customStyles);
  };

  return (
    <div className="grid lg:grid-cols-12 gap-8 items-start">
      
      {/* 1. Editor Panel (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        
        {/* Page selector */}
        <div className="rounded-2xl border border-sol-ink/10 bg-white p-4 shadow-sm">
          <label className="block text-xs font-black uppercase text-sol-muted mb-2">
            Vælg Arbejdskontekst
          </label>
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none"
          >
            <option value="new">+ Opret Ny Vibe-Side</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || `Slug: ${p.slug}`} {p.vibeHtml ? "✨" : "(Markdown)"}
              </option>
            ))}
          </select>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Editor Box */}
        <div className="rounded-2xl border border-sol-ink/10 bg-white shadow-sm overflow-hidden flex flex-col">
          
          {/* Editor Header / Tabs */}
          <div className="flex border-b border-sol-ink/10 bg-sol-cream/50 px-2 pt-2">
            <button
              onClick={() => setActiveTab("code-da")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 rounded-t-lg transition ${
                activeTab === "code-da"
                  ? "border-sol-accent text-sol-accent bg-white"
                  : "border-transparent text-sol-muted hover:text-sol-ink"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Dansk HTML
            </button>
            <button
              onClick={() => setActiveTab("code-en")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 rounded-t-lg transition ${
                activeTab === "code-en"
                  ? "border-sol-accent text-sol-accent bg-white"
                  : "border-transparent text-sol-muted hover:text-sol-ink"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Engelsk HTML
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 rounded-t-lg transition ${
                activeTab === "settings"
                  ? "border-sol-accent text-sol-accent bg-white"
                  : "border-transparent text-sol-muted hover:text-sol-ink"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              SEO & Info
            </button>
          </div>

          {/* Editor Body */}
          <div className="p-4 bg-white">
            
            {/* AI Generator Box */}
            <div className="mb-6 p-4 rounded-xl border border-sol-accent/20 bg-sol-accent/5">
              <label className="block text-xs font-black uppercase text-sol-accent mb-2">
                ✨ In-House AI Designer
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="fx 'Byg en flot prisside med 3 kolonner og mørk baggrund'"
                  className="flex-1 rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-medium text-sol-ink focus:border-sol-accent focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateAI()}
                  disabled={isGenerating}
                />
                <button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white hover:brightness-95 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {isGenerating ? "Genererer..." : "Generér Design"}
                </button>
              </div>
              <p className="text-xs text-sol-muted mt-2">
                AI'en kender automatisk dit brand og Vibe-regler. Den spytter HTML-koden ud nedenfor.
              </p>
            </div>
            
            {/* Tab: Danish Vibe HTML */}
            {activeTab === "code-da" && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-sol-muted">
                    Dansk Vibe Markup
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => handleAutoClean(vibeHtml, false)}
                      className="text-xs font-bold text-sol-accent hover:underline flex items-center gap-1"
                    >
                      <span>Rens React-kode ✨</span>
                    </button>
                    <a
                      href="https://github.com/Teloz1870/cartwright/blob/main/docs/VIBE_PROMPTS.md"
                      target="_blank"
                      className="text-xs font-bold text-sol-accent hover:underline"
                    >
                      Åbn Vibe Guide
                    </a>
                  </div>
                </div>
                <textarea
                  value={vibeHtml}
                  onChange={(e) => setVibeHtml(e.target.value)}
                  placeholder="Paste din v0 eller Lovable HTML/Tailwind kode her..."
                  className="w-full h-[450px] font-mono text-sm leading-relaxed rounded-xl border border-sol-ink/15 p-4 bg-[#0A0A0A] text-gray-200 focus:outline-none focus:ring-2 focus:ring-sol-accent/30"
                />
              </div>
            )}

            {/* Tab: English Vibe HTML */}
            {activeTab === "code-en" && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-sol-muted mb-1">
                    Engelsk Titel
                  </label>
                  <input
                    type="text"
                    value={enTitle}
                    onChange={(e) => setEnTitle(e.target.value)}
                    placeholder="English Page Title"
                    className="w-full rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-semibold text-sol-ink"
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <label className="text-xs font-black uppercase text-sol-muted">
                    Engelsk Vibe Markup
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutoClean(enVibeHtml, true)}
                    className="text-xs font-bold text-sol-accent hover:underline flex items-center gap-1"
                  >
                    <span>Rens React-kode ✨</span>
                  </button>
                </div>
                <textarea
                  value={enVibeHtml}
                  onChange={(e) => setEnVibeHtml(e.target.value)}
                  placeholder="Paste din engelske version her (valgfri, falder tilbage til dansk)..."
                  className="w-full h-[375px] font-mono text-sm leading-relaxed rounded-xl border border-sol-ink/15 p-4 bg-[#0A0A0A] text-gray-200 focus:outline-none focus:ring-2 focus:ring-sol-accent/30"
                />
              </div>
            )}

            {/* Tab: Settings */}
            {activeTab === "settings" && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-sol-muted mb-1">
                      Side Titel
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="fx Vores Kampagne"
                      className="w-full rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-semibold text-sol-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-sol-muted mb-1">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="fx kampagneside"
                      className="w-full rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-semibold text-sol-ink"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-sol-muted mb-1">
                      SEO Meta Titel
                    </label>
                    <input
                      type="text"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      className="w-full rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-semibold text-sol-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-sol-muted mb-1">
                      SEO Meta Beskrivelse
                    </label>
                    <input
                      type="text"
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      className="w-full rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-semibold text-sol-ink"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-sol-ink/10 bg-sol-cream/30 p-3 mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showInNav}
                        onChange={(e) => setShowInNav(e.target.checked)}
                        className="h-4 w-4 accent-sol-accent"
                      />
                      <span className="text-sm font-semibold text-sol-ink">Vis i menuen</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-sol-ink">Rækkefølge:</label>
                      <input
                        type="number"
                        min="0"
                        value={navOrder}
                        onChange={(e) => setNavOrder(parseInt(e.target.value) || 0)}
                        className="w-16 rounded-lg border border-sol-ink/15 bg-white px-2 py-1 text-sm font-semibold text-sol-ink"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Action buttons */}
          <div className="border-t border-sol-ink/10 bg-sol-cream/20 p-4 flex justify-between items-center">
            {selectedPageId !== "new" && (
              <a
                href={`/info/${slug}`}
                target="_blank"
                className="text-xs font-bold text-sol-accent hover:underline"
              >
                Vis Live Side →
              </a>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setSelectedPageId("new")}
                className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-bold text-sol-ink hover:bg-sol-cream transition"
              >
                Nulstil
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-black text-white hover:brightness-95 transition disabled:opacity-50"
              >
                {isPending ? "Gemmer..." : selectedPageId === "new" ? "Udgiv Side" : "Gem Ændringer"}
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* 2. Interactive Preview Panel (7 cols) */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        
        {/* Toolbar */}
        <div className="rounded-2xl border border-sol-ink/10 bg-white p-3 shadow-sm flex items-center justify-between">
          <div className="flex gap-1 bg-sol-cream rounded-lg p-1">
            <button
              onClick={() => setViewport("desktop")}
              className={`p-2 rounded-md transition ${
                viewport === "desktop" ? "bg-white text-sol-accent shadow-sm" : "text-sol-muted hover:text-sol-ink"
              }`}
              title="Desktop (Full)"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewport("tablet")}
              className={`p-2 rounded-md transition ${
                viewport === "tablet" ? "bg-white text-sol-accent shadow-sm" : "text-sol-muted hover:text-sol-ink"
              }`}
              title="Tablet"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewport("mobile")}
              className={`p-2 rounded-md transition ${
                viewport === "mobile" ? "bg-white text-sol-accent shadow-sm" : "text-sol-muted hover:text-sol-ink"
              }`}
              title="Mobile"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPreviewLocale("da")}
              className={`px-3 py-1 text-xs font-black uppercase rounded-lg transition ${
                previewLocale === "da" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-muted hover:text-sol-ink"
              }`}
            >
              Dansk
            </button>
            <button
              onClick={() => setPreviewLocale("en")}
              className={`px-3 py-1 text-xs font-black uppercase rounded-lg transition ${
                previewLocale === "en" ? "bg-sol-accent text-white" : "bg-sol-cream text-sol-muted hover:text-sol-ink"
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Live Preview Monitor Screen */}
        <div className="flex justify-center bg-sol-cream/50 rounded-3xl p-6 border border-sol-ink/5 shadow-inner">
          <div
            className="transition-all duration-300 ease-out bg-[#0A0A0A] rounded-2xl overflow-hidden border border-black/20 shadow-2xl flex flex-col"
            style={{
              width: viewport === "desktop" ? "100%" : viewport === "tablet" ? "768px" : "375px",
              height: viewport === "desktop" ? "650px" : viewport === "tablet" ? "800px" : "667px",
            }}
          >
            {/* Minimal Browser Header Mock */}
            <div className="bg-[#1A1A1A] px-4 py-2 border-b border-white/5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 block"></span>
              </div>
              <div className="mx-auto bg-white/5 text-[10px] text-white/40 px-6 py-0.5 rounded-md font-mono select-none w-1/2 text-center truncate">
                localhost:3000/info/{slug || "preview"}
              </div>
            </div>

            {/* Interactive Preview IFrame */}
            <iframe
              key={iframeKey}
              onLoad={handleIframeLoad}
              className="w-full flex-1 border-0 bg-[#0A0A0A]"
              sandbox="allow-same-origin allow-scripts"
            />
          </div>
        </div>

      </div>

    </div>
  );
}
