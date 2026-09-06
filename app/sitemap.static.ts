import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

/**
 * B3 static seam variant — the `site`-profile sitemap (site-profile
 * program). The materializer copies this file over `app/sitemap.ts` when
 * the db module is not in the profile; NOTHING imports it in the shipped
 * engine (byte-identical until then).
 *
 * No database → no product/category/page/blog URL sets. The sitemap is the
 * static route skeleton every site profile serves: the homepage plus the
 * always-on info surfaces. Legal info pages render from the built-in default
 * content, so they are safe to advertise.
 */
export const revalidate = 3600;
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brandConfig = await getBrand();
  const baseUrl = brandConfig.url.replace(/\/+$/, "");
  const locales = [...brandConfig.locales];
  const now = new Date();

  const trustRoutes: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    {
      url: `${baseUrl}/${locale}/about`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/${locale}/privacy`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    ...["terms", "cookies"].map((slug) => ({
      url: `${baseUrl}/${locale}/info/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ]);

  return [
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    })),
    ...trustRoutes,
  ];
}
