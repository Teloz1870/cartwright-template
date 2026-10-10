import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { listPublishedPageSummaries } from "@/lib/public-pages";
import { isTrustPageSourceSlug } from "@/lib/canonical-public-routes";
import { profileCapabilities } from "@/lib/profile-capabilities";
import { applyTrailingSlash, productHref, categoryHref } from "@/lib/urls";

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
      // A sold-out product is still a page — it answers 200, keeps its
      // ranking and comes back in stock. Filtering on `stock > 0` made every
      // sell-out a URL that vanished from the sitemap and reappeared later
      // (churn engines punish), while a `draft` product (never a public page)
      // was listed. The public-catalogue rule is `status: "active"` +
      // `deletedAt: null`; availability belongs in the page's JSON-LD.
      prisma.product.findMany({
        select: { slug: true, createdAt: true },
        where: { status: "active", deletedAt: null },
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

  // A hand-built path gets the slash `urls.trailingSlash` asks for, so no entry
  // points at a 308 (URL2); off, the path is unchanged. Product and category
  // links already come through lib/urls.ts with it.
  const at = (path: string) => `${baseUrl}${applyTrailingSlash(path)}`;

  const baseRoutes: MetadataRoute.Sitemap = [
    ...locales.map((locale) => ({
      url: at(`/${locale}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    })),
    // `/changelog` is an engine-only route (scaffold/engine-only.ts): the CLI
    // deletes it from a customer's scaffold, and a sitemap must never advertise
    // a route that is gone (owner CW-24). `Boolean(...)`, never `=== true`
    // (#550/#551/#572). `/manifest` is engine-only too and is deliberately NOT
    // listed: it is locale-shadowed — 307 → 404 on every canary, see
    // KNOWN_SHADOWED in tests/helpers/known-shadowed.ts — and a sitemap must
    // never point at an address that does not answer (AUD18-a).
    ...(Boolean(profileCapabilities.engineMarketing) && brandConfig.website.showAuditFeed
      ? locales.map((locale) => ({
          url: at(`/${locale}/changelog`),
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.4,
        }))
      : []),
    ...(brandConfig.features.mcpPublic
      ? locales.map((locale) => ({
          url: at(`/${locale}/developers`),
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.5,
        }))
      : []),
  ];

  const ecommerceStaticRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled
    ? locales.map((locale) => ({
        url: at(`/${locale}/produkter`),
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.9,
      }))
    : [];

  const categoryRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled 
    ? locales.flatMap((locale) => categories.map((c) => ({
        url: `${baseUrl}${categoryHref({ slug: c.slug }, locale)}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })))
    : [];

  const productRoutes: MetadataRoute.Sitemap = brandConfig.ecommerceEnabled 
    ? locales.flatMap((locale) => products.map((p) => ({
        url: `${baseUrl}${productHref({ slug: p.slug }, locale)}`,
        lastModified: p.createdAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })))
    : [];

  const predictableTrustSlugs = ["about", "contact", "privacy"] as const;
  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
  const trustRoutes: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    predictableTrustSlugs.map((slug) => ({
      url: at(`/${locale}/${slug}`),
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
        url: at(`/${locale}/info/${page.slug}`),
        lastModified: page.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
  );

  const blogRoutes: MetadataRoute.Sitemap = brandConfig.features.blog
      ? locales.flatMap((locale) => [
        {
          url: at(`/${locale}/blog`),
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        },
        ...posts.map((p) => ({
          url: at(`/${locale}/blog/${p.slug}`),
          lastModified: p.updatedAt,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
      ])
      : [];

  return [...baseRoutes, ...ecommerceStaticRoutes, ...categoryRoutes, ...productRoutes, ...trustRoutes, ...pageRoutes, ...blogRoutes];
}
