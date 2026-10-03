"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DeleteProductButton from "@/components/admin/DeleteProductButton";
import { formatPriceDkk } from "@/lib/format";
import { bulkUpdateProducts, type BulkUpdate } from "./bulk-actions";

type Row = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  categoryName: string;
  priceDkk: number;
  stock: number;
  featured: boolean;
};

const input = "rounded-lg border-2 border-sol-ink/10 bg-white px-2 py-1.5 text-sm text-sol-ink";

export function BulkProductTable({
  products,
  categories,
}: {
  products: Row[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priceKr, setPriceKr] = useState("");
  const [stock, setStock] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [featured, setFeatured] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const allSelected = products.length > 0 && selected.size === products.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function apply() {
    setMsg(null);
    const updates: BulkUpdate = {};
    if (priceKr.trim()) updates.priceKr = Number(priceKr);
    if (stock.trim()) updates.stock = Number(stock);
    if (categoryId) updates.categoryId = categoryId;
    if (featured) updates.featured = featured === "yes";
    startTransition(async () => {
      const r = await bulkUpdateProducts([...selected], updates);
      if (r.ok) {
        setMsg(`${r.count} product(s) updated.`);
        setSelected(new Set());
        setPriceKr("");
        setStock("");
        setCategoryId("");
        setFeatured("");
        router.refresh();
      } else {
        setMsg(r.error ?? "Error.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border-2 border-sol-accent/30 bg-sol-accent/5 p-3">
          <span className="text-sm font-bold text-sol-ink">{selected.size} selected:</span>
          <input className={`${input} w-24`} placeholder="Price (kr)" value={priceKr} onChange={(e) => setPriceKr(e.target.value)} />
          <input className={`${input} w-20`} placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} />
          <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className={input} value={featured} onChange={(e) => setFeatured(e.target.value)}>
            <option value="">Featured…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={apply}
            className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {pending ? "Updating…" : "Apply"}
          </button>
          {msg && <span className="text-sm text-sol-muted">{msg}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
            <tr>
              <th className="px-3 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-5 py-3 font-black">Name</th>
              <th className="px-5 py-3 font-black">Brand</th>
              <th className="px-5 py-3 font-black">Category</th>
              <th className="px-5 py-3 text-right font-black">Price</th>
              <th className="px-5 py-3 text-right font-black">Stock</th>
              <th className="px-5 py-3 text-center font-black">Featured</th>
              <th className="px-5 py-3 text-right font-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sol-ink/10">
            {products.map((product) => (
              <tr key={product.id} className={selected.has(product.id) ? "bg-sol-accent/5" : ""}>
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                    aria-label={`Select ${product.name}`}
                  />
                </td>
                <td className="px-5 py-3">
                  <div className="font-black text-sol-ink">{product.name}</div>
                  <div className="text-xs font-semibold text-sol-muted">{product.slug}</div>
                </td>
                <td className="px-5 py-3 font-semibold text-sol-ink">{product.brand}</td>
                <td className="px-5 py-3 text-sol-muted">{product.categoryName}</td>
                <td className="px-5 py-3 text-right font-black text-sol-ink">{formatPriceDkk(product.priceDkk)}</td>
                <td className="px-5 py-3 text-right font-semibold text-sol-muted">{product.stock}</td>
                <td className="px-5 py-3 text-center font-black text-sol-ink">{product.featured ? "✓" : "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/produkter/${product.id}`}
                      className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
                    >
                      Edit
                    </Link>
                    <DeleteProductButton productId={product.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
