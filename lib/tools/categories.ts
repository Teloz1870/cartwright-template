import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

const slugRule = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug må kun indeholde a-z, 0-9 og bindestreger");

const upsertInput = z.object({
  slug: slugRule,
  name: z.string().min(2),
  description: z.string().optional(),
});

const deleteInput = z.object({
  slug: slugRule,
  confirm: z.literal(true, { error: "Kræver confirm: true" }),
});

const listInput = z.object({});

export const listCategories = defineTool({
  name: "categories.list",
  description: "List alle kategorier med produkt-count.",
  scope: "categories:read",
  input: listInput,
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
    "Opret eller opdater en kategori ved slug. Hvis slug findes, opdateres name + description; ellers oprettes ny.",
  scope: "categories:write",
  input: upsertInput,
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
    "Slet en kategori. Fejler hvis kategorien stadig har produkter — flyt eller slet produkterne først.",
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
        if (!existing) throw new Error(`Kategori ikke fundet: ${args.slug}`);
        if (existing._count.products > 0) {
          throw new Error(
            `Kategori har ${existing._count.products} produkter — flyt eller slet dem først`,
          );
        }
        await prisma.category.delete({ where: { id: existing.id } });
        return { ok: true, slug: args.slug };
      },
    );
  },
});

export const categoriesTools = [listCategories, upsertCategory, deleteCategory];
