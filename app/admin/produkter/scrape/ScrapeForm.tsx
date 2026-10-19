"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { scrapeProductAction, createScrapedProductAction } from "./actions";
import type { ScrapedProduct } from "@/lib/scrape/product";

const input = "w-full rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 text-sm text-sol-ink";

export function ScrapeForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<ScrapedProduct | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function scrape() {
    setMsg(null);
    setDraft(null);
    startTransition(async () => {
      const r = await scrapeProductAction(url);
      if (r.ok) setDraft(r.product);
      else setMsg({ ok: false, text: r.error });
    });
  }

  function create() {
    if (!draft) return;
    setMsg(null);
    startTransition(async () => {
      const r = await createScrapedProductAction({
        name: draft.name,
        description: draft.description,
        priceKr: draft.priceKr,
        attributes: draft.attributes,
        imageUrls: draft.imageUrls,
        categoryId,
      });
      if (r.ok) router.push(`/admin/produkter/${r.id}`);
      else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex gap-2">
        <input
          className={input}
          placeholder="https://eksempel.dk/produkt/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || !url.trim()}
          onClick={scrape}
          className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {pending ? "Scraper…" : "Scrap"}
        </button>
      </div>
      <p className="text-xs text-sol-muted">
        Only from sites you own or have permission to import from. Requires
        FIRECRAWL_API_KEY.
      </p>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}

      {draft && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase text-sol-muted">Name</span>
            <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase text-sol-muted">Description</span>
            <textarea
              className={`${input} min-h-[120px]`}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase text-sol-muted">Pris (kr)</span>
              <input
                className={input}
                value={draft.priceKr ?? ""}
                onChange={(e) => setDraft({ ...draft, priceKr: e.target.value ? Number(e.target.value) : null })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase text-sol-muted">Kategori</span>
              <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          {draft.attributes.length > 0 && (
            <p className="text-xs text-sol-muted">
              {draft.attributes.length} attributes · {draft.imageUrls.length} images found
            </p>
          )}
          {draft.imageUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {draft.imageUrls.slice(0, 6).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={pending || !categoryId}
            onClick={create}
            className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create product"}
          </button>
        </div>
      )}
    </div>
  );
}
