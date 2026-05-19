import type { MetadataRoute } from "next";
import { brand } from "@/brand.config";

/**
 * Robots.txt for search-engine crawlere.
 *
 * Allow: alle public storefront-routes
 * Disallow:
 *   - /admin/* (admin-UI — kun for shop-ejer)
 *   - /konto/* (login + ordrer — kunde-private)
 *   - /api/* (REST/MCP-endpoints — ikke indexerbar HTML)
 *   - /checkout (transactional flow — no SEO-value)
 *
 * Sitemap-reference peger på dynamisk genereret sitemap.xml.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/konto/", "/api/", "/checkout"],
      },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
