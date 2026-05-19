"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/app/admin/actions";
import { generateProductSEOAction } from "@/app/admin/produkter/actions";
import { parseProductImages } from "@/lib/products";
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
};

type ProductFormProps = {
  categories: CategoryOption[];
  product?: ProductFormProduct;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
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
    product ? parseProductImages(product.images) : [],
  );

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
    setAiNotice("Genererer AI-content… (10-25 sek)");
    setError(null);
    startGenerating(() => {
      void (async () => {
        const result = await generateProductSEOAction(product.id);
        if (result.ok) {
          setDescription(result.data.description);
          setAttributesJson(JSON.stringify(result.data.attributes, null, 2));
          setAiNotice("✓ AI-content genereret. Rediger evt. nedenfor inden Gem.");
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
            defaultValue={product?.name ?? ""}
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
            defaultValue={product?.slug ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="priceKr" className={labelClass}>
            Pris i kr.
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
            Lager
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
            Brand (valgfri)
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
            Kategori
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Vælg kategori
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="frameColor" className={labelClass}>
            Stelfarve (valgfri)
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
            Glasfarve (valgfri)
          </label>
          <input
            id="lensColor"
            name="lensColor"
            type="text"
            defaultValue={product?.lensColor ?? ""}
            className={inputClass}
          />
        </div>

        {/* AI-magic-button + content-felter — kun for eksisterende produkter.
            Knappen kalder Anthropic for at generere description + attributes
            baseret på produktnavn + brand + kategori + pris + brand-config. */}
        <div className="md:col-span-2 rounded-lg border border-sol-glass-border-dark bg-sol-cream/50 p-4">
          {product && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-sol-ink">
                  AI-genereret indhold
                </h3>
                <p className="mt-0.5 text-xs text-sol-muted">
                  Generér beskrivelse + specifikationer via Anthropic baseret
                  på produkt-data. 10-25 sek typisk.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isGenerating || isPending}
                className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? "Genererer…" : "✨ Generér med AI"}
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="description" className={labelClass}>
                Beskrivelse
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
                {description.length} chars · vises på produktsiden + i kataloget
              </p>
            </div>

            {/* Shop-Starter Task G: optional attributes-felt for fork-shops.
                Solbrillen kan lade det stå tomt (frameColor + lensColor er stadig
                de primære felter). Panel-hegn/landbrug bruger det til custom
                specifikationer (højde, bredde, materiale, vægt, oprindelse). */}
            <div>
              <label htmlFor="attributes" className={labelClass}>
                Specifikationer (JSON, valgfri)
              </label>
              <textarea
                id="attributes"
                name="attributes"
                rows={5}
                value={attributesJson}
                onChange={(e) => setAttributesJson(e.target.value)}
                placeholder={`{"materiale": "Acetat", "vægt": "28 g"}`}
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-sol-muted">
                JSON-objekt med tekst-værdier. Tom = brug frameColor/lensColor som
                specifikationer. Vises på produktside under kategori.
              </p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="images" className={labelClass}>
            Billeder
          </label>
          {/* Image-upload: append til images-state. Action: upload → URL → push. */}
          <ImageUpload
            onUploaded={(url) => setImages((curr) => [...curr, url])}
            buttonLabel="Upload billede"
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
                    alt={`Billede ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((curr) => curr.filter((_, i) => i !== idx))
                    }
                    aria-label="Fjern billede"
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
            placeholder="Én billed-URL pr. linje (eller upload ovenfor)"
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
          Fremhævet produkt
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
          {isPending ? "Gemmer…" : "Gem produkt"}
        </button>
      </div>
    </form>
  );
}
