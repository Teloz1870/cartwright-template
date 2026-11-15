import "server-only";

/**
 * B3 static seam variant — SEO indexing settings WITHOUT a database
 * (site-profile program). The materializer copies this file over
 * `lib/seo-settings.ts` when the db module is not in the profile; NOTHING
 * imports it in the shipped engine (byte-identical until then).
 *
 * No BrandingSettings row → the defaults (public/allow) that every db
 * profile renders until the admin changes them. The types stay identical so
 * robots.ts + app/layout.tsx compile against either variant.
 */

export type SeoIndexing = "public" | "noindex";
export type AiCrawlers = "allow" | "block-training" | "block";
export type SeoSettings = { indexing: SeoIndexing; aiCrawlers: AiCrawlers };

const DEFAULTS: SeoSettings = { indexing: "public", aiCrawlers: "allow" };

export async function getSeoSettings(): Promise<SeoSettings> {
  return DEFAULTS;
}

export function invalidateSeoCache(): void {
  // No store, no cache.
}
