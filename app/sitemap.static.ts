import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";
import { profileCapabilities } from "@/lib/profile-capabilities";
import { applyTrailingSlash, withoutLocalePrefix } from "@/lib/urls";

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
  // Each path is served without its locale under `urls.localePrefix: "never"`
  // (URL1) and gets the slash `urls.trailingSlash` asks for (URL2) — the rules
  // proxy.static.ts redirects by — so no entry points at a redirect; by default
  // the path is unchanged.
  const at = (path: string) => `${baseUrl}${applyTrailingSlash(withoutLocalePrefix(path))}`;

  // `/about` and `/privacy` belong to the `trust-pages` module: a site scaffold
  // has them only with `--with trust-pages`, and a sitemap that advertises a
  // route the materializer removed is exactly the defect the owner measured
  // (CW-24 / W39 — the four trust URLs survived deleting the pages).
  // `/info/{terms,cookies}` stay unconditional: they are the info seam TARGET,
  // which every profile serves from core's static variant.
  // `Boolean(...)`, never `=== true` (#550/#551/#572).
  const trustPages = Boolean(profileCapabilities.trustPages);

  const trustRoutes: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    ...(trustPages
      ? [
          {
            url: at(`/${locale}/about`),
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
          {
            url: at(`/${locale}/privacy`),
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
        ]
      : []),
    ...["terms", "cookies"].map((slug) => ({
      url: at(`/${locale}/info/${slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ]);

  return [
    ...locales.map((locale) => ({
      url: at(`/${locale}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    })),
    ...trustRoutes,
  ];
}
