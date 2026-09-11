import "server-only";

import { mapSite, scrapeUrl } from "@/lib/firecrawl";
import {
  buildArchive,
  extractMedia,
  slugFromUrl,
  type ArchivePage,
  type SiteArchive,
} from "@/lib/import/archive";

/**
 * Site-import — Fase 0 · orchestrator.
 *
 * Discover a site's URLs (Firecrawl `/map`), scrape each (capped for free-tier
 * credits — ~1 credit/page, ~500/month free), and assemble the portable
 * `SiteArchive`. Fail-soft: no `FIRECRAWL_API_KEY` (or an unmappable site) →
 * `{ ok:false }` with a friendly message — never throws.
 *
 * REBUILD-not-CLONE: produces a structure + media inventory only; the import
 * pipeline (Fase 1) rephrases copy through the brand voice and lands pages as
 * drafts.
 */

export type ScrapeSiteResult =
  | { ok: true; archive: SiteArchive }
  | { ok: false; error: string };

/** Free-tier-friendly default cap; hard-capped at 200 (the proven crawl limit). */
const DEFAULT_MAX_PAGES = 50;
const HARD_MAX_PAGES = 200;

export async function scrapeSite(
  url: string,
  opts: { maxPages?: number } = {},
): Promise<ScrapeSiteResult> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? DEFAULT_MAX_PAGES, HARD_MAX_PAGES));

  const links = await mapSite(url, { limit: 5000 });
  if (links === null) {
    return {
      ok: false,
      error:
        "Firecrawl is not configured (set FIRECRAWL_API_KEY) or the site could not be mapped.",
    };
  }

  // Always include the root, de-dupe, and cap for credit budget.
  const urls = [...new Set([url, ...links])].slice(0, maxPages);

  const pages: ArchivePage[] = [];
  for (const pageUrl of urls) {
    // A single page failing (or scrapeUrl ever throwing instead of returning
    // null) must never abort the whole site scrape — skip it and keep going.
    try {
      const doc = await scrapeUrl(pageUrl);
      if (!doc) continue;
      const meta = doc.metadata as Record<string, unknown>;
      const str = (k: string): string | null =>
        typeof meta[k] === "string" ? (meta[k] as string) : null;
      pages.push({
        url: pageUrl,
        slug: slugFromUrl(pageUrl),
        title: str("title") ?? str("ogTitle"),
        description: str("description") ?? str("ogDescription"),
        language: str("language") ?? str("ogLocale"),
        markdown: doc.markdown,
        media: extractMedia(doc.html, pageUrl, [], str("ogImage")),
      });
    } catch {
      continue;
    }
  }

  if (pages.length === 0) {
    return { ok: false, error: "No pages could be scraped from the site." };
  }

  return { ok: true, archive: buildArchive(url, pages) };
}
