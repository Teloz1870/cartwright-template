import "server-only";

import { prisma } from "@/lib/db";

export type PublicPageSummary = {
  slug: string;
  title: string;
  metaDescription: string | null;
  updatedAt: Date;
};

export type PublicPageRecord = PublicPageSummary & {
  body: string;
  bodyFormat: string | null;
  heroImage: string | null;
  metaTitle: string | null;
  showInNav: boolean;
  navOrder: number;
  translations: unknown;
  vibeHtml: string | null;
  layoutJson: string | null;
};

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

function asLegacyPublicPage(
  page: Omit<PublicPageRecord, "bodyFormat" | "layoutJson">,
): PublicPageRecord {
  return { ...page, bodyFormat: null, layoutJson: null };
}

export async function listPublishedPageSummaries(): Promise<PublicPageSummary[]> {
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

export async function findPublishedPageBySlug(slug: string): Promise<PublicPageRecord | null> {
  try {
    return await prisma.page.findFirst({
      where: { slug, status: "published" },
      select: {
        slug: true,
        title: true,
        body: true,
        bodyFormat: true,
        heroImage: true,
        metaTitle: true,
        metaDescription: true,
        showInNav: true,
        navOrder: true,
        translations: true,
        updatedAt: true,
        vibeHtml: true,
        layoutJson: true,
      },
    });
  } catch (error) {
    if (!isLegacyPageSchema(error)) throw error;
    const rows = await prisma.$queryRaw<Array<Omit<PublicPageRecord, "bodyFormat" | "layoutJson">>>`
      SELECT "slug", "title", "body", "heroImage", "metaTitle",
             "metaDescription", "showInNav", "navOrder", "translations",
             "updatedAt", "vibeHtml"
      FROM "Page"
      WHERE "slug" = ${slug}
      LIMIT 1
    `;
    return rows[0] ? asLegacyPublicPage(rows[0]) : null;
  }
}

export async function listPublishedNavPages(): Promise<Array<{ slug: string; title: string }>> {
  try {
    return await prisma.page.findMany({
      where: { showInNav: true, status: "published" },
      orderBy: { navOrder: "asc" },
      select: { slug: true, title: true },
    });
  } catch (error) {
    if (!isLegacyPageSchema(error)) throw error;
    return prisma.$queryRaw<Array<{ slug: string; title: string }>>`
      SELECT "slug", "title"
      FROM "Page"
      WHERE "showInNav" = ${true}
      ORDER BY "navOrder" ASC
    `;
  }
}

export async function listPublishedInfoSlugs(): Promise<Array<{ slug: string }>> {
  try {
    return await prisma.page.findMany({
      where: { slug: { in: ["about", "om-os", "faq"] }, status: "published" },
      select: { slug: true },
    });
  } catch (error) {
    if (!isLegacyPageSchema(error)) throw error;
    return prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT "slug"
      FROM "Page"
      WHERE "slug" = ${"about"} OR "slug" = ${"om-os"} OR "slug" = ${"faq"}
    `;
  }
}
