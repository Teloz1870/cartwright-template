"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Category } from "@prisma/client";

type Props = {
  categories: Category[];
  brands: string[];
  frameColors: string[];
  lensColors: string[];
  // Currently selected values
  q?: string;
  kategori?: string;
  brand?: string;
  stelfarve?: string;
  glasfarve?: string;
  minPris?: string;
  maxPris?: string;
  sort?: string;
};

const SORT_OPTIONS = [
  { value: "nyeste", label: "Nyeste" },
  { value: "pris-op", label: "Pris: lav → høj" },
  { value: "pris-ned", label: "Pris: høj → lav" },
];

const INPUT_CLASS =
  "w-full rounded-full border border-sol-sun bg-white px-4 py-2 text-sm text-sol-ink placeholder-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent";

const SELECT_CLASS =
  "w-full rounded-full border border-sol-sun bg-white px-4 py-2 text-sm text-sol-ink focus:outline-none focus:ring-2 focus:ring-sol-accent appearance-none cursor-pointer";

export function CatalogFilters({
  categories,
  brands,
  frameColors,
  lensColors,
  q = "",
  kategori = "",
  brand = "",
  stelfarve = "",
  glasfarve = "",
  minPris = "",
  maxPris = "",
  sort = "nyeste",
}: Props) {
  const router = useRouter();
  // useSearchParams is called here to be safe, but we push full URLs from props
  useSearchParams(); // ensures Suspense boundary above re-renders on change

  function buildUrl(overrides: Record<string, string>) {
    const current: Record<string, string> = {
      q,
      kategori,
      brand,
      stelfarve,
      glasfarve,
      minPris,
      maxPris,
      sort,
    };
    const merged = { ...current, ...overrides };
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(merged)) {
      if (val && val.trim() !== "" && val !== "nyeste") {
        params.set(key, val.trim());
      }
    }
    const qs = params.toString();
    return qs ? `/produkter?${qs}` : "/produkter";
  }

  function handleChange(key: string, value: string) {
    router.push(buildUrl({ [key]: value }));
  }

  function handleReset() {
    router.push("/produkter");
  }

  return (
    <aside className="flex flex-col gap-4 w-full">
      {/* Search */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Søg
        </label>
        <input
          type="search"
          placeholder="Navn eller brand…"
          defaultValue={q}
          className={INPUT_CLASS}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleChange("q", (e.target as HTMLInputElement).value);
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== q) {
              handleChange("q", e.target.value);
            }
          }}
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Kategori
        </label>
        <select
          value={kategori}
          onChange={(e) => handleChange("kategori", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Alle kategorier</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Brand */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Brand
        </label>
        <select
          value={brand}
          onChange={(e) => handleChange("brand", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Alle brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {/* Frame color */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Stelfarve
        </label>
        <select
          value={stelfarve}
          onChange={(e) => handleChange("stelfarve", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Alle stelfarver</option>
          {frameColors.map((fc) => (
            <option key={fc} value={fc}>
              {fc}
            </option>
          ))}
        </select>
      </div>

      {/* Lens color */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Glasfarve
        </label>
        <select
          value={glasfarve}
          onChange={(e) => handleChange("glasfarve", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Alle glasfarver</option>
          {lensColors.map((lc) => (
            <option key={lc} value={lc}>
              {lc}
            </option>
          ))}
        </select>
      </div>

      {/* Price range */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Pris (kr.)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            min={0}
            defaultValue={minPris}
            className={INPUT_CLASS}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleChange("minPris", (e.target as HTMLInputElement).value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== minPris) {
                handleChange("minPris", e.target.value);
              }
            }}
          />
          <input
            type="number"
            placeholder="Max"
            min={0}
            defaultValue={maxPris}
            className={INPUT_CLASS}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleChange("maxPris", (e.target as HTMLInputElement).value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== maxPris) {
                handleChange("maxPris", e.target.value);
              }
            }}
          />
        </div>
      </div>

      {/* Sort */}
      <div>
        <label className="block text-xs font-bold text-sol-ink mb-1 px-1">
          Sortering
        </label>
        <select
          value={sort}
          onChange={(e) => handleChange("sort", e.target.value)}
          className={SELECT_CLASS}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={handleReset}
        className="w-full rounded-full border border-sol-accent bg-white px-4 py-2 text-sm font-bold text-sol-accent hover:bg-sol-accent hover:text-white transition"
      >
        Nulstil
      </button>
    </aside>
  );
}
