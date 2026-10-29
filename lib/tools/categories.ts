import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { categoryCountsWithLinks } from "@/lib/category-tree";
import { findCategoryLinks } from "@/lib/category-links";
import { productWhereFor } from "@/lib/product-visibility";

const slugRule = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

const upsertInput = z.object({
  slug: slugRule,
  name: z.string().min(2),
  description: z.string().optional(),
});

const deleteInput = z.object({
  slug: slugRule,
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

const listInput = z.object({
  includeEmpty: z
    .boolean()
    .optional()
    .describe("Include categories with zero visible products (default true — the historical behaviour)."),
});

const categoryListOutput = z.array(z.strictObject({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  productCount: z.number().int().min(0),
  // WP2-r1′-b: additive, so productCount keeps its meaning.
  productCountWithDescendants: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Only on a category with subcategories: its non-deleted products plus every subcategory's — what its category page lists. productCount stays the products placed in the category itself.",
    ),
}));

const categoryUpsertOutput = z.strictObject({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

const categoryDeleteOutput = z.strictObject({
  ok: z.literal(true),
  slug: z.string(),
});

export const listCategories = defineTool({
  name: "categories.list",
  description: "List public categories with their non-deleted product count.",
  scope: "categories:read",
  input: listInput,
  output: categoryListOutput,
  examples: [
    {
      name: "List all categories",
      body: {}
    }
  ],
  skipAudit: true,
  handler: async (args, ctx) => {
    // A public caller's counts leave drafts out, as the category page does —
    // the primary members and the extra-category links alike.
    const live = productWhereFor(ctx.actor);
    const [cats, links] = await Promise.all([
      prisma.category.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { products: { where: live } },
          },
        },
      }),
      findCategoryLinks("categories.list", live),
    ]);
    // A parent's page lists its subcategories' products, so it is not
    // "empty" when only they hold products. Flat shop: an empty map.
    // WP2-r2′: a product filed here as an extra category counts like a
    // primary member, once; without links the counts are the primary ones.
    const { direct, withDescendants } = categoryCountsWithLinks(
      cats,
      new Map(cats.map((c) => [c.id, c._count.products])),
      links,
    );
    return cats
      .filter((c) => (args.includeEmpty ?? true) || (withDescendants.get(c.id) ?? direct.get(c.id) ?? 0) > 0)
      .map((c) => {
        const total = withDescendants.get(c.id);
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          productCount: direct.get(c.id) ?? c._count.products,
          ...(total === undefined ? {} : { productCountWithDescendants: total }),
        };
      });
  },
});

export const upsertCategory = defineTool({
  name: "categories.upsert",
  description:
    "Create or update a category by slug. If the slug exists, name + description are updated; otherwise a new category is created.",
  scope: "categories:write",
  input: upsertInput,
  output: categoryUpsertOutput,
  examples: [
    {
      name: "Create or update category",
      body: {
        slug: "coffee-beans",
        name: "Coffee Beans",
        description: "Freshly roasted coffee beans"
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "categories.upsert",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.category.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const cat = await prisma.category.upsert({
          where: { slug: args.slug },
          create: {
            slug: args.slug,
            name: args.name,
            description: args.description ?? null,
          },
          update: {
            name: args.name,
            description: args.description ?? null,
          },
        });
        return { id: cat.id, slug: cat.slug, name: cat.name };
      },
    );
  },
});

export const deleteCategory = defineTool({
  name: "categories.delete",
  description:
    "Delete a category. Fails if the category still has products - move or delete the products first.",
  scope: "categories:write",
  input: deleteInput,
  output: categoryDeleteOutput,
  revertible: false, // hard delete; kan ikke gendannes via audit.revert i v1
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "categories.delete",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.category.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const existing = await prisma.category.findUnique({
          where: { slug: args.slug },
          include: { _count: { select: { products: true } } },
        });
        if (!existing) throw new Error(`Category not found: ${args.slug}`);
        if (existing._count.products > 0) {
          throw new Error(
            `Category has ${existing._count.products} products - move or delete them first`,
          );
        }
        await prisma.category.delete({ where: { id: existing.id } });
        return { ok: true, slug: args.slug };
      },
    );
  },
});

export const categoriesTools = [listCategories, upsertCategory, deleteCategory];
