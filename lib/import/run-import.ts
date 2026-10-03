import "server-only";

import { prisma } from "@/lib/db";
import type { ToolCtx } from "@/lib/tools/types";
import type { ArchivePage, SiteArchive } from "@/lib/import/archive";
import { planImport, type ImportPlanItem } from "@/lib/import/plan-import";
import { slugify } from "@/lib/tools/slug";
import { upsertPage } from "@/lib/tools/pages";
import { createService } from "@/lib/tools/services";
import { createPost } from "@/lib/tools/posts";
import { importImageFromUrl } from "@/lib/tools/images";
import { brand } from "@/brand.config";
import { canonicalPublicPagePath } from "@/lib/canonical-public-routes";

/**
 * Site-import — Fase 1.2 · the orchestrator.
 *
 * Takes a `SiteArchive` (from scrapeSite) + a planned classification and creates
 * each page as a Cartwright DRAFT via the existing tool surface, importing the
 * hero image into Blob. NOTHING goes live: every created entity lands as a
 * draft (Page/Service via status:"draft", Post via its draft default), so the
 * owner reviews — and, per the REBUILD-not-CLONE principle (ultraplan §2),
 * rephrases the scraped copy through the brand voice — BEFORE publishing. The
 * scraped markdown seeds the draft as a starting reference, never as published
 * 1:1 copy.
 *
 * Determinism: no LLM is called here (copy-rephrase is an explicit owner-step
 * in the review UI / annotateEdit, not baked in). The classification is the
 * deterministic planImport(); each kind maps to exactly one create-tool.
 */

export type ImportAction = "page" | "service" | "post" | "skipped";

export type ImportOutcome = {
  url: string;
  kind: ImportPlanItem["kind"];
  action: ImportAction;
  ok: boolean;
  slug?: string;
  status?: string;
  adminUrl?: string;
  publicUrl?: string;
  imageImported?: boolean;
  /** Why a page was skipped (action="skipped") or the error (ok=false). */
  reason?: string;
};

export type ImportRunResult = {
  site: string;
  outcomes: ImportOutcome[];
  summary: { created: number; skipped: number; failed: number; imagesImported: number };
  /** REBUILD-not-CLONE reminder surfaced on every run (ultraplan §2). */
  notice: string;
};

const REBUILD_NOTICE =
  "Imported pages, services and posts are DRAFTS that reproduce the source copy and images verbatim as a starting reference. Rephrase the copy through your brand voice and verify image/content rights BEFORE publishing — this is a rebuild, not a clone.";

/** A display title the create-tools accept (all require ≥2 chars). */
function pickTitle(pageTitle: string | null, slug: string): string {
  const t = (pageTitle ?? "").trim();
  if (t.length >= 2) return t;
  if (slug.trim().length >= 2) return slug.trim();
  return "Imported";
}

/** A body the create-tools accept (Page/Post require ≥10 chars). */
function buildBody(page: ArchivePage, title: string): string {
  const md = page.markdown.trim();
  if (md.length >= 10) return md;
  // Sparse scrape → seed a minimal, clearly-reviewable stub from title + desc.
  const desc = page.description?.trim();
  return [`## ${title}`, desc || "_(Imported — replace with your own copy.)_"].join("\n\n");
}

/**
 * A page slug that is free in the DB AND not already used earlier in this run —
 * so importing is NON-DESTRUCTIVE: it never upsert-overwrites an existing page
 * (e.g. a live "about") or an earlier imported page that slugified the same.
 */
