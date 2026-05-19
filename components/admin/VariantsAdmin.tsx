"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVariantAction,
  updateVariantAction,
  deleteVariantAction,
  createVariantsBatchAction,
} from "@/app/admin/produkter/variants";

type VariantRow = {
  id: string;
  sku: string;
  priceDkk: number;
  stock: number;
  attributes: Record<string, string>;
};

type Props = {
  productId: string;
  initialVariants: VariantRow[];
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

/**
 * Task B variants-admin — renderes som sub-section i ProductForm.
 *
 * UX: tabel med eksisterende variants (inline-edit + slet) + add-form i bunden.
 * Hver row sender FormData direkte til server-action; router.refresh() henter
 * frisk state efter mutation.
 *
 * MVP-pragmatik: ingen optimistic UI, ingen reorder-drag. Simpel CRUD der
 * dækker panel-hegn-use-case (3-15 varianter pr. produkt typisk).
 */
export default function VariantsAdmin({ productId, initialVariants }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add-form state — held lokalt så vi kan reset efter succes
  const [newSku, setNewSku] = useState("");
  const [newPriceKr, setNewPriceKr] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newAttributesJson, setNewAttributesJson] = useState("");

  function handleAdd() {
    setError(null);
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("sku", newSku);
    formData.set("priceKr", newPriceKr);
    formData.set("stock", newStock);
    formData.set("attributesJson", newAttributesJson);

    startTransition(() => {
      void (async () => {
        const result = await createVariantAction(formData);
        if (result.ok) {
          setNewSku("");
          setNewPriceKr("");
          setNewStock("");
          setNewAttributesJson("");
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  function handleDelete(variantId: string, sku: string) {
    if (!confirm(`Slet variant "${sku}"? Eksisterende ordrer beholder snapshot-data.`)) {
      return;
    }
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await deleteVariantAction(variantId);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  return (
    <div className="md:col-span-2 rounded-lg border border-sol-glass-border-dark bg-sol-cream/30 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-black text-sol-ink">Varianter</h3>
        <p className="mt-0.5 text-xs text-sol-muted">
          Hvis produktet har varianter (fx forskellige dimensioner eller farver
          til forskellige priser), tilføj dem her. Lader du listen være tom,
          vises produktet uden variant-picker.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {initialVariants.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-sol-ink/15 text-left font-black uppercase text-sol-muted">
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Pris (kr)</th>
                <th className="py-2 pr-3">Lager</th>
                <th className="py-2 pr-3">Attributter</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {initialVariants.map((v) => (
                <VariantRowEditor
                  key={v.id}
                  productId={productId}
                  variant={v}
                  disabled={isPending}
                  onDelete={() => handleDelete(v.id, v.sku)}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add-form */}
      <div className="rounded-lg border border-sol-ink/10 bg-white p-3">
        <p className="mb-2 text-xs font-black uppercase text-sol-muted">
          Tilføj variant
        </p>
        <div className="grid gap-2 md:grid-cols-4">
          <input
            placeholder="SKU (fx 2x3-grey)"
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder="Pris i kr"
            min="0"
            step="0.01"
            value={newPriceKr}
            onChange={(e) => setNewPriceKr(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder="Lager"
            min="0"
            value={newStock}
            onChange={(e) => setNewStock(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending}
            className="rounded-lg bg-sol-accent px-3 py-2 text-xs font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "…" : "+ Tilføj"}
          </button>
        </div>
        <textarea
          rows={2}
          placeholder={`Attributter JSON (fx {"højde": "2m", "bredde": "3m", "farve": "grå"})`}
          value={newAttributesJson}
          onChange={(e) => setNewAttributesJson(e.target.value)}
          className={`${inputClass} mt-2 font-mono text-xs`}
        />
      </div>

      {/* ULTRAPLAN-lite UL3: bulk-matrix-generator.
          For produkter med mange varianter (panel-hegn: 4 højder × 5 bredder × 3 farver
          = 60 SKUs) er det utåleligt at indtaste én ad gangen. Generatoren tager
          attribute-værdier som comma-separerede lister, beregner cartesian product,
          og batch-creates via createVariantsBatchAction. */}
      <BulkGenerator productId={productId} onError={setError} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Bulk-matrix-generator
// ──────────────────────────────────────────────────────────────────────────

/**
 * Beregn cartesian product af flere attribute-arrays.
 * Eksempel: cartesian({h: ["1m","2m"], w: ["3m","4m"]}) =
 *   [{h:"1m",w:"3m"}, {h:"1m",w:"4m"}, {h:"2m",w:"3m"}, {h:"2m",w:"4m"}]
 */
function cartesianProduct(
  attributeSets: Array<{ key: string; values: string[] }>,
): Array<Record<string, string>> {
  if (attributeSets.length === 0) return [];
  let result: Array<Record<string, string>> = [{}];
  for (const { key, values } of attributeSets) {
    const next: Array<Record<string, string>> = [];
    for (const partial of result) {
      for (const value of values) {
        next.push({ ...partial, [key]: value });
      }
    }
    result = next;
  }
  return result;
}

/**
 * SKU-template-erstatning. {key} i template erstattes med slugified value.
 * Eksempel: "ph-{højde}x{bredde}-{farve}" + {højde:"1m", bredde:"2m", farve:"grå"}
 *        → "ph-1mx2m-gra"
 */
function renderSkuTemplate(
  template: string,
  attrs: Record<string, string>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = attrs[key.trim()] ?? "";
    return value
      .toLowerCase()
      // Dansk æ/ø er standalone unicodes uden NFD-decomposition — skal
      // erstattes eksplicit FØR NFD-strip ellers fanges de af [^a-z]-regex
      // og bliver til "-".
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining diakritika (å→a, é→e)
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });
}

function BulkGenerator({
  productId,
  onError,
}: {
  productId: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Op til 3 attribute-akser. Værdier comma-separerede ("1m, 2m, 3m").
  const [attr1Key, setAttr1Key] = useState("højde");
  const [attr1Values, setAttr1Values] = useState("");
  const [attr2Key, setAttr2Key] = useState("bredde");
  const [attr2Values, setAttr2Values] = useState("");
  const [attr3Key, setAttr3Key] = useState("farve");
  const [attr3Values, setAttr3Values] = useState("");

  const [skuTemplate, setSkuTemplate] = useState("var-{højde}x{bredde}-{farve}");
  const [basePriceKr, setBasePriceKr] = useState("");
  const [defaultStock, setDefaultStock] = useState("10");

  function parseValues(raw: string): string[] {
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const preview = (() => {
    const sets: Array<{ key: string; values: string[] }> = [];
    if (attr1Key && attr1Values) sets.push({ key: attr1Key.trim(), values: parseValues(attr1Values) });
    if (attr2Key && attr2Values) sets.push({ key: attr2Key.trim(), values: parseValues(attr2Values) });
    if (attr3Key && attr3Values) sets.push({ key: attr3Key.trim(), values: parseValues(attr3Values) });

    const combos = cartesianProduct(sets);
    const priceDkk = Math.round(Number(basePriceKr) * 100) || 0;
    const stock = Number(defaultStock) || 0;
    return combos.map((attrs) => ({
      sku: renderSkuTemplate(skuTemplate, attrs),
      priceDkk,
      stock,
      attributes: attrs,
    }));
  })();

  // Detect SKU-collisions inden submit
  const skuCounts = new Map<string, number>();
  for (const v of preview) skuCounts.set(v.sku, (skuCounts.get(v.sku) ?? 0) + 1);
  const duplicateSkus = [...skuCounts.entries()].filter(([, c]) => c > 1);
  const hasInvalidSku = preview.some((v) => !/^[a-zA-Z0-9._-]+$/.test(v.sku) || v.sku.length === 0);

  function handleGenerate() {
    onError(null);
    if (preview.length === 0) {
      onError("Tilføj mindst én attribut med værdier");
      return;
    }
    if (duplicateSkus.length > 0) {
      onError(`SKU-kollision: ${duplicateSkus.map(([s]) => s).join(", ")}. Tjek dit template.`);
      return;
    }
    if (hasInvalidSku) {
      onError("En eller flere genererede SKUs er ugyldige. Justér template eller værdier.");
      return;
    }
    if (preview.length > 200) {
      onError(`For mange varianter (${preview.length}). Max 200 pr batch.`);
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await createVariantsBatchAction({
          productId,
          variants: preview,
        });
        if (result.ok) {
          // Reset form + close
          setAttr1Values("");
          setAttr2Values("");
          setAttr3Values("");
          setBasePriceKr("");
          setOpen(false);
          router.refresh();
          if (result.skipped > 0) {
            onError(`✓ Oprettet ${result.created} varianter (${result.skipped} skippet — SKU eksisterede)`);
          }
        } else {
          onError(result.error);
        }
      })();
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-bold uppercase text-sol-accent hover:underline"
      >
        {open ? "▼" : "▶"} Bulk-tilføj (matrix-generator)
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-sol-accent/30 bg-sol-accent/5 p-4">
          <p className="mb-3 text-xs text-sol-muted">
            Definer 1-3 attribut-akser med comma-separerede værdier. Generér alle
            kombinationer på én gang. SKU bygges fra template hvor <code>{`{nøgle}`}</code>{" "}
            erstattes med værdien (æ/ø/å normaliseres).
          </p>

          {/* 3 attribute-axes */}
          <div className="space-y-2">
            {[
              { key: attr1Key, values: attr1Values, setKey: setAttr1Key, setValues: setAttr1Values, label: "Akse 1" },
              { key: attr2Key, values: attr2Values, setKey: setAttr2Key, setValues: setAttr2Values, label: "Akse 2 (valgfri)" },
              { key: attr3Key, values: attr3Values, setKey: setAttr3Key, setValues: setAttr3Values, label: "Akse 3 (valgfri)" },
            ].map((axis, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[150px_1fr]">
                <input
                  placeholder={`${axis.label} nøgle`}
                  value={axis.key}
                  onChange={(e) => axis.setKey(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Værdier (komma-separeret) — fx 1m, 2m, 3m"
                  value={axis.values}
                  onChange={(e) => axis.setValues(e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          {/* Pricing + SKU-template + stock */}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input
              type="number"
              placeholder="Pris pr variant (kr)"
              min="0"
              step="0.01"
              value={basePriceKr}
              onChange={(e) => setBasePriceKr(e.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              placeholder="Lager pr variant"
              min="0"
              value={defaultStock}
              onChange={(e) => setDefaultStock(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="SKU-template (fx ph-{højde}x{bredde}-{farve})"
              value={skuTemplate}
              onChange={(e) => setSkuTemplate(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-black uppercase text-sol-muted">
                Preview: {preview.length} variants vil blive oprettet
                {duplicateSkus.length > 0 && (
                  <span className="ml-2 text-red-700">⚠ SKU-kollision detekteret</span>
                )}
              </p>
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-sol-ink/10 bg-white">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-sol-cream">
                    <tr className="border-b border-sol-ink/10 text-left font-black uppercase text-sol-muted">
                      <th className="px-2 py-1">SKU</th>
                      <th className="px-2 py-1">Pris (kr)</th>
                      <th className="px-2 py-1">Lager</th>
                      <th className="px-2 py-1">Attributter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((v, i) => (
                      <tr key={i} className="border-b border-sol-ink/5">
                        <td className="px-2 py-1 font-mono">{v.sku || <em>tom</em>}</td>
                        <td className="px-2 py-1">{(v.priceDkk / 100).toFixed(2)}</td>
                        <td className="px-2 py-1">{v.stock}</td>
                        <td className="px-2 py-1 text-sol-muted">
                          {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                    {preview.length > 50 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-1 text-center text-xs text-sol-muted">
                          … og {preview.length - 50} flere
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending || preview.length === 0 || duplicateSkus.length > 0 || hasInvalidSku}
            className="mt-3 rounded-lg bg-sol-accent px-4 py-2 text-xs font-black uppercase text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Opretter…" : `Generér ${preview.length || 0} varianter`}
          </button>
        </div>
      )}
    </div>
  );
}

function VariantRowEditor({
  productId,
  variant,
  disabled,
  onDelete,
  onError,
}: {
  productId: string;
  variant: VariantRow;
  disabled: boolean;
  onDelete: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(variant.sku);
  const [priceKr, setPriceKr] = useState((variant.priceDkk / 100).toString());
  const [stock, setStock] = useState(variant.stock.toString());
  const [attributesJson, setAttributesJson] = useState(
    JSON.stringify(variant.attributes, null, 0),
  );
  const [saving, startSaving] = useTransition();

  function handleSave() {
    onError(null);
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("sku", sku);
    formData.set("priceKr", priceKr);
    formData.set("stock", stock);
    formData.set("attributesJson", attributesJson);
    startSaving(() => {
      void (async () => {
        const result = await updateVariantAction(variant.id, formData);
        if (result.ok) {
          setEditing(false);
          router.refresh();
        } else {
          onError(result.error);
        }
      })();
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-sol-ink/10 align-top">
        <td className="py-2 pr-2">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={inputClass}
          />
        </td>
        <td className="py-2 pr-2">
          <input
            type="number"
            value={priceKr}
            onChange={(e) => setPriceKr(e.target.value)}
            className={inputClass}
            min="0"
            step="0.01"
          />
        </td>
        <td className="py-2 pr-2">
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className={inputClass}
            min="0"
          />
        </td>
        <td className="py-2 pr-2">
          <textarea
            value={attributesJson}
            onChange={(e) => setAttributesJson(e.target.value)}
            rows={2}
            className={`${inputClass} font-mono text-xs`}
          />
        </td>
        <td className="py-2 text-right">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || disabled}
              className="rounded bg-sol-accent px-2 py-1 text-[10px] font-black uppercase text-white disabled:opacity-50"
            >
              {saving ? "…" : "Gem"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-sol-ink/20 px-2 py-1 text-[10px] font-bold uppercase text-sol-ink"
            >
              Annuller
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-sol-ink/10">
      <td className="py-2 pr-3 font-mono">{variant.sku}</td>
      <td className="py-2 pr-3">{(variant.priceDkk / 100).toFixed(2)}</td>
      <td className="py-2 pr-3">{variant.stock}</td>
      <td className="py-2 pr-3">
        <span className="text-sol-muted">
          {Object.entries(variant.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </span>
      </td>
      <td className="py-2 text-right">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-sol-ink/20 px-2 py-1 text-[10px] font-bold uppercase text-sol-ink"
          >
            Rediger
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="rounded border border-red-300 px-2 py-1 text-[10px] font-bold uppercase text-red-700 disabled:opacity-50"
          >
            Slet
          </button>
        </div>
      </td>
    </tr>
  );
}
