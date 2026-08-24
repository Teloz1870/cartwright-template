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
function isMissingPageColumn(error: unknown, column: string): boolean {
  const record =
    error && typeof error === "object"
      ? (error as { message?: unknown; meta?: { column?: unknown } })
      : null;
  const evidence = [
    error instanceof Error ? error.message : String(error),
    typeof record?.message === "string" ? record.message : "",
    typeof record?.meta?.column === "string" ? record.meta.column : "",
  ].join(" ");
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    new RegExp(`(?:main\\.)?Page\\.${escaped}\\b`, "i").test(evidence) ||
    new RegExp(
      `column\\s+(?:["']?Page["']?\\.)?["']?${escaped}["']?\\s+(?:does not exist|was not found)`,
      "i",
    ).test(evidence) ||
    new RegExp(`no such column:\\s*(?:main\\.)?Page\\.${escaped}\\b`, "i").test(
      evidence,
    )
  );
}

function isLegacyPageSchema(error: unknown): boolean {
  return isMissingPageColumn(error, "status");
}

function isMissingAdditiveContentColumns(error: unknown): boolean {
  return (
    isMissingPageColumn(error, "bodyFormat") ||
    isMissingPageColumn(error, "layoutJson")
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
    if (isMissingAdditiveContentColumns(error)) {
      try {
        const page = await prisma.page.findFirst({
          where: { slug, status: "published" },
          select: {
            slug: true,
            title: true,
            body: true,
            heroImage: true,
            metaTitle: true,
            metaDescription: true,
            showInNav: true,
            navOrder: true,
            translations: true,
            updatedAt: true,
            vibeHtml: true,
          },
        });
        return page ? asLegacyPublicPage(page) : null;
      } catch (retryError) {
        // An installation can be more than one additive migration behind.
        // Retry without the new content columns first, but only drop draft
        // filtering if that narrower query proves `status` itself is absent.
        if (!isLegacyPageSchema(retryError)) throw retryError;
      }
    } else if (!isLegacyPageSchema(error)) {
      throw error;
    }

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

/** Resolve aliases in priority order without ever returning a draft row. */
export async function findFirstPublishedPageBySlugs(
  slugs: readonly string[],
): Promise<PublicPageRecord | null> {
  for (const slug of slugs) {
    const page = await findPublishedPageBySlug(slug);
    if (page) return page;
  }
  return null;
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
