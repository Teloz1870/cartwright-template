import "server-only";

import { authorizedGoogleFetch, type GoogleFetchErrorCode } from "@/lib/google/client";

export const SHEETS_PRODUCT_TAB = "Products";
export const SHEETS_PRODUCT_HEADERS = [
  "sku",
  "slug",
  "name",
  "description",
  "priceKr",
  "stock",
  "currency",
  "brand",
  "featured",
  "categorySlug",
  "images",
  "attributes",
] as const;

export const SHEETS_PRODUCT_RANGE = `${SHEETS_PRODUCT_TAB}!A:L`;

export type SheetsProductHeader = (typeof SHEETS_PRODUCT_HEADERS)[number];

export type SheetsApiErrorCode =
  | GoogleFetchErrorCode
  | "api_error"
  | "invalid_response";

export type SheetsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: SheetsApiErrorCode; message: string; status?: number } };

export type SheetProductDraft = {
  rowNumber: number;
  sku: string;
  slug: string;
  name: string;
  description: string;
  priceDkk: number;
  stock: number;
  currency: string;
  brand: string | null;
  featured: boolean;
  categorySlug: string;
  images: string;
  attributes: Record<string, unknown> | null;
};

export type ProductForSheetRow = {
  sku: string | null;
  slug: string;
  name: string;
  description: string;
  priceDkk: number;
  stock: number;
  currency?: string | null;
  brand: string | null;
  featured: boolean;
  category: { slug: string } | null;
  images: string;
  attributes: unknown;
};

type GoogleValueRange = {
  range?: string;
  majorDimension?: string;
  values?: unknown[][];
};

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TRUTHY = /^(true|1|ja|yes|y)$/i;

function cell(row: readonly unknown[], index: number): string {
  const value = row[index];
  return value == null ? "" : String(value).trim();
}

function parsePriceDkk(raw: string, rowNumber: number): number {
  const normalized = raw.replace(",", ".");
  const priceKr = Number(normalized);
  if (!Number.isFinite(priceKr) || priceKr <= 0) {
    throw new Error(`row ${rowNumber}: invalid priceKr`);
  }
  return Math.round(priceKr * 100);
}

function parseStock(raw: string): number {
  const stock = Number(raw);
  return Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0;
}

function normalizeImages(raw: string): string {
  if (!raw) return "[]";
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.filter((value) => typeof value === "string"));
      }
    } catch {
      // Fall through to pipe parsing.
    }
  }
  return JSON.stringify(raw.split("|").map((part) => part.trim()).filter(Boolean));
}

function parseAttributes(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function slugifySheetValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function imagesForSheet(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value) => typeof value === "string").join("|");
    }
  } catch {
    // Keep legacy raw image strings readable in the sheet.
  }
  return raw || "";
}

export function sheetRowToProductDraft(
  row: readonly unknown[],
  rowNumber: number,
): SheetProductDraft {
  const sku = cell(row, 0);
  const rawSlug = cell(row, 1);
  const name = cell(row, 2);
  const description = cell(row, 3);
  const currency = (cell(row, 6) || "DKK").toUpperCase();
  const categorySlug = cell(row, 9);

  if (!sku) throw new Error(`row ${rowNumber}: missing sku`);
  if (name.length < 2) throw new Error(`row ${rowNumber}: name too short`);
  if (description.length < 10) throw new Error(`row ${rowNumber}: description too short`);
  if (currency !== "DKK") throw new Error(`row ${rowNumber}: unsupported currency ${currency}`);
  if (!categorySlug) throw new Error(`row ${rowNumber}: missing categorySlug`);

  const slug = slugifySheetValue(rawSlug || sku || name);
  if (!slug) throw new Error(`row ${rowNumber}: invalid slug`);

  return {
    rowNumber,
    sku,
    slug,
    name,
    description,
    priceDkk: parsePriceDkk(cell(row, 4), rowNumber),
    stock: parseStock(cell(row, 5)),
    currency,
    brand: cell(row, 7) || null,
    featured: TRUTHY.test(cell(row, 8)),
    categorySlug,
    images: normalizeImages(cell(row, 10)),
    attributes: parseAttributes(cell(row, 11)),
  };
}

