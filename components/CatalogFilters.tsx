"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Category } from "@/app/generated/prisma/client";

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

const INPUT_CLASS =
  "w-full rounded-full border border-sol-sun bg-white dark:bg-sol-sand px-4 py-2 text-sm text-sol-ink placeholder-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent";

const SELECT_CLASS =
  "w-full rounded-full border border-sol-sun bg-white dark:bg-sol-sand px-4 py-2 text-sm text-sol-ink focus:outline-none focus:ring-2 focus:ring-sol-accent appearance-none cursor-pointer";

const LABEL_CLASS = "block text-xs font-bold text-sol-ink mb-1 px-1";

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
  const locale = useLocale();
  const t = useTranslations("Catalog");
  // useSearchParams is called here to be safe, but we push full URLs from props
  useSearchParams(); // ensures Suspense boundary above re-renders on change

  const sortOptions = [
    { value: "nyeste", label: t("sortNewest") },
    { value: "pris-op", label: t("sortPriceAsc") },
    { value: "pris-ned", label: t("sortPriceDesc") },
  ];

  // Locale-prefixed base: a bare `/produkter` push gets middleware-redirected
  // to the DEFAULT locale, bouncing an /en visitor into Danish on every
  // filter change (same bug class as the footer links fixed in #469).
  const baseUrl = `/${locale}/produkter`;

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
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }

  function handleChange(key: string, value: string) {
    router.push(buildUrl({ [key]: value }));
  }

  function handleReset() {
    router.push(baseUrl);
  }

  return (
    <aside className="flex flex-col gap-4 w-full">
      {/* Search */}
      <div>
        <label className={LABEL_CLASS}>{t("search")}</label>
        <input
          type="search"
          placeholder={t("searchPlaceholder")}
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
        <label className={LABEL_CLASS}>{t("category")}</label>
        <select
          value={kategori}
          onChange={(e) => handleChange("kategori", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Attribute filters render only when the catalogue actually carries
          values — an empty "Brand"/"Frame color"/"Lens color" dropdown on a
          shop whose products have none (every non-eyewear vertical) reads as
          another store's leftovers. */}
      {brands.length > 0 && (
        <div>
          <label className={LABEL_CLASS}>{t("brand")}</label>
          <select
            value={brand}
            onChange={(e) => handleChange("brand", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">{t("allBrands")}</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}

      {frameColors.length > 0 && (
        <div>
          <label className={LABEL_CLASS}>{t("frameColor")}</label>
          <select
            value={stelfarve}
            onChange={(e) => handleChange("stelfarve", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">{t("allFrameColors")}</option>
            {frameColors.map((fc) => (
              <option key={fc} value={fc}>
                {fc}
              </option>
            ))}
          </select>
        </div>
      )}

      {lensColors.length > 0 && (
        <div>
          <label className={LABEL_CLASS}>{t("lensColor")}</label>
          <select
            value={glasfarve}
            onChange={(e) => handleChange("glasfarve", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">{t("allLensColors")}</option>
            {lensColors.map((lc) => (
              <option key={lc} value={lc}>
                {lc}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Price range */}
      <div>
        <label className={LABEL_CLASS}>{t("price")}</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder={t("priceMin")}
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
            placeholder={t("priceMax")}
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
        <label className={LABEL_CLASS}>{t("sort")}</label>
        <select
          value={sort}
          onChange={(e) => handleChange("sort", e.target.value)}
          className={SELECT_CLASS}
        >
          {sortOptions.map((o) => (
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
        {t("reset")}
      </button>
    </aside>
  );
}
