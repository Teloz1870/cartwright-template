import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { defineTool } from "@/lib/tools/types";
import { getDefaultLegalContent } from "@/lib/legal/default-content";

const publicSlug = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

type PublicPageSummary = {
  slug: string;
  title: string;
  metaDescription: string | null;
  updatedAt: Date;
};

type PublicPageDetail = PublicPageSummary & { body: string };

/**
 * `Page.status` was introduced together with drafts. Older Cartwright
 * databases therefore have neither the column nor a concept of a draft: every
 * Page row was public. Keep upgrades readable without weakening the boundary
 * on current schemas, and never fall back for an unrelated database failure.
 */
function isLegacyPageSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /no such column:\s*(?:main\.)?Page\.status/i.test(message) ||
    /column\s+(?:["']?Page["']?\.)?["']?status["']?\s+does not exist/i.test(message)
  );
}

async function listPublishedPages(): Promise<PublicPageSummary[]> {
  try {
    return await prisma.page.findMany({
      where: { status: "published" },
      orderBy: { slug: "asc" },
      select: { slug: true, title: true, metaDescription: true, updatedAt: true },
    });
  } catch (error) {
    if (!isLegacyPageSchema(error)) throw error;
    return prisma.$queryRaw<PublicPageSummary[]>`
      SELECT "slug", "title", "metaDescription", "updatedAt"
      FROM "Page"
      ORDER BY "slug" ASC
    `;
  }
}

async function findPublishedPage(slug: string): Promise<PublicPageDetail | null> {
  try {
    return await prisma.page.findFirst({
      where: { slug, status: "published" },
      select: {
        slug: true,
        title: true,
        body: true,
        metaDescription: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (!isLegacyPageSchema(error)) throw error;
    const rows = await prisma.$queryRaw<PublicPageDetail[]>`
      SELECT "slug", "title", "body", "metaDescription", "updatedAt"
      FROM "Page"
      WHERE "slug" = ${slug}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

export const listPublicPages = defineTool({
  name: "site.list_pages",
  description:
    "List public, published site pages. Drafts and administrative fields are never returned.",
  scope: "pages:read",
  input: z.object({ locale: z.string().min(2).optional() }),
  skipAudit: true,
  examples: [{ name: "List public pages", body: { locale: "en" } }],
  handler: async ({ locale }) => {
    const pages = await listPublishedPages();
    return pages.map((page) => ({
      ...page,
      url: `/${locale ?? ""}/${["about", "contact", "privacy"].includes(page.slug) ? page.slug : `info/${page.slug}`}`.replace("//", "/"),
    }));
  },
});

export const getPublicPage = defineTool({
  name: "site.get_page",
  description:
    "Get one public, published page by slug. Returns public content only and never exposes drafts.",
  scope: "pages:read",
  input: z.object({ slug: publicSlug, locale: z.string().min(2).optional() }),
  skipAudit: true,
  examples: [{ name: "Read the privacy page", body: { slug: "privacy", locale: "en" } }],
  handler: async ({ slug, locale }) => {
    const page = await findPublishedPage(slug);
    if (page) return page;

    const fallback = getDefaultLegalContent(slug, locale ?? "en");
    if (fallback) return { slug, ...fallback, updatedAt: null };
    return { found: false, slug };
  },
});

export const siteTools = [listPublicPages, getPublicPage];
