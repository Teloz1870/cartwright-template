/**
 * Site-import — Fase 0 · pure content-archive helpers.
 *
 * Ported from the proven standalone scrape flow (the owner's `scrape.mjs` that
 * archived aluzaun-vidual.de). NO I/O, NO Firecrawl, NO server-only — these are
 * pure functions that turn raw scraped HTML + metadata into the portable
 * `SiteArchive` "contract" the (future) import pipeline consumes. Fully
 * unit-testable in isolation.
 *
 * Design principle — REBUILD, not CLONE: this layer only inventories STRUCTURE
 * + MEDIA (a reference). Prose copy is rephrased through the brand voice
 * downstream; nothing here republishes content 1:1. See
 * internal-docs/content-import-ultraplan.md §2.
 */

export type PageMedia = {
  /** Absolute https image URLs found on the page (img/srcset/bg/source/og). */
  images: string[];
  /** Absolute https PDF URLs (specs, catalogues). */
  documents: string[];
  /** Video embed URLs — NOTED ONLY, never downloaded (YouTube/Vimeo/self-host). */
  videos: string[];
};

export type ArchivePage = {
  url: string;
  slug: string;
  title: string | null;
  description: string | null;
  language: string | null;
  /** The page's text content as markdown (rephrased downstream, not verbatim). */
  markdown: string;
  media: PageMedia;
};

export type SiteArchive = {
  /** The source site root the archive was built from. */
  site: string;
  pages: ArchivePage[];
  counts: { pages: number; images: number; documents: number; videos: number };
};

const isHttp = (u: string): boolean => /^https?:\/\//i.test(u);

/** Resolve a possibly-relative URL against a base; null if unresolvable. */
export function absUrl(raw: string, baseUrl: string): string | null {
  const s = raw.trim();
  if (!s || s.startsWith("data:")) return null;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

/** A `srcset` value → the highest-width candidate URL (else the first). */
export function pickFromSrcset(srcset: string): string | null {
  const parts = srcset.split(",").map((p) => p.trim()).filter(Boolean);
  let best: string | null = null;
  let bestW = -1;
  for (const part of parts) {
    const [url, desc] = part.split(/\s+/);
    if (!url) continue;
    const w = desc && desc.endsWith("w") ? parseInt(desc, 10) || 0 : 0;
    if (w > bestW) {
      bestW = w;
      best = url;
    } else if (!best) {
      best = url;
    }
  }
  return best;
}

/**
 * Pull images / PDF documents / video-embed URLs out of a page's raw HTML
 * (plus og:image + metadata images). Resolves relative URLs against `baseUrl`,
 * keeps only absolute https, de-duplicates. Mirrors the proven scrape.mjs regex
 * set: img src, lazy data-src, srcset (best width), inline background-image,
 * <source>, <a href="*.pdf">, and video embeds (noted, not downloaded).
 */
export function extractMedia(
  html: string,
  baseUrl: string,
  metaImages: Array<string | { url?: string }> = [],
  ogImage?: string | null,
): PageMedia {
  const images = new Set<string>();
  const documents = new Set<string>();
  const videos = new Set<string>();

  const add = (set: Set<string>, raw?: string | null): void => {
    if (!raw) return;
    const abs = absUrl(raw, baseUrl);
    if (abs && isHttp(abs)) set.add(abs);
  };

  if (ogImage) add(images, ogImage);
  for (const m of metaImages) add(images, typeof m === "string" ? m : m?.url);

  if (html) {
    for (const m of html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)) add(images, m[1]);
    for (const m of html.matchAll(/\sdata-src=["']([^"']+)["']/gi)) add(images, m[1]);
    for (const m of html.matchAll(/\s(?:data-)?srcset=["']([^"']+)["']/gi)) {
      const best = pickFromSrcset(m[1]);
      if (best) add(images, best);
    }
    for (const m of html.matchAll(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi)) add(images, m[1]);
    for (const m of html.matchAll(/<source\b[^>]*?\ssrc=["']([^"']+)["']/gi)) add(images, m[1]);
    for (const m of html.matchAll(/<a\b[^>]*?\shref=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) add(documents, m[1]);
    // Video embeds — NOTED ONLY. Match the keyword against the resolved HOST
    // (not anywhere in the URL) so e.g. https://not-youtube.com/ is NOT a false
    // positive. Self-hosted .mp4/.webm/.mov files are captured separately below.
    for (const m of html.matchAll(/<iframe\b[^>]*?\ssrc=["']([^"']+)["']/gi)) {
      const abs = absUrl(m[1], baseUrl);
      if (!abs || !isHttp(abs)) continue;
      let host = "";
      try {
        host = new URL(abs).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (/(?:^|\.)(?:youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) videos.add(abs);
    }
    for (const m of html.matchAll(/<(?:video|source)\b[^>]*?\ssrc=["']([^"']+\.(?:mp4|webm|mov)(?:\?[^"']*)?)["']/gi)) add(videos, m[1]);
  }

  return { images: [...images], documents: [...documents], videos: [...videos] };
}

/** A source URL → a filesystem-safe slug (root → "index"). */
export function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const slug = (path || "index")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return slug || "index";
  } catch {
    return "index";
  }
}

/** Assemble scraped page docs into the portable `SiteArchive` contract. */
export function buildArchive(site: string, pages: ArchivePage[]): SiteArchive {
  const counts = pages.reduce(
    (acc, p) => {
      acc.images += p.media.images.length;
      acc.documents += p.media.documents.length;
      acc.videos += p.media.videos.length;
      return acc;
    },
    { pages: pages.length, images: 0, documents: 0, videos: 0 },
  );
  return { site, pages, counts };
}
