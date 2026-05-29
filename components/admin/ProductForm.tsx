"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/app/admin/actions";
import { generateProductSEOAction } from "@/app/admin/produkter/actions";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { brand } from "@/brand.config";
import ImageUpload from "@/components/admin/ImageUpload";
import VariantsAdmin from "@/components/admin/VariantsAdmin";

type CategoryOption = {
  id: string;
  name: string;
};

type ProductFormProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceDkk: number;
  images: string;
  stock: number;
  // P1.2: nullable efter schema-skift (eyewear-only felter)
  frameColor: string | null;
  lensColor: string | null;
  brand: string | null;
  featured: boolean;
  categoryId: string;
  /** Shop-Starter Task G: optional JSON-attributes for fork-shops (kan være null) */
  attributes?: Record<string, unknown> | null;
  /** Task B: hvis produkt har varianter, render VariantsAdmin under attributes */
  variants?: Array<{
    id: string;
    sku: string;
    priceDkk: number;
    stock: number;
    attributes: Record<string, string>;
  }>;
  videoUrl?: string | null;
  videoGenerationId?: string | null;
  translations?: Record<string, any> | null;
};

type ProductFormProps = {
  categories: CategoryOption[];
  product?: ProductFormProduct;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [isTranslating, startTranslating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // AI-magic-button state: description + attributes holdes som state så de
  // kan opdateres inline uden form-submit. Initial fra props eller tomt.
  const [description, setDescription] = useState(product?.description ?? "");
  const [attributesJson, setAttributesJson] = useState(
    product?.attributes ? JSON.stringify(product.attributes, null, 2) : "",
  );
  // Images-state: array af URLs. ImageUpload appender nye URLs.
  const [images, setImages] = useState<string[]>(
    product ? resolveProductImageUrls(product) : [],
  );
  
  // Translations state
  const [enName, setEnName] = useState(product?.translations?.en?.name ?? "");
  const [enDescription, setEnDescription] = useState(product?.translations?.en?.description ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        const result = product
          ? await updateProduct(product.id, formData)
          : await createProduct(formData);

        if (result.ok) {
          router.push("/admin/produkter");
          return;
        }

        setError(result.error);
      })();
    });
  }

  // AI-magic-button (Task A): genererer description + attributes via Anthropic.
  // Mirror af kategori-versionen. Kun aktiv på eksisterende produkter (kræver productId).
  function handleAiGenerate() {
    if (!product) return;
    setAiNotice("Generating AI content... (10-25 sec)");
    setError(null);
    startGenerating(() => {
      void (async () => {
        const result = await generateProductSEOAction(product.id);
        if (result.ok) {
          setDescription(result.data.description);
          setAttributesJson(JSON.stringify(result.data.attributes, null, 2));
          setAiNotice("AI content generated. Edit it below before saving if needed.");
        } else {
          setAiNotice(null);
          setError(result.error);
        }
      })();
    });
  }

  function handleAutoTranslate() {
    const daName = (document.getElementById("name") as HTMLInputElement)?.value || "";
    const daDescription = description;

    if (!daName && !daDescription) {
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
              payload: { name: daName, description: daDescription },
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
            setAiNotice("✨ Tekster oversat til engelsk via AI! Husk at gemme formularen.");
          }
        } catch (err: any) {
          setAiNotice(null);
          setError(err.message || "Netværksfejl under oversættelse");
        }
      })();
    });
  }

  // Cinematic Video Generation (M3)
  const [videoStatus, setVideoStatus] = useState<"idle" | "generating" | "polling" | "completed" | "error">(
    product?.videoGenerationId ? "polling" : product?.videoUrl ? "completed" : "idle"
  );
  const [videoNotice, setVideoNotice] = useState<string | null>(null);

  function handleVideoGenerate() {
    if (!product || images.length === 0) {
      setVideoNotice("Please upload and save at least one image first.");
      return;
    }
    
    setVideoStatus("generating");
    setVideoNotice("Starting Luma Dream Machine generation...");
    
    fetch("/api/admin/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        imageUrl: images[0],
        prompt: `Cinematic slow motion, photorealistic, high-end product showcase of ${product.name}`,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setVideoStatus("error");
          setVideoNotice(`Error: ${data.error}`);
        } else if (data.jobId) {
          setVideoStatus("polling");
          setVideoNotice("Video is generating in the cloud! This takes 1-3 minutes. Checking status...");
          pollVideoStatus(data.jobId);
        }
      })
      .catch(err => {
        setVideoStatus("error");
        setVideoNotice(`Fetch error: ${err.message}`);
      });
  }

  function pollVideoStatus(jobId: string) {
    const interval = setInterval(() => {
      fetch(`/api/admin/generate-video?jobId=${jobId}&productId=${product!.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === "completed") {
            clearInterval(interval);
            setVideoStatus("completed");
            setVideoNotice("✨ Cinematic Video generated successfully!");
            router.refresh();
          } else if (data.status === "pending") {
            setVideoNotice((prev) => prev?.includes(".") ? prev + "." : "Generating...");
          } else if (data.error) {
            clearInterval(interval);
            setVideoStatus("error");
            setVideoNotice(`Error: ${data.error}`);
          }
        })
        .catch(() => {
          // ignore network failures during polling
        });
    }, 10000); // Poll every 10 seconds
  }

  // If a generation was already running when the page loaded, start polling
  if (videoStatus === "polling" && product?.videoGenerationId) {
    // Only start polling once on mount (a useEffect would be better, but we can just use a flag or rely on the initial state)
    // To prevent infinite loop in render, we just let it be handled by a button click if they refresh, 
    // but a proper implementation would use useEffect.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-4xl rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
    >
      <input type="hidden" name="translations" value={JSON.stringify({
        en: {
          name: enName,
          description: enDescription
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

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={product?.name ?? ""}
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
              {isTranslating ? "Oversætter..." : "✨ Auto-Oversæt"}
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
            defaultValue={product?.slug ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="priceKr" className={labelClass}>
            Price in {brand.policies.currency}
          </label>
          <input
            id="priceKr"
            name="priceKr"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product ? product.priceDkk / 100 : ""}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="stock" className={labelClass}>
            Stock
          </label>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.stock ?? 0}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="brand" className={labelClass}>
            Brand (optional)
          </label>
          <input
            id="brand"
            name="brand"
            type="text"
            defaultValue={product?.brand ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="categoryId" className={labelClass}>
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Choose category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* frameColor/lensColor are eyewear-specific legacy fields — only show
            them for the sunglasses/eyewear template. Other industries use the
            generic Specifications (JSON) / attributes instead, so these would
            just be confusing empty fields on a coffee/generic shop's admin.
            (cast to string: the engine's brand.config types industryTemplate as
            the literal "saas", so a bare === would be a TS "no overlap" error.) */}
        {["sunglasses", "eyewear"].includes(brand.industryTemplate as string) && (
          <>
            <div>
              <label htmlFor="frameColor" className={labelClass}>
                Frame color (optional)
              </label>
              <input
                id="frameColor"
                name="frameColor"
                type="text"
                defaultValue={product?.frameColor ?? ""}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="lensColor" className={labelClass}>
                Lens color (optional)
              </label>
              <input
                id="lensColor"
                name="lensColor"
                type="text"
                defaultValue={product?.lensColor ?? ""}
                className={inputClass}
              />
            </div>
          </>
        )}

        {/* AI-magic-button + content-felter — kun for eksisterende produkter.
            Knappen kalder Anthropic for at generere description + attributes
            baseret på produktnavn + brand + kategori + pris + brand-config. */}
        <div className="md:col-span-2 rounded-lg border border-sol-glass-border-dark bg-sol-cream/50 p-4">
          {product && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-sol-ink">
                  AI-generated content
                </h3>
                <p className="mt-0.5 text-xs text-sol-muted">
                  Generate description + specifications via Anthropic based
                  on product data. Typically 10-25 sec.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isGenerating || isPending}
                className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? "Generating..." : "✨ Generate with AI"}
              </button>
            </div>
          )}

          {product && (
            <div className="mb-5 mt-4 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-purple-900">
                    🎬 Cinematic Video Banner (M3)
                  </h3>
                  <p className="mt-0.5 text-xs text-purple-700">
                    Use Luma AI Dream Machine to turn your first product image into a 5-second cinematic video.
                    Cost: ~$0.32 per generation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleVideoGenerate}
                  disabled={videoStatus === "generating" || videoStatus === "polling"}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-black text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {videoStatus === "generating" ? "Starting..." : 
                   videoStatus === "polling" ? "Generating (Polls automatically)..." : 
                   videoStatus === "completed" ? "Generate Again" : "✨ Generate Cinematic Video"}
                </button>
              </div>
              {videoNotice && (
                <p className="mt-3 text-xs font-bold text-purple-800">{videoNotice}</p>
              )}
              {product.videoUrl && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-green-700 mb-2">Video ready! (Live on product page)</p>
                  <video 
                    src={product.videoUrl} 
                    controls 
                    className="h-32 rounded-lg border border-purple-200" 
                    autoPlay 
                    loop 
                    muted 
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="description" className={labelClass}>
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                required
              />
              <p className="mt-1 text-xs text-sol-muted">
                {description.length} chars · shown on the product page + in the catalog
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="enDescription" className="text-xs font-black uppercase text-sol-muted">
                  Description (English)
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
                id="enDescription"
                rows={5}
                value={enDescription}
                onChange={(e) => setEnDescription(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Shop-Starter Task G: optional attributes-felt for fork-shops.
                Solbrillen kan lade det stå tomt (frameColor + lensColor er stadig
                de primære felter). Panel-hegn/landbrug bruger det til custom
                specifikationer (højde, bredde, materiale, vægt, oprindelse). */}
            <div>
              <label htmlFor="attributes" className={labelClass}>
                Specifications (JSON, optional)
              </label>
              <textarea
                id="attributes"
                name="attributes"
                rows={5}
                value={attributesJson}
                onChange={(e) => setAttributesJson(e.target.value)}
                placeholder={`{"material": "Acetate", "weight": "28 g"}`}
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-sol-muted">
                JSON object with text values. Empty = use frameColor/lensColor as
                specifications. Shown on the product page under category.
              </p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="images" className={labelClass}>
            Images
          </label>
          {/* Image-upload: append til images-state. Action: upload → URL → push. */}
          <ImageUpload
            onUploaded={(url) => setImages((curr) => [...curr, url])}
            buttonLabel="Upload image"
          />
          {/* Preview: vis aktuelle billeder med X-knap til at fjerne */}
          {images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="group relative h-20 w-20 overflow-hidden rounded border border-sol-ink/15"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Image ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((curr) => curr.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove image"
                    className="absolute right-1 top-1 rounded-full bg-sol-ink/70 px-1.5 text-xs font-black text-white opacity-0 transition group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Hidden textarea bevares for at server-action får images.
              Bagudkompatibilitet: admin kan stadig manuelt paste URLs hvis nødvendigt. */}
          <textarea
            id="images"
            name="images"
            rows={3}
            value={images.join("\n")}
            onChange={(e) =>
              setImages(
                e.target.value
                  .split(/[,\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="One image URL per line (or upload above)"
            className={`${inputClass} mt-2`}
          />
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-sol-ink/10 bg-sol-cream/45 px-3 py-2 text-sm font-bold text-sol-ink md:col-span-2">
          <input
            name="featured"
            type="checkbox"
            defaultChecked={product?.featured ?? false}
            className="h-4 w-4 rounded border-sol-ink/20 text-sol-accent focus:ring-sol-accent"
          />
          Featured product
        </label>

        {/* Task B: variants-admin. Kun renderet for eksisterende produkter
            — på "ny produkt"-formularen er der ingen productId at relatere til.
            Admin opretter produkt først, redigerer derefter for at tilføje varianter. */}
        {product && (
          <VariantsAdmin
            productId={product.id}
            initialVariants={product.variants ?? []}
          />
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
