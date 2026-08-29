import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import { findPublishedPageBySlug, listPublishedPageSummaries } from "@/lib/public-pages";
import { translatedField } from "@/lib/translated-field";
import { brand } from "@/brand.config";

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

/**
 * Clamp a caller-supplied locale to the shop's own set.
 *
 * These tools are anonymous, and the locale is used as a KEY into the row's
 * translation bag. A bag can carry locales this shop never publishes — a
 * sitepack import copies the whole bag verbatim — so an unclamped key turns a
 * read tool into a way to enumerate unpublished copy. `llms.txt` already clamps
 * the same way; this is that rule, on the other surface that needs it.
 */
function readableLocale(locale: string | undefined): string {
  return locale && (brand.locales as readonly string[]).includes(locale)
    ? locale
    : brand.defaultLocale;
}

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
    // `locale` already decided the URL each row is announced under; it has to
    // decide the words too. An agent that asks for one language and is handed
    // another cannot tell the difference — it just quotes the wrong language
    // back to a customer. Omitting `locale` keeps the base text verbatim.
    const readLocale = readableLocale(locale);
    return pages.map((page) => ({
      slug: page.slug,
      title: translatedField(page, "title", readLocale, page.title),
      metaDescription: page.metaDescription ?? null,
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
      // Only `title` and `body` are translated: those are the two fields the
      // engine's own translation writer produces (lib/translations.ts). The
      // meta fields pass through untouched rather than pinning a capability
      // nothing can fill — and passing them through verbatim keeps an empty
      // string an empty string instead of coercing it to null.
      const readLocale = readableLocale(locale);
      return {
        slug: page.slug,
        title: translatedField(page, "title", readLocale, page.title),
        body: translatedField(page, "body", readLocale, page.body),
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
