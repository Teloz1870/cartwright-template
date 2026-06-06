"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPage, updatePage } from "@/app/admin/actions";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "@/app/[locale]/info/[slug]/AnimatedPageContent";

type PageFormPage = {
  id: string;
  slug: string;
  title: string;
  body: string;
  heroImage?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  showInNav: boolean;
  navOrder: number;
  translations?: Record<string, { title?: string; body?: string }> | null;
};

type PageFormProps = {
  page?: PageFormPage;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function PageForm({ page }: PageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isTranslating, startTranslating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // State for Live Preview
  const [title, setTitle] = useState(page?.title ?? "");
  const [body, setBody] = useState(page?.body ?? "");
  const [heroImage, setHeroImage] = useState(page?.heroImage ?? "");
  
  // Translations state
  const [enTitle, setEnTitle] = useState(page?.translations?.en?.title ?? "");
  const [enBody, setEnBody] = useState(page?.translations?.en?.body ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        const result = page
          ? await updatePage(page.id, formData)
          : await createPage(formData);

        if (result.ok) {
          router.push("/admin/sider");
          return;
        }

        setError(result.error);
      })();
    });
  }

  function handleAutoTranslate() {
    const daTitle = title;
    const daBody = body;

    if (!daTitle && !daBody) {
      setAiNotice("Udfyld venligst de danske tekster først.");
      return;
    }

    setAiNotice("Oversætter tekster til engelsk via AI...");
    setError(null);

    startTranslating(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payload: { title: daTitle, body: daBody },
              targetLocale: "en",
              sourceLocale: "da",
            }),
          });
          const data = await res.json();

          if (!res.ok || data.error) {
            setAiNotice(null);
            setError(data.error || "Failed to translate");
          } else {
            setEnTitle(data.title || "");
            setEnBody(data.body || "");
            setAiNotice("✨ Tekster oversat til engelsk via AI! Husk at gemme formularen.");
          }
        } catch (err) {
          setAiNotice(null);
          setError(err instanceof Error ? err.message : "Netværksfejl under oversættelse");
        }
      })();
    });
  }

  const blocks = renderContentBlocks(body);

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
      >
        <input type="hidden" name="translations" value={JSON.stringify({
          en: {
            title: enTitle,
            body: enBody
          }
        })} />
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-sol-ink">Rediger Side</h2>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Gemmer…" : "Gem Side"}
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}
        {aiNotice && (
          <div className="mb-5 rounded-lg border border-sol-accent/30 bg-sol-accent/5 px-4 py-3 text-sm font-bold text-sol-accent">
            {aiNotice}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="slug" className={labelClass}>
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              defaultValue={page?.slug ?? ""}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label htmlFor="title" className={labelClass}>
              Titel
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="enTitle" className="text-xs font-black uppercase text-sol-muted">
                Titel (English)
              </label>
              <button
                type="button"
                onClick={handleAutoTranslate}
                disabled={isTranslating}
                className="text-xs font-bold text-sol-accent transition hover:text-sol-accent-deep disabled:opacity-50"
              >
                {isTranslating ? "Oversætter..." : "✨ Auto-Oversæt"}
              </button>
            </div>
            <input
              id="enTitle"
              type="text"
              value={enTitle}
              onChange={(e) => setEnTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex justify-between items-end mb-1">
              <label htmlFor="body" className={labelClass + " mb-0"}>
                Indhold (Markdown)
              </label>
              <span className="text-[10px] text-sol-muted uppercase tracking-wider font-bold">
                ## = Overskrift | {">"} = Citat
              </span>
            </div>
            <textarea
              id="body"
              name="body"
              rows={20}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={`${inputClass} font-mono text-sm leading-relaxed`}
              required
            />
          </div>
          
          <div className="md:col-span-2">
            <div className="flex justify-between items-end mb-1">
              <label htmlFor="enBody" className="text-xs font-black uppercase text-sol-muted mb-0">
                Indhold (English Markdown)
              </label>
              <button
                type="button"
                onClick={handleAutoTranslate}
                disabled={isTranslating}
                className="text-xs font-bold text-sol-accent transition hover:text-sol-accent-deep disabled:opacity-50"
              >
                {isTranslating ? "Oversætter..." : "✨ Auto-Oversæt"}
              </button>
            </div>
            <textarea
              id="enBody"
              rows={20}
              value={enBody}
              onChange={(e) => setEnBody(e.target.value)}
              className={`${inputClass} font-mono text-sm leading-relaxed`}
            />
          </div>

          {/* Hero & Media */}
          <div className="md:col-span-2 rounded-xl border border-sol-ink/10 bg-sol-sand/30 p-4 mt-2">
            <p className="mb-3 text-xs font-black uppercase text-sol-muted">Hero Billede</p>
            <div>
              <label htmlFor="heroImage" className="block text-sm font-semibold text-sol-ink mb-1">
                Billede URL (Unsplash eller lign.)
              </label>
              <input
                id="heroImage"
                name="heroImage"
                type="url"
                value={heroImage}
                onChange={(e) => setHeroImage(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className={inputClass}
              />
            </div>
          </div>

          {/* SEO Metatags */}
          <div className="md:col-span-2 rounded-xl border border-sol-ink/10 bg-sol-sand/30 p-4">
            <p className="mb-3 text-xs font-black uppercase text-sol-muted">SEO (Meta tags)</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="metaTitle" className="block text-sm font-semibold text-sol-ink mb-1">
                  Meta Titel
                </label>
                <input
                  id="metaTitle"
                  name="metaTitle"
                  type="text"
                  defaultValue={page?.metaTitle ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="metaDescription" className="block text-sm font-semibold text-sol-ink mb-1">
                  Meta Beskrivelse
                </label>
                <input
                  id="metaDescription"
                  name="metaDescription"
                  type="text"
                  defaultValue={page?.metaDescription ?? ""}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Website Mode Navigation */}
          <div className="md:col-span-2 rounded-xl border border-sol-ink/10 bg-sol-sand/30 p-4">
            <p className="mb-3 text-xs font-black uppercase text-sol-muted">Navigation</p>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="showInNav"
                  name="showInNav"
                  type="checkbox"
                  defaultChecked={page?.showInNav ?? false}
                  className="h-4 w-4 accent-sol-accent"
                />
                <span className="text-sm font-semibold text-sol-ink">Vis i menuen</span>
              </label>
              <div className="flex items-center gap-2">
                <label htmlFor="navOrder" className="text-sm font-semibold text-sol-ink">Rækkefølge:</label>
                <input
                  id="navOrder"
                  name="navOrder"
                  type="number"
                  min="0"
                  defaultValue={page?.navOrder ?? 0}
                  className="w-20 rounded-lg border border-sol-ink/15 bg-transparent px-2 py-1 text-sm font-semibold text-sol-ink"
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Live Preview Side */}
      <div className="hidden lg:block sticky top-8">
        <div className="mb-3 flex justify-between items-center">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-sol-muted">
            Live Preview (Frontend)
          </h2>
        </div>
        <div className="rounded-2xl border border-sol-ink/20 shadow-2xl overflow-hidden bg-sol-cream h-[800px] overflow-y-auto">
          <div className="pointer-events-none origin-top scale-[0.8] w-[125%] h-full">
             <AnimatedPageContent 
               page={{ title: title || "Uden titel", heroImage: heroImage || null }} 
               blocks={blocks} 
             />
          </div>
        </div>
      </div>
    </div>
  );
}
