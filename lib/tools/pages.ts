import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { pageLayoutSchema, parsePageLayout } from "@/lib/builder/section-schema";

const slugRule = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

const upsertInput = z.object({
  slug: slugRule,
  title: z.string().min(2),
  body: z.string().min(10),
});

const deleteInput = z.object({
  slug: slugRule,
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

const listInput = z.object({});

export const listPages = defineTool({
  name: "pages.list",
  description: "List all CMS pages with slug, title, and update timestamp.",
  scope: "pages:read",
  input: listInput,
  examples: [
    {
      name: "List all pages",
      body: {}
    }
  ],
  skipAudit: true,
  handler: async () => {
    return prisma.page.findMany({
      orderBy: { slug: "asc" },
      select: { id: true, slug: true, title: true, updatedAt: true },
    });
  },
});

export const upsertPage = defineTool({
  name: "pages.upsert",
  description:
    "Create or update an /info/<slug> page. Body supports simple markdown-ish formatting (## headers + paragraphs separated by blank lines).",
  scope: "pages:write",
  input: upsertInput,
  examples: [
    {
      name: "Create an About Us page",
      body: {
        slug: "about",
        title: "About Us",
        body: "## Our Story\n\nWe are a family-owned business."
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "pages.upsert",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.page.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const page = await prisma.page.upsert({
          where: { slug: args.slug },
          create: { slug: args.slug, title: args.title, body: args.body },
          update: { title: args.title, body: args.body },
        });
        return { id: page.id, slug: page.slug, title: page.title };
      },
    );
  },
});

export const deletePage = defineTool({
  name: "pages.delete",
  description: "Delete a CMS page. Requires confirm: true.",
  scope: "pages:write",
  input: deleteInput,
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "pages.delete",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.page.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const existing = await prisma.page.findUnique({
          where: { slug: args.slug },
        });
        if (!existing) throw new Error(`Page not found: ${args.slug}`);
        await prisma.page.delete({ where: { id: existing.id } });
        return { ok: true, slug: args.slug };
      },
    );
  },
});

/**
 * Visual Builder — læs en sides section-tree. Null = siden bruger body/vibeHtml.
 * Read-only, derfor skipAudit (samme mønster som design.get_layout).
 */
export const getPageLayout = defineTool({
  name: "pages.get_layout",
  description:
    "Get a CMS page's Visual Builder section-tree layout (null = page renders from body/vibeHtml).",
  scope: "pages:read",
  skipAudit: true,
  input: z.object({ slug: slugRule }),
  examples: [{ name: "Get the about page layout", body: { slug: "about" } }],
  handler: async (args) => {
    const page = await prisma.page.findUnique({
      where: { slug: args.slug },
      select: { layoutJson: true },
    });
    if (!page) throw new Error(`Page not found: ${args.slug}`);
    return { layout: parsePageLayout(page.layoutJson) };
  },
});

/**
 * Visual Builder — sæt en sides section-tree (validated mod section-schema).
 * Mønster 1:1 fra design.set_layout: confirm-gated, revertible, withAudit med
 * før-snapshot af layoutJson så audit.revert kan rulle tilbage. Opretter ikke
 * sider (siden skal eksistere — kun layout muteres).
 */
export const setPageLayout = defineTool({
  name: "pages.set_layout",
  description:
    "Set a CMS page's Visual Builder section-tree layout (sections validated against the section whitelist). Requires confirm: true. Revertible via audit.revert.",
  scope: "pages:write",
  revertible: true,
  input: z.object({
    slug: slugRule,
    confirm: z.literal(true, { error: "Requires confirm: true" }),
    layout: pageLayoutSchema,
  }),
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "pages.set_layout",
        args,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.page.findUnique({
            where: { slug: args.slug },
            select: { layoutJson: true },
          }),
      },
      async () => {
        const existing = await prisma.page.findUnique({
          where: { slug: args.slug },
          select: { id: true },
        });
        if (!existing) throw new Error(`Page not found: ${args.slug}`);
        await prisma.page.update({
          where: { slug: args.slug },
          data: { layoutJson: JSON.stringify(args.layout) },
        });
        return { slug: args.slug, sections: args.layout.sections.length };
      },
    );
  },
});

export const pagesTools = [
  listPages,
  upsertPage,
  deletePage,
  getPageLayout,
  setPageLayout,
];
