import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

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

const listInput = z.object({});

export const listCategories = defineTool({
  name: "categories.list",
  description: "List all categories with product count.",
  scope: "categories:read",
  input: listInput,
  examples: [
    {
      name: "List all categories",
      body: {}
    }
  ],
  skipAudit: true,
  handler: async () => {
    const cats = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      productCount: c._count.products,
    }));
  },
});

export const upsertCategory = defineTool({
  name: "categories.upsert",
  description:
    "Create or update a category by slug. If the slug exists, name + description are updated; otherwise a new category is created.",
  scope: "categories:write",
  input: upsertInput,
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
