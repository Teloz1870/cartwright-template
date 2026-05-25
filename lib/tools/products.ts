import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { parseProductImages } from "@/lib/products";
import { defineTool } from "@/lib/tools/types";

// ── Schemas ──────────────────────────────────────────────────────────────────
//
// Tools tager øre direkte (priceDkk), ikke kroner. Det er en deliberate
// forskel fra HTML-formular-schemas i lib/validation.ts: forms accepterer
// menneske-input (priceKr), tools accepterer maskine-input (øre). Begge ender
// med at lægge øre i DB.

const searchInput = z.object({
  q: z.string().optional(),
  categorySlug: z.string().optional(),
  brand: z.string().optional(),
  frameColor: z.string().optional(),
  lensColor: z.string().optional(),
  featured: z.boolean().optional(),
  inStock: z.boolean().optional(),
  minPriceOere: z.number().int().min(0).optional(),
  maxPriceOere: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const getInput = z.object({
  slug: z.string().min(1),
});

// Base-shape uden refinement, så update.partial() virker. Vi validerer
// 'enten-eller'-kravet på categoryId/categorySlug inde i handler-koden
// for create-tool'et (kun der er begge påkrævet — update kan lade dem
// være urørte hvis kategorien ikke skal ændres).
const createShape = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens"),
  description: z.string().min(10),
  priceDkk: z.number().int().positive(),
  stock: z.number().int().min(0),
  frameColor: z.string().min(1).optional(),
  lensColor: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  /** Kategori-cuid (fx 'cmp5z5uyr000dcaq9p1vguwk4'). Brug categorySlug
   *  i stedet hvis du kun har slug ('herre', 'dame' etc.). */
  categoryId: z.string().optional(),
  /** Kategori-slug ('herre', 'dame', 'sport', 'polariseret', 'born').
   *  Tool slår op i Category-tabellen for at finde cuid. */
  categorySlug: z.string().optional(),
  featured: z.boolean().default(false),
  images: z.array(z.string().url()).default([]),
});

const createInput = createShape;

const updateInput = z.object({
  slug: z.string().min(1),
  patch: createShape.partial().omit({ slug: true }),
});

const deleteInput = z.object({
  slug: z.string().min(1),
  confirm: z.literal(true, {
    error: "Destructive operation - requires confirm: true",
  }),
});

// ── Tools ────────────────────────────────────────────────────────────────────

export const searchProducts = defineTool({
  name: "products.search",
  description:
    "Search products with free text and filters (category, brand, colors, price range, in-stock). Returns slug, name, brand, price (ore), stock, and whether the product is featured.",
  scope: "catalog:read",
  input: searchInput,
  skipAudit: true,
  handler: async (args) => {
    const where: Record<string, unknown> = { deletedAt: null };

    if (args.q) {
      where.OR = [
        { name: { contains: args.q } },
        { brand: { contains: args.q } },
        { description: { contains: args.q } },
      ];
    }
    if (args.categorySlug) where.category = { slug: args.categorySlug };
    if (args.brand) where.brand = args.brand;
    if (args.frameColor) where.frameColor = args.frameColor;
    if (args.lensColor) where.lensColor = args.lensColor;
    if (args.featured !== undefined) where.featured = args.featured;
    if (args.inStock) where.stock = { gt: 0 };
    if (args.minPriceOere !== undefined || args.maxPriceOere !== undefined) {
      where.priceDkk = {
        ...(args.minPriceOere !== undefined ? { gte: args.minPriceOere } : {}),
        ...(args.maxPriceOere !== undefined ? { lte: args.maxPriceOere } : {}),
      };
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: args.limit,
      include: { category: { select: { slug: true, name: true } } },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      priceDkk: p.priceDkk,
      stock: p.stock,
      featured: p.featured,
      frameColor: p.frameColor,
      lensColor: p.lensColor,
      categorySlug: p.category.slug,
      categoryName: p.category.name,
      firstImage: parseProductImages(p.images)[0] ?? null,
    }));
  },
});

export const getProduct = defineTool({
  name: "products.get",
  description:
    "Get a single product by slug. Returns all fields including description, all images, and category.",
  scope: "catalog:read",
  input: getInput,
  skipAudit: true,
  handler: async (args) => {
    const product = await prisma.product.findFirst({
      where: { slug: args.slug, deletedAt: null },
      include: { category: { select: { slug: true, name: true, description: true } } },
    });
    if (!product) throw new Error(`Product not found: ${args.slug}`);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      description: product.description,
      priceDkk: product.priceDkk,
      stock: product.stock,
      featured: product.featured,
      frameColor: product.frameColor,
      lensColor: product.lensColor,
      images: parseProductImages(product.images),
      category: product.category,
      createdAt: product.createdAt,
    };
  },
});

