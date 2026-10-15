import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { defineTool } from "@/lib/tools/types";

/**
 * Generative-UI tools (Hul B): lader MODELLEN vælge hvordan produkter
 * præsenteres i chatten, frem for den faste 1:1 tool→komponent-mapping.
 *
 * Sikkerhed: modellen vælger kun et `layout` fra et hvidlistet enum + hvilke
 * produkter (ved slug) — aldrig vilkårlig markup. Klienten (AIStylistPanel)
 * rendrer det matchende, hvidlistede komponent med validerede props.
 */

const presentProductsInput = z.object({
  layout: z
    .enum(["grid", "spotlight", "comparison"])
    .describe(
      "How to present the products: 'grid' for browsing several, 'spotlight' for highlighting a single recommendation, 'comparison' for comparing 2–4 side by side.",
    ),
  productSlugs: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe("Slugs of the products to present, in the order to display them."),
  note: z
    .string()
    .max(280)
    .optional()
    .describe("Optional short framing line shown above the products."),
});

const presentProductsOutput = z.object({
  layout: z.enum(["grid", "spotlight", "comparison"]),
  note: z.string().nullable(),
  products: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    brand: z.string(),
    priceDkk: z.number().int(),
    stock: z.number().int(),
    firstImage: z.string().nullable(),
  }).strict()).max(6),
}).strict();

export const presentProducts = defineTool({
  name: "ui.present_products",
  description:
    "Render an inline product presentation in the chat. Call this AFTER you have found relevant products (e.g. via products.search) to show them with a chosen layout. The customer sees real product cards they can click.",
  scope: "catalog:read",
  input: presentProductsInput,
  output: presentProductsOutput,
  skipAudit: true,
  handler: async (args) => {
    const rows = await prisma.product.findMany({
      where: { slug: { in: args.productSlugs }, deletedAt: null },
      include: { category: { select: { slug: true, name: true } } },
    });

    // Bevar modellens valgte rækkefølge + dedupér (samme slug to gange ville
    // give dublerede React-keys i klienten). new Set bevarer first-occurrence.
    const bySlug = new Map(rows.map((p) => [p.slug, p]));
    const products = [...new Set(args.productSlugs)]
      .map((slug) => bySlug.get(slug))
      .filter((p): p is (typeof rows)[number] => Boolean(p))
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        brand: p.brand ?? "",
        priceDkk: p.priceDkk,
        stock: p.stock,
        firstImage: resolveProductImageUrls(p)[0] ?? null,
      }));

    return {
      layout: args.layout,
      note: args.note ?? null,
      products,
    };
  },
});

export const uiTools = [presentProducts];
