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
  translations?: Record<string, { name?: string; description?: string; descriptionLong?: string }> | null;
};

type CategoryFormProps = {
  category?: CategoryFormCategory;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [isTranslating, startTranslating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);

  // SEO fields are held in React state so the AI magic button can update them
  // inline without a form submit. Initial values from props (an existing category)
  // or empty strings (a new category).
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    category?.metaDescription ?? "",
  );
  const [descriptionLong, setDescriptionLong] = useState(
    category?.descriptionLong ?? "",
  );
  const [faq, setFaq] = useState(category?.faq ?? "");
  // Image upload state: held as controlled values so ImageUpload can
  // update them inline after a Vercel Blob upload.
  const [heroImageUrl, setHeroImageUrl] = useState(category?.heroImage ?? "");
  const [heroVideoUrl, setHeroVideoUrl] = useState(category?.heroVideo ?? "");
  
  // Translations state
  const [enName, setEnName] = useState(category?.translations?.en?.name ?? "");
  const [enDescription, setEnDescription] = useState(category?.translations?.en?.description ?? "");
  const [enDescriptionLong, setEnDescriptionLong] = useState(category?.translations?.en?.descriptionLong ?? "");

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

  // Phase SEO Task H: AI magic button — calls a server action that generates
  // all 4 SEO fields via Anthropic + updates state. The admin can then
  // edit before Save. Only active on existing categories (requires categoryId).
  function handleAiGenerate() {
    if (!category) return;
    setAiNotice("Generating SEO content with AI... (10-30 sec)");
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
            "SEO content generated. Edit it below before saving if needed.",
          );
        } else {
          setAiNotice(null);
          setError(result.error);
        }
      })();
    });
  }

  function handleAutoTranslate() {
    const daName = (document.getElementById("name") as HTMLInputElement)?.value || "";
    const daDescription = (document.getElementById("description") as HTMLTextAreaElement)?.value || "";
    const daDescriptionLong = descriptionLong;

    if (!daName && !daDescription && !daDescriptionLong) {
      setAiNotice("Please fill in the source text first.");
      return;
    }

    setAiNotice("Translating text to English via AI...");
    setError(null);

    startTranslating(() => {
      void (async () => {
        try {
          const res = await fetch("/api/admin/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payload: { name: daName, description: daDescription, descriptionLong: daDescriptionLong },
              targetLocale: "en",
              sourceLocale: "da",
            }),
          });
          const data = await res.json();

          if (!res.ok || data.error) {
            setAiNotice(null);
            setError(data.error || "Failed to translate");
          } else {
            setEnName(data.name || "");
            setEnDescription(data.description || "");
            setEnDescriptionLong(data.descriptionLong || "");
            setAiNotice("✨ Text translated to English via AI! Remember to save the form.");
          }
        } catch (err) {
          setAiNotice(null);
          setError(err instanceof Error ? err.message : "Network error during translation");
        }
      })();
    });
  }
  async function handleGenerateVideo() {
    if (!heroImageUrl) {
      setError("You must upload or set a Hero image first before generating a video.");
      return;
    }
    
    setIsVideoGenerating(true);
    setError(null);
    setVideoNotice("Submitting image to AI Video API...");

    try {
      const res = await fetch("/api/admin/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: heroImageUrl,
          prompt: "Cinematic slow motion, photorealistic, elegant product showcase, 4k, hyper-detailed",
          categoryId: category?.id
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start video generation");
      }

      const { jobId } = await res.json();
      setVideoNotice("AI is generating your video. This usually takes 60-120 seconds. Please wait...");

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/admin/generate-video?jobId=${jobId}${category?.id ? `&categoryId=${category.id}` : ''}`);
          const pollData = await pollRes.json();

          if (pollData.status === "completed") {
            clearInterval(pollInterval);
            setHeroVideoUrl(pollData.videoUrl);
            setVideoNotice("Video generation complete! Don't forget to Save Category.");
            setIsVideoGenerating(false);
          } else if (pollData.error) {
            clearInterval(pollInterval);
            setError(pollData.error);
            setVideoNotice(null);
            setIsVideoGenerating(false);
          }
        } catch {
          // ignore network errors on poll, keep trying
        }
      }, 5000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setVideoNotice(null);
      setIsVideoGenerating(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-4xl rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
    >
      <input type="hidden" name="translations" value={JSON.stringify({
        en: {
          name: enName,
          description: enDescription,
          descriptionLong: enDescriptionLong
        }
      })} />
      
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
      {videoNotice && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-[color-mix(in_oklab,var(--cw-brand)_30%,transparent)] bg-[color-mix(in_oklab,var(--cw-brand)_5%,transparent)] px-4 py-3 text-sm font-bold text-[var(--cw-brand-deep)]">
          {isVideoGenerating && (
            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          )}
          {videoNotice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
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
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="enName" className="text-xs font-black uppercase text-sol-muted">
              Name (English)
            </label>
            <button
              type="button"
              onClick={handleAutoTranslate}
              disabled={isTranslating}
              className="text-xs font-bold text-sol-accent transition hover:text-sol-accent-deep disabled:opacity-50"
            >
              {isTranslating ? "Translating..." : "✨ Auto-Translate"}
            </button>
          </div>
          <input
            id="enName"
            type="text"
            value={enName}
            onChange={(e) => setEnName(e.target.value)}
            className={inputClass}
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
            Short description (1-line intro shown in the category hero)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={category?.description ?? ""}
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="enDescription" className="text-xs font-black uppercase text-sol-muted">
              Short description (English)
            </label>
            <button
              type="button"
              onClick={handleAutoTranslate}
              disabled={isTranslating}
              className="text-xs font-bold text-sol-accent transition hover:text-sol-accent-deep disabled:opacity-50"
            >
              {isTranslating ? "Translating..." : "✨ Auto-Translate"}
            </button>
          </div>
          <textarea
            id="enDescription"
            rows={2}
            value={enDescription}
            onChange={(e) => setEnDescription(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Hero image: upload + URL field. Phase 8 + MVP-C: the admin can either
            uploade fil (Vercel Blob) ELLER paste URL (Unsplash osv.).
            Falls back to CATEGORY_IMAGES[slug] if blank. */}
        <div className="md:col-span-2">
          <label htmlFor="heroImage" className={labelClass}>
            Hero image (optional)
          </label>
          <ImageUpload
            onUploaded={setHeroImageUrl}
            currentUrl={heroImageUrl}
            buttonLabel="Upload image"
          />
          <input
            id="heroImage"
            name="heroImage"
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/... or upload above"
            className={`${inputClass} mt-2`}
          />
          <p className="mt-1 text-xs text-sol-muted">
            Empty = falls back to the default image for the category.
          </p>
        </div>

        {/* Hero video: upload + URL field. Uses heroImage as the poster +
            fallback. Recommend a 5-10 s loop, max 10 MB, no audio. */}
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="heroVideo" className={labelClass}>
              Hero video (optional, mp4)
            </label>
            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isVideoGenerating || !heroImageUrl}
              className="rounded-lg bg-[var(--cw-brand)] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[var(--cw-brand-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVideoGenerating ? "Generating..." : "🎬 Generate AI Cinematic Banner"}
            </button>
          </div>
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
            placeholder="https://videos.pexels.com/.../video.mp4 or upload above"
            className={`${inputClass} mt-2`}
          />
          <p className="mt-1 text-xs text-sol-muted">
            Empty = static hero image only. Hero image is used as poster
            (shown before the video loads + on slow networks).
          </p>
        </div>
      </div>

      {/* === SEO section with AI magic button === */}
      <div className="mt-8 border-t border-sol-ink/10 pt-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-sol-ink">SEO content</h2>
            <p className="mt-1 text-xs text-sol-muted">
              Rich content for Google indexing + the category page long-form
              sections. AI can generate all 4 fields in 15-30 sec based on
              brand configuration and the products in this category.
            </p>
          </div>
          {category && (
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={isGenerating || isPending}
              className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "✨ Generate SEO with AI"}
            </button>
          )}
        </div>

        <div className="grid gap-4">
          <div>
            <label htmlFor="metaTitle" className={labelClass}>
              Meta title (50-60 chars optimal)
            </label>
            <input
              id="metaTitle"
              name="metaTitle"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Example: Men's sunglasses - UV400 + Danish design | solbrillen.dk"
              className={inputClass}
              maxLength={80}
            />
            <p className="mt-1 text-xs text-sol-muted">
              Shown as blue link text in Google. {metaTitle.length}/60 chars.
            </p>
          </div>

          <div>
            <label htmlFor="metaDescription" className={labelClass}>
              Meta description (150-155 chars optimal)
            </label>
            <textarea
              id="metaDescription"
              name="metaDescription"
              rows={2}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Shown as snippet under the title in Google. Hook + USP + CTA."
              className={inputClass}
              maxLength={180}
            />
            <p className="mt-1 text-xs text-sol-muted">
              {metaDescription.length}/155 chars.
            </p>
          </div>

          <div>
            <label htmlFor="descriptionLong" className={labelClass}>
              Long-form content (300-400 words, markdown-like)
            </label>
            <textarea
              id="descriptionLong"
              name="descriptionLong"
              rows={12}
              value={descriptionLong}
              onChange={(e) => setDescriptionLong(e.target.value)}
              placeholder="Write long-form intro text. Use ## for h2 headings. Blank lines separate paragraphs."
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-sol-muted">
              {descriptionLong.length} chars. Shown in the intro section on
              the category page. Use ## for h2 headings.
            </p>
          </div>

          <div>
            <label htmlFor="enDescriptionLong" className={labelClass}>
              Long-form content (English)
            </label>
            <textarea
              id="enDescriptionLong"
              rows={12}
              value={enDescriptionLong}
              onChange={(e) => setEnDescriptionLong(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>

          <div>
            <label htmlFor="faq" className={labelClass}>
              FAQ (JSON array of {`{ q, a }`}-objekter)
            </label>
            <textarea
              id="faq"
              name="faq"
              rows={8}
              value={faq}
              onChange={(e) => setFaq(e.target.value)}
              placeholder={`[\n  {"q": "Question?", "a": "Answer"},\n  ...\n]`}
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-sol-muted">
              Rendered as accordions + Schema.org FAQPage JSON-LD (Google
              rich snippets). 4-5 Q&As recommended.
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
          {isPending ? "Saving..." : "Save category"}
        </button>
      </div>
    </form>
  );
}
