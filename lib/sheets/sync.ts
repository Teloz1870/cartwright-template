import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import {
  SHEETS_PRODUCT_HEADERS,
  SHEETS_PRODUCT_RANGE,
  clearSheetRange,
  productToSheetRow,
  readSheetRange,
  sheetRowToProductDraft,
  updateSheetRows,
  slugifySheetValue,
  type SheetProductDraft,
} from "@/lib/google/sheets";

export type SheetsSyncMode = "pull" | "push" | "sync";

export type SheetsSyncResult = {
  ok: boolean;
  mode: SheetsSyncMode;
  skipped: number;
  added: number;
  updated: number;
  pulled?: SheetsSyncCounts;
  pushed?: SheetsSyncCounts;
  reason?: string;
  error?: string;
  errors: { row?: number; sku?: string; error: string }[];
  spreadsheetId?: string;
  finishedAt: string;
};

export type SheetsSyncCounts = Pick<
  SheetsSyncResult,
  "skipped" | "added" | "updated" | "errors"
>;

type ProductComparable = {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
  description: string;
  priceDkk: number;
  stock: number;
  brand: string | null;
  featured: boolean;
  categoryId: string;
  images: string;
  attributes: unknown;
  sheetRowRef: string | null;
};

async function isSheetsSyncEnabled(): Promise<boolean> {
  const brand = await getBrand();
  return Boolean((brand.features as { sheetsSync?: boolean }).sheetsSync);
}

function inertResult(
  mode: SheetsSyncMode,
  reason: string,
  spreadsheetId?: string | null,
): SheetsSyncResult {
  return {
    ok: true,
    mode,
    skipped: 0,
    added: 0,
    updated: 0,
    reason,
    errors: [],
    spreadsheetId: spreadsheetId ?? undefined,
    finishedAt: new Date().toISOString(),
  };
}

async function readSpreadsheetId(): Promise<string | null> {
  const settings = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { sheetsSpreadsheetId: true },
  });
  return settings?.sheetsSpreadsheetId?.trim() || null;
}

async function rememberResult(result: SheetsSyncResult): Promise<void> {
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      sheetsSpreadsheetId: result.spreadsheetId,
      sheetsLastSyncAt: new Date(result.finishedAt),
      sheetsLastSyncResultJson: JSON.stringify(result),
    },
    update: {
      sheetsLastSyncAt: new Date(result.finishedAt),
      sheetsLastSyncResultJson: JSON.stringify(result),
    },
  });
}

async function finalizeResult(result: SheetsSyncResult): Promise<SheetsSyncResult> {
  await rememberResult(result).catch(() => undefined);
  return result;
}

function hasProductHeader(row: readonly string[] | undefined): boolean {
  if (!row) return false;
  return SHEETS_PRODUCT_HEADERS.every(
    (header, index) => (row[index] ?? "").trim().toLowerCase() === header.toLowerCase(),
  );
}

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => !String(cell).trim());
}

