import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";

/**
 * CSV produkt-import/eksport (WooCommerce-paritet). Egen lille RFC-4180-parser
 * (ingen dep). Eksport = alle ikke-slettede produkter. Import = upsert pr. slug,
 * kategori opslås via categorySlug (auto-opretter ALDRIG kategorier — sikkert).
 * Priser i CSV er i KRONER (menneske-venligt); DB er øre.
 */

// ─── Parser ─────────────────────────────────────────────────────────────────

/** Parse CSV-tekst til rækker af felter (håndterer quotes, "", komma/newline i quotes, CRLF). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV til objekter keyed by header. Tomme rækker droppes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0].trim() === ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
}

const csvEsc = (v: string): string =>
  /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

// ─── Export ───────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "slug",
  "name",
  "description",
  "priceKr",
  "stock",
  "brand",
  "featured",
  "categorySlug",
  "images",
  "attributes",
] as const;

type ProductExportRow = {
  slug: string;
  name: string;
  description: string;
  priceDkk: number;
  stock: number;
  brand: string | null;
  featured: boolean;
  category: { slug: string } | null;
  images: string;
  attributes: unknown;
};

export function productsToCsv(products: ProductExportRow[]): string {
  const lines = products.map((p) =>
    [
      p.slug,
      p.name,
      p.description,
      (p.priceDkk / 100).toString(),
      p.stock.toString(),
      p.brand ?? "",
      p.featured ? "true" : "false",
      p.category?.slug ?? "",
      p.images ?? "[]",
      p.attributes ? JSON.stringify(p.attributes) : "",
    ]
      .map((v) => csvEsc(String(v)))
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\n");
}

export async function exportProductsCsv(): Promise<string> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      priceDkk: true,
      stock: true,
      brand: true,
      featured: true,
      images: true,
      attributes: true,
      category: { select: { slug: true } },
    },
  });
  return productsToCsv(products);
}

// ─── Import ───────────────────────────────────────────────────────────────

export type ImportResult = {
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
};

function normalizeImages(raw: string): string {
  const v = raw.trim();
  if (!v) return "[]";
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return JSON.stringify(arr.filter((x) => typeof x === "string"));
    } catch {
      /* fald igennem til pipe-split */
    }
  }
  return JSON.stringify(v.split("|").map((s) => s.trim()).filter(Boolean));
}

function parseAttributes(raw: string): Record<string, unknown> | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

const TRUTHY = /^(true|1|ja|yes|y)$/i;

export async function importProductsFromCsv(
  text: string,
  actor: AuditActor,
): Promise<ImportResult> {
  const rows = parseCsv(text);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  await withAudit(
    { actor, tool: "products.import_csv", args: { rows: rows.length } },
    async () => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // header = række 1
        try {
          const slug = (row.slug ?? "").trim();
          if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("ugyldigt/manglende slug (a-z 0-9 -)");
          if ((row.name ?? "").trim().length < 2) throw new Error("name for kort");
          if ((row.description ?? "").trim().length < 10) throw new Error("description for kort");
          const priceKr = Number(row.priceKr);
          if (!Number.isFinite(priceKr) || priceKr <= 0) throw new Error("ugyldig priceKr");
          const categoryId = catBySlug.get((row.categorySlug ?? "").trim());
          if (!categoryId) throw new Error(`ukendt categorySlug '${row.categorySlug ?? ""}'`);

          const attrs = parseAttributes(row.attributes ?? "");
          const data: Prisma.ProductUncheckedCreateInput = {
            name: row.name.trim(),
            slug,
            description: row.description.trim(),
            priceDkk: Math.round(priceKr * 100),
            stock: Number.isFinite(Number(row.stock)) ? Math.max(0, Math.round(Number(row.stock))) : 0,
            brand: (row.brand ?? "").trim() || null,
            featured: TRUTHY.test((row.featured ?? "").trim()),
            categoryId,
            images: normalizeImages(row.images ?? ""),
            // attributes kun når sat (Json?-felt; omit = uændret på update / null på create)
            ...(attrs ? { attributes: attrs as Prisma.InputJsonValue } : {}),
          };

          const existing = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
          if (existing) {
            await prisma.product.update({ where: { slug }, data });
            result.updated++;
          } else {
            await prisma.product.create({ data });
            result.created++;
          }
        } catch (e) {
          result.errors.push({ row: rowNum, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return result;
    },
  );

  return result;
}
