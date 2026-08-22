import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { slugify } from "@/lib/tools/slug";

// ── Schemas ──────────────────────────────────────────────────────────────────
//
// Service = agency/B2B offering (Service-modellen) — vises på /services i
// website-mode (saas-template). `priceString` er bevidst FREEFORM admin-copy
// ("from $1,200", "On request") — det er IKKE minor units, og der emittes
// derfor heller ingen Offer JSON-LD for den (se services/[slug]/page.tsx).
// Skriv-stien spejler app/admin/services/actions.ts (samme kerne-felter, samme
// semantik) men update er en PARTIAL patch ligesom products.update — så fx et
// rent pris-edit aldrig rører title/body. create udelader bevidst `translations`
// (i18n sættes via /admin/translations) og `heroImageAssetId` (mediaLibrary-FK,
// sættes ej heller af admin-create) — begge nullable, så omission er sikker.

const slugRule = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

async function uniqueServiceSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await prisma.service.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

const createInput = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(1),
  slug: slugRule.optional(),
  shortDescription: z.string().min(1).max(500).optional(),
  priceString: z.string().min(1).max(100).optional(),
  heroImage: z.string().url().optional(),
  features: z.array(z.string()).optional(),
  showInNav: z.boolean().optional(),
  navOrder: z.number().int().optional(),
  // draft → off the public /services until reviewed (the import pipeline lands
  // services as draft); published → live. Defaults to published (applied in the
  // handler so the input stays optional).
  status: z.enum(["draft", "published"]).optional(),
});

const updateInput = z.object({
  slug: z.string().min(1),
  patch: z
    .object({
      title: z.string().min(2).max(200).optional(),
      shortDescription: z.string().min(1).max(500).optional(),
      priceString: z.string().min(1).max(100).optional(),
      body: z.string().min(1).optional(),
      showInNav: z.boolean().optional(),
      navOrder: z.number().int().optional(),
      // publish / unpublish a service (draft ↔ published).
      status: z.enum(["draft", "published"]).optional(),
    })
    .refine((p) => Object.keys(p).length > 0, {
      message: "patch must contain at least one field",
    }),
});

// ── Tools ────────────────────────────────────────────────────────────────────

export const createService = defineTool({
  name: "services.create",
  description:
    "Create a service (agency/website-mode offering shown at /services). Auto-slugs from the title when no slug is given. body is the long copy; priceString is freeform display text (e.g. 'from $1,200', 'On request'), not a numeric price. features is a list of short bullet strings. navOrder sorts the /services listing ascending; showInNav is persisted for the admin UI but does not by itself add a header-nav link. status defaults to \"published\"; pass \"draft\" to keep it off the public /services until reviewed (publish later with services.update).",
  scope: "pages:write",
  input: createInput,
  examples: [
    {
      name: "Create a service",
      body: {
        title: "Brand & identity",
        body: "## What you get\n\nA complete visual identity — logo, palette, type system.",
        priceString: "from $4,500",
        features: ["Logo suite", "Brand guidelines", "Type system"],
        navOrder: 1,
      },
    },
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "services.create",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => Promise.resolve(null),
      },
      async () => {
        let slug: string;
        if (args.slug) {
          const taken = await prisma.service.findUnique({ where: { slug: args.slug }, select: { id: true } });
          if (taken) throw new Error(`A service with slug "${args.slug}" already exists — use services.update.`);
          slug = args.slug;
        } else {
          slug = await uniqueServiceSlug(slugify(args.title, "service"));
        }
        let service;
        try {
          service = await prisma.service.create({
            data: {
              slug,
              title: args.title,
              body: args.body,
              shortDescription: args.shortDescription ?? null,
              priceString: args.priceString ?? null,
              heroImage: args.heroImage ?? null,
              // Json column — store the array directly (NOT a JSON string, unlike
              // Post.tags which is a TEXT column).
              features: args.features ?? [],
              showInNav: args.showInNav ?? false,
              navOrder: args.navOrder ?? 0,
              status: args.status ?? "published",
            },
          });
        } catch (e) {
          // A concurrent create can win the slug between our check and this call
          // (Prisma P2002 unique constraint) — surface the same friendly error.
          if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
            throw new Error(`A service with slug "${slug}" already exists — use services.update.`);
          }
          throw e;
        }
        return { id: service.id, slug: service.slug, status: service.status, publicUrl: `/services/${service.slug}` };
      },
    );
  },
});

export const updateService = defineTool({
  name: "services.update",
  description:
    "Partially update a service (agency offering). Slug identifies the service and cannot be changed. priceString is freeform display text (e.g. 'from $1,200'), not a numeric price.",
  scope: "pages:write",
  input: updateInput,
  examples: [
    {
      name: "Update a service price",
      body: {
        slug: "teeth-cleaning",
        patch: {
          priceString: "from $129",
        },
      },
    },
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "services.update",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.service.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const existing = await prisma.service.findUnique({
          where: { slug: args.slug },
          select: { id: true },
        });
        if (!existing) throw new Error(`Service not found: ${args.slug}`);

        const updated = await prisma.service.update({
          where: { id: existing.id },
          data: { ...args.patch },
        });
        return { id: updated.id, slug: updated.slug };
      },
    );
  },
});

export const servicesTools = [createService, updateService];