function sameJsonish(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function buildProductData(
  draft: SheetProductDraft,
  categoryId: string,
): Prisma.ProductUncheckedCreateInput {
  return {
    sku: draft.sku,
    slug: draft.slug,
    name: draft.name,
    description: draft.description,
    priceDkk: draft.priceDkk,
    stock: draft.stock,
    brand: draft.brand,
    featured: draft.featured,
    categoryId,
    images: draft.images,
    ...(draft.attributes
      ? { attributes: draft.attributes as Prisma.InputJsonValue }
      : {}),
    sheetRowRef: String(draft.rowNumber),
  };
}

function needsUpdate(
  product: ProductComparable,
  draft: SheetProductDraft,
  categoryId: string,
): boolean {
  return (
    product.sku !== draft.sku ||
    product.slug !== draft.slug ||
    product.name !== draft.name ||
    product.description !== draft.description ||
    product.priceDkk !== draft.priceDkk ||
    product.stock !== draft.stock ||
    product.brand !== draft.brand ||
    product.featured !== draft.featured ||
    product.categoryId !== categoryId ||
    product.images !== draft.images ||
    (draft.attributes !== null && !sameJsonish(product.attributes, draft.attributes)) ||
    product.sheetRowRef !== String(draft.rowNumber)
  );
}

function mergeCounts(mode: SheetsSyncMode, parts: SheetsSyncCounts[]): SheetsSyncResult {
  return {
    ok: parts.every((part) => part.errors.length === 0),
    mode,
    skipped: parts.reduce((sum, part) => sum + part.skipped, 0),
    added: parts.reduce((sum, part) => sum + part.added, 0),
    updated: parts.reduce((sum, part) => sum + part.updated, 0),
    pulled: parts[0],
    pushed: parts[1],
    errors: parts.flatMap((part) => part.errors),
    finishedAt: new Date().toISOString(),
  };
}

export async function getSheetsSyncSettings(): Promise<{
  enabled: boolean;
  spreadsheetId: string | null;
  lastSyncAt: Date | null;
  lastResult: SheetsSyncResult | null;
}> {
  const [enabled, settings] = await Promise.all([
    isSheetsSyncEnabled(),
    prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        sheetsSpreadsheetId: true,
        sheetsLastSyncAt: true,
        sheetsLastSyncResultJson: true,
      },
    }),
  ]);

  let lastResult: SheetsSyncResult | null = null;
  if (settings?.sheetsLastSyncResultJson) {
    try {
      lastResult = JSON.parse(settings.sheetsLastSyncResultJson) as SheetsSyncResult;
    } catch {
      lastResult = null;
    }
  }

  return {
    enabled,
    spreadsheetId: settings?.sheetsSpreadsheetId ?? null,
    lastSyncAt: settings?.sheetsLastSyncAt ?? null,
    lastResult,
  };
}

export async function saveSheetsSpreadsheetId(spreadsheetId: string): Promise<void> {
  const normalized = spreadsheetId.trim();
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, sheetsSpreadsheetId: normalized || null },
    update: { sheetsSpreadsheetId: normalized || null },
  });
}

export async function pullProductsFromSheet(): Promise<SheetsSyncResult> {
  if (!(await isSheetsSyncEnabled())) {
    return inertResult("pull", "sheetsSync-feature-disabled");
  }
  const spreadsheetId = await readSpreadsheetId();
  if (!spreadsheetId) {
    return finalizeResult(inertResult("pull", "missing-spreadsheet-id"));
  }

  const values = await readSheetRange(spreadsheetId, SHEETS_PRODUCT_RANGE);
  if (!values.ok) {
    return finalizeResult({
      ok: false,
      mode: "pull",
      skipped: 0,
      added: 0,
      updated: 0,
      reason: values.error.code,
      error: values.error.message,
      errors: [],
      spreadsheetId,
      finishedAt: new Date().toISOString(),
    });
  }

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const rows = values.data;
  const dataRows = hasProductHeader(rows[0]) ? rows.slice(1) : rows;
  const firstDataRowNumber = hasProductHeader(rows[0]) ? 2 : 1;

  const result: SheetsSyncResult = {
    ok: true,
    mode: "pull",
    skipped: 0,
    added: 0,
    updated: 0,
    errors: [],
    spreadsheetId,
    finishedAt: new Date().toISOString(),
  };

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index];
    const rowNumber = firstDataRowNumber + index;
    if (isBlankRow(row)) {
      result.skipped++;
      continue;
    }

    let draft: SheetProductDraft;
    try {
      draft = sheetRowToProductDraft(row, rowNumber);
    } catch (err) {
      result.errors.push({ row: rowNumber, error: err instanceof Error ? err.message : String(err) });
      result.skipped++;
      continue;
    }

    const categoryId = categoryBySlug.get(draft.categorySlug);
    if (!categoryId) {
      result.errors.push({
        row: rowNumber,
        sku: draft.sku,
        error: `unknown categorySlug '${draft.categorySlug}'`,
      });
      result.skipped++;
      continue;
    }

    try {
      const existing = await prisma.product.findFirst({
        where: {
          OR: [{ sku: draft.sku }, { slug: draft.sku }, { slug: draft.slug }],
        },
        select: {
          id: true,
          sku: true,
          slug: true,
          name: true,
          description: true,
          priceDkk: true,
          stock: true,
          brand: true,
          featured: true,
          categoryId: true,
          images: true,
          attributes: true,
          sheetRowRef: true,
        },
      });
      const data = buildProductData(draft, categoryId);

      if (!existing) {
        await prisma.product.create({ data });
        result.added++;
      } else if (needsUpdate(existing, draft, categoryId)) {
        await prisma.product.update({
          where: { id: existing.id },
          data,
        });
        result.updated++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push({
        row: rowNumber,
        sku: draft.sku,
        error: err instanceof Error ? err.message : String(err),
      });
      result.skipped++;
    }
  }

  result.ok = result.errors.length === 0;
  result.finishedAt = new Date().toISOString();
  return finalizeResult(result);
}