export const createProduct = defineTool({
  name: "products.create",
  description:
    "Create a new product. Takes price in ore (not kroner). Category can be provided as either categoryId (cuid) or categorySlug ('men'/'women'/etc.). images is a list of URLs.",
  scope: "products:write",
  input: createInput,
  examples: [
    {
      name: "Create a basic generic product",
      body: {
        name: "Ceramic Mug",
        slug: "ceramic-mug",
        description: "A simple handmade stoneware mug. Holds 300ml.",
        priceDkk: 24900,
        stock: 12,
        brand: "Cartwright Ceramics",
        categorySlug: "products",
        featured: false,
        images: [],
        attributes: {
          material: "Stoneware",
          color: "White",
          capacity: "300 ml"
        }
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit({ actor: ctx.actor, tool: "products.create", args, ip: ctx.ip, userAgent: ctx.userAgent }, async () => {
      // Resolve kategori — robust mod AI'er der forveksler id og slug:
      // prøv først som id, så som slug. Hvis ingen match → klar fejlbesked
      // som AI'en kan handle på (i stedet for Prisma FK-violation).
      const candidate = args.categoryId ?? args.categorySlug;
      if (!candidate) {
        throw new Error("categoryId or categorySlug is required");
      }
      const category = await prisma.category.findFirst({
        where: { OR: [{ id: candidate }, { slug: candidate }] },
        select: { id: true, slug: true },
      });
      if (!category) {
        throw new Error(
          `Category not found: '${candidate}'. Use categories.list to see valid categories - for example 'men', 'women', 'sport', 'polarized', 'children'.`,
        );
      }
      const categoryId = category.id;

      const product = await prisma.product.create({
        data: {
          name: args.name,
          slug: args.slug,
          description: args.description,
          priceDkk: args.priceDkk,
          stock: args.stock,
          frameColor: args.frameColor,
          lensColor: args.lensColor,
          brand: args.brand,
          categoryId,
          featured: args.featured,
          attributes: args.attributes ? (args.attributes as any) : undefined,
          images: JSON.stringify(args.images),
        },
      });
      return { id: product.id, slug: product.slug };
    });
  },
});

export const updateProduct = defineTool({
  name: "products.update",
  description:
    "Partially update a product. Slug identifies the product and CANNOT be changed (create a new one instead if the slug must change). priceDkk is in ore.",
  scope: "products:write",
  input: updateInput,
  examples: [
    {
      name: "Update product price and stock",
      body: {
        slug: "ceramic-mug",
        patch: {
          priceDkk: 19900,
          stock: 45
        }
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "products.update",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.product.findFirst({
            where: { slug: args.slug, deletedAt: null },
          }),
      },
      async () => {
        const existing = await prisma.product.findFirst({
          where: { slug: args.slug, deletedAt: null },
          select: { id: true },
        });
        if (!existing) throw new Error(`Product not found: ${args.slug}`);

        const data: Record<string, unknown> = { ...args.patch };
        // images er array i input men JSON-streng i DB
        if (Array.isArray(args.patch.images)) {
          data.images = JSON.stringify(args.patch.images);
        }

        const updated = await prisma.product.update({
          where: { id: existing.id },
          data,
        });
        return { id: updated.id, slug: updated.slug };
      },
    );
  },
});

export const deleteProduct = defineTool({
  name: "products.delete",
  description:
    "Soft-delete a product (sets deletedAt). The product disappears from the catalog but can be restored via audit.revert. Requires confirm: true.",
  scope: "products:write",
  input: deleteInput,
  revertible: true,
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "products.delete",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.product.findFirst({
            where: { slug: args.slug, deletedAt: null },
          }),
      },
      async () => {
        const existing = await prisma.product.findFirst({
          where: { slug: args.slug, deletedAt: null },
          select: { id: true },
        });
        if (!existing) throw new Error(`Product not found (or already deleted): ${args.slug}`);

        await prisma.product.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
        return { ok: true, slug: args.slug };
      },
    );
  },
});

// ── products.attach_image ────────────────────────────────────────────────────
//
// Append-only: tilføjer en billed-URL til produktets eksisterende images-array.
// IKKE i CONFIRM_REQUIRED — additivt = lav-risk. Audit-logged via withAudit.
// sourceId-feltet bruges til at gemme Unsplash photo-id'et for attribution.

const attachImageInput = z.object({
  slug: z.string().min(1),
  imageUrl: z.string().url(),
  /** Valgfri alt-text — opbevares i argsJson for senere migration */
  alt: z.string().max(200).optional(),
  /** Kilde-id for attribution (fx Unsplash photo-id). Audit-logged. */
  sourceId: z.string().optional(),
});

export const attachImage = defineTool({
  name: "products.attach_image",
  description:
    "Add an image URL to an existing product. Append-only - does not overwrite. Call this after images.search_unsplash when the admin has chosen an image. Confirmation is NOT required (additive). URL must be https.",
  scope: "products:write",
  input: attachImageInput,
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "products.attach_image",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      async () => {
        const product = await prisma.product.findFirst({
          where: { slug: args.slug, deletedAt: null },
          select: { id: true, images: true },
        });
        if (!product) throw new Error(`Product not found: ${args.slug}`);

        const existing = parseProductImages(product.images);
        // Spring over hvis billedet allerede er der (dedupe)
        if (existing.includes(args.imageUrl)) {
          return {
            ok: true,
            slug: args.slug,
            alreadyAttached: true,
            totalImages: existing.length,
          };
        }

        const next = [...existing, args.imageUrl];
        await prisma.product.update({
          where: { id: product.id },
          data: { images: JSON.stringify(next) },
        });

        return {
          ok: true,
          slug: args.slug,
          attached: args.imageUrl,
          totalImages: next.length,
        };
      },
    );
  },
});

export const productsTools = [
  searchProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  attachImage,
];
