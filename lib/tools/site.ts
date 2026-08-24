import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { findPublishedPageBySlug, listPublishedPageSummaries } from "@/lib/public-pages";

const publicSlug = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

const publicPageSummaryOutput = z.object({
  slug: z.string(),
  title: z.string(),
  metaDescription: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  url: z.string(),
}).strict();

const publicPageOutput = z.union([
  z.object({
    slug: z.string(),
    title: z.string(),
    body: z.string(),
    bodyFormat: z.string().nullable(),
    heroImage: z.string().nullable(),
    metaTitle: z.string().nullable(),
    metaDescription: z.string().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  }).strict(),
  z.object({ found: z.literal(false), slug: z.string() }).strict(),
]);

function serializedUpdatedAt(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Published page has an invalid updatedAt timestamp");
  }
  return date.toISOString();
}

export const listPublicPages = defineTool({
  name: "site.list_pages",
  description:
    "List public, published site pages. Drafts and administrative fields are never returned.",
  scope: "pages:read",
  input: z.object({ locale: z.string().min(2).optional() }),
  output: z.array(publicPageSummaryOutput),
  skipAudit: true,
  examples: [{ name: "List public pages", body: { locale: "en" } }],
  handler: async ({ locale }) => {
    const pages = await listPublishedPageSummaries();
    return pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      updatedAt: serializedUpdatedAt(page.updatedAt),
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
  output: publicPageOutput,
  skipAudit: true,
  examples: [{ name: "Read the privacy page", body: { slug: "privacy", locale: "en" } }],
  handler: async ({ slug, locale }) => {
    const page = await findPublishedPageBySlug(slug);
    if (page) {
      // Explicit public DTO: the backing Page record also contains navigation,
      // translation, builder-layout and raw takeover fields used by storefront
      // rendering. Those are implementation/admin details and never cross the
      // anonymous REST/MCP boundary.
      return {
        slug: page.slug,
        title: page.title,
        body: page.body,
        bodyFormat: page.bodyFormat ?? null,
        heroImage: page.heroImage ?? null,
        metaTitle: page.metaTitle ?? null,
        metaDescription: page.metaDescription ?? null,
        updatedAt: serializedUpdatedAt(page.updatedAt),
      };
    }

    const fallback = getDefaultLegalContent(slug, locale ?? "en");
    if (fallback) {
      return {
        slug,
        ...fallback,
        bodyFormat: null,
        heroImage: null,
        metaTitle: null,
        metaDescription: null,
        updatedAt: null,
      };
    }
    return { found: false, slug };
  },
});

export const siteTools = [listPublicPages, getPublicPage];
