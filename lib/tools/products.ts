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
    .regex(/^[a-z0-9-]+$/, "slug må kun indeholde a-z, 0-9 og bindestreger"),
  description: z.string().min(10),
  priceDkk: z.number().int().positive(),
  stock: z.number().int().min(0),
  frameColor: z.string().min(1),
  lensColor: z.string().min(1),
  brand: z.string().min(1),
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
    error: "Destruktiv operation — kræver confirm: true",
  }),
});

// ── Tools ────────────────────────────────────────────────────────────────────

export const searchProducts = defineTool({
  name: "products.search",
  description:
    "Søg produkter med fritekst og filtre (kategori, brand, farver, prisspænd, in-stock). Returnerer slug, navn, brand, pris (øre), lager og om produktet er featured.",
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
    "Hent et enkelt produkt ved slug. Returnerer alle felter inkl. beskrivelse, alle billeder og kategori.",
  scope: "catalog:read",
  input: getInput,
  skipAudit: true,
  handler: async (args) => {
    const product = await prisma.product.findFirst({
      where: { slug: args.slug, deletedAt: null },
      include: { category: { select: { slug: true, name: true, description: true } } },
    });
    if (!product) throw new Error(`Produkt ikke fundet: ${args.slug}`);

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
    "Opret nyt produkt. Tager pris i øre (ikke kroner). Kategori kan angives som enten categoryId (cuid) eller categorySlug ('herre'/'dame'/etc.). images er en liste af URLs.",
  scope: "products:write",
  input: createInput,
  handler: async (args, ctx) => {
    return withAudit({ actor: ctx.actor, tool: "products.create", args, ip: ctx.ip, userAgent: ctx.userAgent }, async () => {
      // Resolve kategori — robust mod AI'er der forveksler id og slug:
      // prøv først som id, så som slug. Hvis ingen match → klar fejlbesked
      // som AI'en kan handle på (i stedet for Prisma FK-violation).
      const candidate = args.categoryId ?? args.categorySlug;
      if (!candidate) {
        throw new Error("categoryId eller categorySlug er påkrævet");
      }
      const category = await prisma.category.findFirst({
        where: { OR: [{ id: candidate }, { slug: candidate }] },
        select: { id: true, slug: true },
      });
      if (!category) {
        throw new Error(
          `Kategori ikke fundet: '${candidate}'. Brug categories.list for at se gyldige kategorier — fx 'herre', 'dame', 'sport', 'polariseret', 'born'.`,
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
    "Partial update af et produkt. Slug identificerer produktet og kan IKKE ændres (opret nyt i stedet hvis slug skal skifte). priceDkk er i øre.",
  scope: "products:write",
  input: updateInput,
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
        if (!existing) throw new Error(`Produkt ikke fundet: ${args.slug}`);

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
    "Soft-delete et produkt (sætter deletedAt). Produktet forsvinder fra katalog men kan hentes tilbage via audit.revert. Kræver confirm: true.",
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
        if (!existing) throw new Error(`Produkt ikke fundet (eller allerede slettet): ${args.slug}`);

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
    "Tilføj en billed-URL til et eksisterende produkt. Append-only — overskriver ikke. Kald dette efter images.search_unsplash når admin har valgt et billede. IKKE confirmation-påkrævet (additivt). URL skal være https.",
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
        if (!product) throw new Error(`Produkt ikke fundet: ${args.slug}`);

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
