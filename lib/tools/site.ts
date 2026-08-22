import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { findPublishedPageBySlug, listPublishedPageSummaries } from "@/lib/public-pages";

const publicSlug = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

export const listPublicPages = defineTool({
  name: "site.list_pages",
  description:
    "List public, published site pages. Drafts and administrative fields are never returned.",
  scope: "pages:read",
  input: z.object({ locale: z.string().min(2).optional() }),
  skipAudit: true,
  examples: [{ name: "List public pages", body: { locale: "en" } }],
  handler: async ({ locale }) => {
    const pages = await listPublishedPageSummaries();
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
    const page = await findPublishedPageBySlug(slug);
    if (page) return page;

    const fallback = getDefaultLegalContent(slug, locale ?? "en");
    if (fallback) return { slug, ...fallback, updatedAt: null };
    return { found: false, slug };
  },
});

export const siteTools = [listPublicPages, getPublicPage];
