import { describe, expect, it } from "vitest";

import {
  SHEETS_PRODUCT_HEADERS,
  productToSheetRow,
  sheetRowToProductDraft,
} from "@/lib/google/sheets";

describe("Google Sheets product row mapping", () => {
  it("maps a sheet row into a normalized product draft", () => {
    const row = [
      "sku-001",
      "coffee-mug",
      "Coffee Mug",
      "A durable ceramic mug.",
      "129.95",
      "7",
      "DKK",
      "Cartwright",
      "yes",
      "products",
      "https://example.com/a.jpg|https://example.com/b.jpg",
      '{"material":"ceramic"}',
    ];

    expect(sheetRowToProductDraft(row, 4)).toEqual({
      rowNumber: 4,
      sku: "sku-001",
      slug: "coffee-mug",
      name: "Coffee Mug",
      description: "A durable ceramic mug.",
      priceDkk: 12995,
      stock: 7,
      currency: "DKK",
      brand: "Cartwright",
      featured: true,
      categorySlug: "products",
      images: JSON.stringify([
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
      ]),
      attributes: { material: "ceramic" },
    });
  });

  it("maps a product into the canonical Sheets row order", () => {
    const row = productToSheetRow({
      sku: null,
      slug: "coffee-mug",
      name: "Coffee Mug",
      description: "A durable ceramic mug.",
      priceDkk: 12995,
      stock: 7,
      currency: "DKK",
      brand: null,
      featured: false,
      category: { slug: "products" },
      images: JSON.stringify(["https://example.com/a.jpg"]),
      attributes: { material: "ceramic" },
    });

    expect(SHEETS_PRODUCT_HEADERS).toEqual([
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
    ]);
    expect(row).toEqual([
      "coffee-mug",
      "coffee-mug",
      "Coffee Mug",
      "A durable ceramic mug.",
      "129.95",
      "7",
      "DKK",
      "",
      "false",
      "products",
      "https://example.com/a.jpg",
      '{"material":"ceramic"}',
    ]);
  });
});
