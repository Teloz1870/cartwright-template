import type { MetadataRoute } from "next";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";

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
  const baseUrl = brand.url;
  const now = new Date();

  // Hent dynamisk data parallelt. Try/catch som safety-net: hvis DB er
  // utilgængelig (build-prerender uden TURSO_DATABASE_URL set, fx på
  // fresh-fork-deploys), returner stadig en valid statisk sitemap så
  // build ikke fejler.
  let categories: { slug: string }[] = [];
  let products: { slug: string; createdAt: Date }[] = [];
  let pages: { slug: string; updatedAt: Date }[] = [];
  try {
    [categories, products, pages] = await Promise.all([
      prisma.category.findMany({ select: { slug: true } }),
      prisma.product.findMany({
        select: { slug: true, createdAt: true },
        where: { stock: { gt: 0 } }, // skip helt udsolgte (vi reaktiverer dem ved stock-update)
      }),
      prisma.page.findMany({ select: { slug: true, updatedAt: true } }),
    ]);
  } catch (err) {
    console.warn(
      "[sitemap] DB-fetch fejlede — returnerer kun statiske routes:",
      err instanceof Error ? err.message : err,
    );
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/produkter`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/manifest`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${baseUrl}/kategori/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${baseUrl}/produkt/${p.slug}`,
    lastModified: p.createdAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const pageRoutes: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${baseUrl}/info/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...pageRoutes];
}
