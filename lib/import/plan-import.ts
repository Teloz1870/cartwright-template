import type { SiteArchive } from "@/lib/import/archive";
import { classifyPage, PAGE_KINDS, type PageKind } from "@/lib/import/classify";

/**
 * Site-import — Fase 1.1 · pure import planner (dry-run).
 *
 * Turns a `SiteArchive` into an `ImportPlan` — a deterministic PREVIEW of WHAT
 * would be created (per-page kind + media counts + per-kind totals) WITHOUT
 * writing anything. The owner reviews + corrects the classification here; Fase
 * 1.2 then executes against the tool-registry as drafts.
 *
 * NOTE (per the Fase 1.1 review): the plan is a PREVIEW, not the execution
 * payload — Fase 1.2 re-joins each item to the original `SiteArchive` by `url`
 * for the body/media/markdown the tools require. Fase 1.2 has prerequisites of
 * its own — a posts.create + services.create tool, a draft column, and more.
 */

export type ImportPlanItem = {
  url: string;
  slug: string;
  kind: PageKind;
  title: string | null;
  language: string | null;
  imageCount: number;
  documentCount: number;
};

export type ImportPlan = {
  site: string;
  items: ImportPlanItem[];
  /** Count of pages per kind (every PageKind present, zero-filled). */
  byKind: Record<PageKind, number>;
  totals: { pages: number; images: number; documents: number; videos: number };
};

function emptyByKind(): Record<PageKind, number> {
  return Object.fromEntries(PAGE_KINDS.map((k) => [k, 0])) as Record<PageKind, number>;
}

export function planImport(archive: SiteArchive): ImportPlan {
  const items: ImportPlanItem[] = archive.pages.map((p) => ({
    url: p.url,
    slug: p.slug,
    kind: classifyPage(p),
    title: p.title,
    language: p.language,
    imageCount: p.media.images.length,
    documentCount: p.media.documents.length,
  }));

  const byKind = emptyByKind();
  for (const it of items) byKind[it.kind] += 1;

  // Derive totals from the ACTUAL pages — never trust a possibly-stale
  // archive.counts (a hand-built archive could disagree with its page list).
  const totals = archive.pages.reduce(
    (acc, p) => {
      acc.images += p.media.images.length;
      acc.documents += p.media.documents.length;
      acc.videos += p.media.videos.length;
      return acc;
    },
    { pages: archive.pages.length, images: 0, documents: 0, videos: 0 },
  );

  return { site: archive.site, items, byKind, totals };
}
