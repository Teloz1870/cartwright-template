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
  title: z.string().min(2),
  body: z.string().min(10),
});

const deleteInput = z.object({
  slug: slugRule,
  confirm: z.literal(true, { error: "Kræver confirm: true" }),
});

const listInput = z.object({});

export const listPages = defineTool({
  name: "pages.list",
  description: "List alle CMS-sider med slug, titel og opdaterings-tidspunkt.",
  scope: "pages:read",
  input: listInput,
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
    "Opret eller opdater en /info/<slug>-side. Body understøtter simpel markdown-ish (## headers + paragrafer adskilt af blank linje).",
  scope: "pages:write",
  input: upsertInput,
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
  description: "Slet en CMS-side. Kræver confirm: true.",
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
        if (!existing) throw new Error(`Side ikke fundet: ${args.slug}`);
        await prisma.page.delete({ where: { id: existing.id } });
        return { ok: true, slug: args.slug };
      },
    );
  },
});

export const pagesTools = [listPages, upsertPage, deletePage];