export function productToSheetRow(product: ProductForSheetRow): string[] {
  return [
    product.sku || product.slug,
    product.slug,
    product.name,
    product.description,
    (product.priceDkk / 100).toFixed(2).replace(/\.00$/, ""),
    String(product.stock),
    product.currency || "DKK",
    product.brand ?? "",
    product.featured ? "true" : "false",
    product.category?.slug ?? "",
    imagesForSheet(product.images),
    product.attributes ? JSON.stringify(product.attributes) : "",
  ];
}

async function parseSheetsResponse<T>(
  response: Response,
  map: (payload: unknown) => T | null,
): Promise<SheetsResult<T>> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: { message?: unknown } }).error?.message === "string"
        ? (payload as { error: { message: string } }).error.message
        : "Google Sheets API request failed.";
    return {
      ok: false,
      error: { code: "api_error", message, status: response.status },
    };
  }

  const data = map(payload);
  if (!data) {
    return {
      ok: false,
      error: {
        code: "invalid_response",
        message: "Google Sheets API returned an unexpected response.",
      },
    };
  }
  return { ok: true, data };
}

export async function readSheetRange(
  spreadsheetId: string,
  range = SHEETS_PRODUCT_RANGE,
): Promise<SheetsResult<string[][]>> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");

  const result = await authorizedGoogleFetch(url).catch(() => ({
    ok: false as const,
    error: {
      code: "api_error" as const,
      message: "Google Sheets API is unreachable.",
    },
  }));
  if (!result.ok) return result;

  return parseSheetsResponse(result.response, (payload) => {
    const values = (payload as GoogleValueRange | null)?.values;
    if (!Array.isArray(values)) return [];
    return values.map((row) => row.map((value) => (value == null ? "" : String(value))));
  });
}

export async function writeSheetRows(args: {
  spreadsheetId: string;
  range?: string;
  rows: readonly (readonly string[])[];
}): Promise<SheetsResult<{ updatedRows: number; updatedCells: number }>> {
  const range = args.range ?? SHEETS_PRODUCT_RANGE;
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(args.spreadsheetId)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");

  const result = await authorizedGoogleFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      majorDimension: "ROWS",
      values: args.rows,
    }),
  }).catch(() => ({
    ok: false as const,
    error: {
      code: "api_error" as const,
      message: "Google Sheets API is unreachable.",
    },
  }));
  if (!result.ok) return result;

  return parseSheetsResponse(result.response, (payload) => {
    const updatedRows = (payload as { updatedRows?: unknown } | null)?.updatedRows;
    const updatedCells = (payload as { updatedCells?: unknown } | null)?.updatedCells;
    return {
      updatedRows: typeof updatedRows === "number" ? updatedRows : args.rows.length,
      updatedCells: typeof updatedCells === "number" ? updatedCells : 0,
    };
  });
}

/**
 * Clear a value range (values:clear). Used before a full PUSH so that when the
 * local catalog shrinks, stale trailing rows at the bottom of the sheet don't
 * persist. Fail-soft like the other wrappers.
 */
export async function clearSheetRange(args: {
  spreadsheetId: string;
  range?: string;
}): Promise<SheetsResult<{ cleared: boolean }>> {
  const range = args.range ?? SHEETS_PRODUCT_RANGE;
  const url = new URL(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(args.spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
  );
  const result = await authorizedGoogleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => ({
    ok: false as const,
    error: {
      code: "api_error" as const,
      message: "Google Sheets API is unreachable.",
    },
  }));
  if (!result.ok) return result;
  return parseSheetsResponse(result.response, () => ({ cleared: true }));
}

export const updateSheetRows = writeSheetRows;