export async function pushProductsToSheet(): Promise<SheetsSyncResult> {
  if (!(await isSheetsSyncEnabled())) {
    return inertResult("push", "sheetsSync-feature-disabled");
  }
  const spreadsheetId = await readSpreadsheetId();
  if (!spreadsheetId) {
    return finalizeResult(inertResult("push", "missing-spreadsheet-id"));
  }

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      sku: true,
      slug: true,
      name: true,
      description: true,
      priceDkk: true,
      stock: true,
      brand: true,
      featured: true,
      category: { select: { slug: true } },
      images: true,
      attributes: true,
    },
  });

  const rows = [
    [...SHEETS_PRODUCT_HEADERS],
    ...products.map((product) =>
      productToSheetRow({
        ...product,
        sku: product.sku || slugifySheetValue(product.slug),
        currency: "DKK",
      }),
    ),
  ];

  const existingRows = await readSheetRange(spreadsheetId, SHEETS_PRODUCT_RANGE);
  if (!existingRows.ok) {
    return finalizeResult({
      ok: false,
      mode: "push",
      skipped: 0,
      added: 0,
      updated: 0,
      reason: existingRows.error.code,
      error: existingRows.error.message,
      errors: [],
      spreadsheetId,
      finishedAt: new Date().toISOString(),
    });
  }

  const normalizedExisting = existingRows.data.map((row) =>
    row.slice(0, SHEETS_PRODUCT_HEADERS.length),
  );
  const same =
    normalizedExisting.length === rows.length &&
    rows.every((row, index) =>
      row.every((cell, cellIndex) => (normalizedExisting[index]?.[cellIndex] ?? "") === cell),
    );
  if (same) {
    return finalizeResult({
      ok: true,
      mode: "push",
      skipped: products.length,
      added: 0,
      updated: 0,
      errors: [],
      spreadsheetId,
      finishedAt: new Date().toISOString(),
    });
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (let index = 1; index < rows.length; index++) {
    const desired = rows[index];
    const existing = normalizedExisting[index];
    if (!existing) {
      added++;
    } else if (desired.every((cell, cellIndex) => (existing[cellIndex] ?? "") === cell)) {
      skipped++;
    } else {
      updated++;
    }
  }

  // Clear the product range first so a shrunk catalog doesn't leave stale
  // trailing rows in the sheet; `rows` re-includes the header at index 0.
  await clearSheetRange({ spreadsheetId });
  const written = await updateSheetRows({ spreadsheetId, rows });
  if (!written.ok) {
    return finalizeResult({
      ok: false,
      mode: "push",
      skipped: 0,
      added: 0,
      updated: 0,
      reason: written.error.code,
      error: written.error.message,
      errors: [],
      spreadsheetId,
      finishedAt: new Date().toISOString(),
    });
  }

  const result: SheetsSyncResult = {
    ok: true,
    mode: "push",
    skipped,
    added,
    updated,
    errors: [],
    spreadsheetId,
    finishedAt: new Date().toISOString(),
  };
  return finalizeResult(result);
}

export async function syncProductsWithSheet(): Promise<SheetsSyncResult> {
  if (!(await isSheetsSyncEnabled())) {
    const spreadsheetId = await readSpreadsheetId().catch(() => null);
    return inertResult("sync", "sheetsSync-feature-disabled", spreadsheetId);
  }

  const pulled = await pullProductsFromSheet();
  if (!pulled.ok) return finalizeResult({ ...pulled, mode: "sync" });

  const pushed = await pushProductsToSheet();
  const merged = mergeCounts("sync", [pulled, pushed]);
  merged.ok = pulled.ok && pushed.ok;
  merged.reason = pushed.reason;
  merged.error = pushed.error;
  merged.spreadsheetId = pushed.spreadsheetId ?? pulled.spreadsheetId;
  return finalizeResult(merged);
}
