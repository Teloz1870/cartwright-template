import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { listPublishedPageSummaries } from "@/lib/public-pages";
import { isTrustPageSourceSlug } from "@/lib/canonical-public-routes";

/**
 * Dynamisk sitemap. Genereres ved request (Next.js cacher det med revalidate).
 * Inkluderer:
 * - Forside (priority 1.0)
 * - Statiske routes (manifest, changelog, info-sider) (priority 0.6)
 * - Kategorier fra DB (priority 0.8)
 * - Produkter fra DB (priority 0.7)
 *
 * Disallow'es i robots.ts: /admin, /konto, /api, /checkout (transactional)
 */

export const revalidate = 3600; // re-generér én gang i timen
// force-dynamic så sitemap KUN kører ved request, ikke ved build-time prerender.
// Build-time prerender kræver DATABASE_URL i schema-validering selv når vi
// bruger libSQL-adapter — det er nemmere at undgå at prerendere end at
// vedligeholde en build-tid placeholder.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brandConfig = await getBrand();
  const baseUrl = brandConfig.url.replace(/\/+$/, "");
  const locales = [...brandConfig.locales];
  const now = new Date();

  let categories: { slug: string }[] = [];
  let products: { slug: string; createdAt: Date }[] = [];
  let pages: { slug: string; updatedAt: Date }[] = [];
  let posts: { slug: string; updatedAt: Date }[] = [];

  try {
    [categories, products, pages, posts] = await Promise.all([
      prisma.category.findMany({ select: { slug: true } }),
      prisma.product.findMany({
        select: { slug: true, createdAt: true },
        where: { stock: { gt: 0 }, deletedAt: null },
      }),
      listPublishedPageSummaries(),
      brandConfig.features.blog
        ? prisma.post.findMany({
            select: { slug: true, updatedAt: true },
            where: { status: "published" },
          })
        : Promise.resolve([]),
    ]);
  } catch (err) {
    console.warn(
      "[sitemap] DB-fetch fejlede — returnerer kun statiske routes:",
      err instanceof Error ? err.message : err,
    );
  }

  const baseRoutes: MetadataRoute.Sitemap = [
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    })),
    {
      url: `${baseUrl}/manifest`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/changelog`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
    ...(brandConfig.features.mcpPublic
      ? locales.map((locale) => ({
          url: `${baseUrl}/${locale}/developers`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.5,
        }))
      : []),
  ];

  const ecommerceStaticRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled
    ? locales.map((locale) => ({
        url: `${baseUrl}/${locale}/produkter`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.9,
      }))
    : [];

  const categoryRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled 
    ? locales.flatMap((locale) => categories.map((c) => ({
        url: `${baseUrl}/${locale}/category/${c.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })))
    : [];

  const productRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled 
    ? locales.flatMap((locale) => products.map((p) => ({
        url: `${baseUrl}/${locale}/product/${p.slug}`,
        lastModified: p.createdAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })))
    : [];

  const predictableTrustSlugs = ["about", "contact", "privacy"] as const;
  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
  const trustRoutes: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    predictableTrustSlugs.map((slug) => ({
      url: `${baseUrl}/${locale}/${slug}`,
      lastModified:
        (slug === "about"
          ? pageBySlug.get("about") ?? pageBySlug.get("om-os")
          : pageBySlug.get(slug))?.updatedAt ?? now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  );
  const pageRoutes: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    pages
      .filter((page) => !isTrustPageSourceSlug(page.slug))
      .map((page) => ({
        url: `${baseUrl}/${locale}/info/${page.slug}`,
        lastModified: page.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
  );

  const blogRoutes: MetadataRoute.Sitemap = brandConfig.features.blog
      ? locales.flatMap((locale) => [
        {
          url: `${baseUrl}/${locale}/blog`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        },
        ...posts.map((p) => ({
          url: `${baseUrl}/${locale}/blog/${p.slug}`,
          lastModified: p.updatedAt,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
      ])
      : [];

  return [...baseRoutes, ...ecommerceStaticRoutes, ...categoryRoutes, ...productRoutes, ...trustRoutes, ...pageRoutes, ...blogRoutes];
}