async function uniquePageSlug(base: string, used: Set<string>): Promise<string> {
  let candidate = base;
  let n = 2;
  while (used.has(candidate) || (await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
    candidate = `${base}-${n++}`;
  }
  used.add(candidate);
  return candidate;
}

/** Best-effort: import the page's first image into Blob; null on any failure. */
async function importHero(page: ArchivePage, ctx: ToolCtx): Promise<string | null> {
  const first = page.media.images[0];
  if (!first) return null;
  try {
    const r = (await importImageFromUrl.handler({ url: first }, ctx)) as { url?: string } | null;
    return r?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Execute an import plan against the tool surface. Each page is created as a
 * draft; a single page's failure is isolated (recorded, never aborts the run).
 * `product` pages are skipped in v1 (webshop products need price/variant
 * handling — tracked as a follow-up).
 */
export async function runImport(archive: SiteArchive, ctx: ToolCtx): Promise<ImportRunResult> {
  const plan = planImport(archive);
  const pageByUrl = new Map(archive.pages.map((p) => [p.url, p] as const));
  const usedPageSlugs = new Set<string>();
  const outcomes: ImportOutcome[] = [];

  for (const item of plan.items) {
    const page = pageByUrl.get(item.url);
    if (!page) {
      outcomes.push({ url: item.url, kind: item.kind, action: "skipped", ok: true, reason: "no archived page for url" });
      continue;
    }

    // Products are out of scope for v1 (webshop pricing/variants ≠ content draft).
    if (item.kind === "product") {
      outcomes.push({ url: item.url, kind: item.kind, action: "skipped", ok: true, reason: "product import not yet supported" });
      continue;
    }

    const title = pickTitle(page.title, item.slug);
    const body = buildBody(page, title);
    const shortDesc = page.description?.trim();
    // Never reuse the magic "home" slug — upserting it would clobber/hide the
    // live homepage. Imported home content lands at its own /info/<slug>.
    const baseSlug = slugify(item.slug || title, "page");
    const candidateSlug = baseSlug === "home" ? "home-imported" : baseSlug;

    try {
      const heroUrl = await importHero(page, ctx);
      const imageImported = Boolean(heroUrl);

      if (item.kind === "service") {
        const r = (await createService.handler(
          {
            title,
            body,
            status: "draft",
            ...(shortDesc ? { shortDescription: shortDesc.slice(0, 500) } : {}),
            ...(heroUrl ? { heroImage: heroUrl } : {}),
          },
          ctx,
        )) as { slug: string; status: string };
        outcomes.push({ url: item.url, kind: item.kind, action: "service", ok: true, slug: r.slug, status: r.status, imageImported, adminUrl: `/admin/services`, publicUrl: `/services/${r.slug}` });
      } else if (item.kind === "blog") {
        const r = (await createPost.handler(
          { title, body, ...(heroUrl ? { coverImage: heroUrl } : {}) },
          ctx,
        )) as { slug: string; status: string };
        outcomes.push({ url: item.url, kind: item.kind, action: "post", ok: true, slug: r.slug, status: r.status, imageImported, adminUrl: `/admin/blog`, publicUrl: `/blog/${r.slug}` });
      } else {
        // home | legal | contact | page → a CMS Page draft. Resolve a slug that
        // is free in the DB + this run so the upsert CREATEs (never overwrites).
        const slug = await uniquePageSlug(candidateSlug, usedPageSlugs);
        const r = (await upsertPage.handler({ slug, title, body, status: "draft" }, ctx)) as { slug: string; status: string };
        outcomes.push({ url: item.url, kind: item.kind, action: "page", ok: true, slug: r.slug, status: r.status, imageImported, adminUrl: `/admin/sider`, publicUrl: canonicalPublicPagePath(r.slug, brand.defaultLocale) });
      }
    } catch (e) {
      outcomes.push({ url: item.url, kind: item.kind, action: item.kind === "service" ? "service" : item.kind === "blog" ? "post" : "page", ok: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary = {
    created: outcomes.filter((o) => o.ok && o.action !== "skipped").length,
    skipped: outcomes.filter((o) => o.action === "skipped").length,
    failed: outcomes.filter((o) => !o.ok).length,
    imagesImported: outcomes.filter((o) => o.imageImported).length,
  };

  return { site: archive.site, outcomes, summary, notice: REBUILD_NOTICE };
}
