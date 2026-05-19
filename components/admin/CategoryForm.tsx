"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/app/admin/actions";
import { generateCategorySEOAction } from "@/app/admin/kategorier/actions";
import ImageUpload from "@/components/admin/ImageUpload";

type CategoryFormCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  heroImage: string | null;
  heroVideo: string | null;
  descriptionLong: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  faq: string | null;
};

type CategoryFormProps = {
  category?: CategoryFormCategory;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // SEO-felter holdes i React-state så AI-magic-button kan opdatere dem inline
  // uden form-submit. Initial-værdier fra props (eksisterende kategori) eller
  // tom-strings (ny kategori).
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    category?.metaDescription ?? "",
  );
  const [descriptionLong, setDescriptionLong] = useState(
    category?.descriptionLong ?? "",
  );
  const [faq, setFaq] = useState(category?.faq ?? "");
  // Image-upload-state: holdes som controlled values så ImageUpload kan
  // opdatere dem inline efter Vercel Blob-upload.
  const [heroImageUrl, setHeroImageUrl] = useState(category?.heroImage ?? "");
  const [heroVideoUrl, setHeroVideoUrl] = useState(category?.heroVideo ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        const result = category
          ? await updateCategory(category.id, formData)
          : await createCategory(formData);

        if (result.ok) {
          router.push("/admin/kategorier");
          return;
        }

        setError(result.error);
      })();
    });
  }

  // Phase SEO Task H: AI-magic-button — kalder server-action der genererer
  // alle 4 SEO-felter via Anthropic + opdaterer state. Admin kan derefter
  // redigere før Save. Kun aktiv på eksisterende kategorier (kræver categoryId).
  function handleAiGenerate() {
    if (!category) return;
    setAiNotice("Genererer SEO-content via AI… (10-30 sek)");
    setError(null);
    startGenerating(() => {
      void (async () => {
        const result = await generateCategorySEOAction(category.id);
        if (result.ok) {
          setMetaTitle(result.data.metaTitle);
          setMetaDescription(result.data.metaDescription);
          setDescriptionLong(result.data.descriptionLong);
          setFaq(JSON.stringify(result.data.faq, null, 2));
          setAiNotice(
            "✓ SEO-content genereret. Rediger evt. nedenfor inden Gem.",
          );
        } else {
          setAiNotice(null);
          setError(result.error);
        }
      })();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-4xl rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm"
    >
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
          <label htmlFor="name" className={labelClass}>
            Navn
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={category?.name ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="slug" className={labelClass}>
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            defaultValue={category?.slug ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="description" className={labelClass}>
            Kort beskrivelse (1-linje intro vist i kategori-hero)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={category?.description ?? ""}
            className={inputClass}
          />
        </div>

        {/* Hero-image: upload + URL-felt. Phase 8 + MVP-C: admin kan enten
            uploade fil (Vercel Blob) ELLER paste URL (Unsplash osv.).
            Fallback til CATEGORY_IMAGES[slug] hvis blank. */}
        <div className="md:col-span-2">
          <label htmlFor="heroImage" className={labelClass}>
            Hero-billede (valgfri)
          </label>
          <ImageUpload
            onUploaded={setHeroImageUrl}
            currentUrl={heroImageUrl}
            buttonLabel="Upload billede"
          />
          <input
            id="heroImage"
            name="heroImage"
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/... eller upload ovenfor"
            className={`${inputClass} mt-2`}
          />
          <p className="mt-1 text-xs text-sol-muted">
            Tom = falder tilbage til standard-billede pr. kategori.
          </p>
        </div>

        {/* Hero-video: upload + URL-felt. Bruger heroImage som poster +
            fallback. Anbefal 5-10 sek loop, max 10 MB, ingen lyd. */}
        <div className="md:col-span-2">
          <label htmlFor="heroVideo" className={labelClass}>
            Hero-video (valgfri, mp4)
          </label>
          <ImageUpload
            onUploaded={setHeroVideoUrl}
            currentUrl={heroVideoUrl}
            acceptVideo
            buttonLabel="Upload video"
          />
          <input
            id="heroVideo"
            name="heroVideo"
            type="url"
            value={heroVideoUrl}
            onChange={(e) => setHeroVideoUrl(e.target.value)}
            placeholder="https://videos.pexels.com/.../video.mp4 eller upload ovenfor"
            className={`${inputClass} mt-2`}
          />
          <p className="mt-1 text-xs text-sol-muted">
            Tom = kun statisk hero-billede. Hero-billede bruges som poster
            (vises før video loader + ved langsom netværk).
          </p>
        </div>
      </div>

      {/* === SEO-sektion med AI-magic-button === */}
      <div className="mt-8 border-t border-sol-ink/10 pt-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-sol-ink">SEO-content</h2>
            <p className="mt-1 text-xs text-sol-muted">
              Rich content for Google-indexering + kategori-sidens long-form
              sections. AI kan generere alle 4 felter på 15-30 sek baseret på
              brand-konfiguration og produkterne i denne kategori.
            </p>
          </div>
          {category && (
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={isGenerating || isPending}
              className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? "Genererer…" : "✨ Generér SEO med AI"}
            </button>
          )}
        </div>

        <div className="grid gap-4">
          <div>
            <label htmlFor="metaTitle" className={labelClass}>
              Meta title (50-60 chars optimalt)
            </label>
            <input
              id="metaTitle"
              name="metaTitle"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Fx: Herresolbriller — UV400 + dansk design | solbrillen.dk"
              className={inputClass}
              maxLength={80}
            />
            <p className="mt-1 text-xs text-sol-muted">
              Vist som blå link-tekst i Google. {metaTitle.length}/60 chars.
            </p>
          </div>

          <div>
            <label htmlFor="metaDescription" className={labelClass}>
              Meta description (150-155 chars optimalt)
            </label>
            <textarea
              id="metaDescription"
              name="metaDescription"
              rows={2}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Vises som snippet under titel i Google. Hook + USP + CTA."
              className={inputClass}
              maxLength={180}
            />
            <p className="mt-1 text-xs text-sol-muted">
              {metaDescription.length}/155 chars.
            </p>
          </div>

          <div>
            <label htmlFor="descriptionLong" className={labelClass}>
              Long-form content (300-400 ord, markdown-like)
            </label>
            <textarea
              id="descriptionLong"
              name="descriptionLong"
              rows={12}
              value={descriptionLong}
              onChange={(e) => setDescriptionLong(e.target.value)}
              placeholder="Skriv long-form intro-tekst. Brug ## for h2-headings. Blanke linjer adskiller paragraffer."
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-sol-muted">
              {descriptionLong.length} chars. Vises i intro-section på
              kategori-siden. Brug ## for h2-headings.
            </p>
          </div>

          <div>
            <label htmlFor="faq" className={labelClass}>
              FAQ (JSON-array af {`{ q, a }`}-objekter)
            </label>
            <textarea
              id="faq"
              name="faq"
              rows={8}
              value={faq}
              onChange={(e) => setFaq(e.target.value)}
              placeholder={`[\n  {"q": "Spørgsmål?", "a": "Svar"},\n  ...\n]`}
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-sol-muted">
              Rendret som accordions + Schema.org FAQPage JSON-LD (Google
              rich-snippets). 4-5 Q&A anbefales.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="submit"
          disabled={isPending || isGenerating}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Gemmer…" : "Gem kategori"}
        </button>
      </div>
    </form>
  );
}
