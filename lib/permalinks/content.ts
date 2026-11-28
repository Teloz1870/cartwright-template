/**
 * URL-PAGE-POST-a — the permalink model for CMS pages and blog posts, and
 * nothing that serves it yet.
 *
 * `Page.permalink` and `Post.permalink` exist (schema batch B) so a migrated
 * site's old page and post addresses can answer at themselves, as a product's
 * and a category's already do (URL5-b, ./resolve-request.ts). This module is
 * the three rules that serving needs, pure and with no reader:
 *
 * - where a page or a post is rendered (`contentPermalinkPath`),
 * - which rows may ever be served at their permalink (the two `where`s),
 * - which permalinks are held more than once across all four tables
 *   (`permalinkCollisions`; the schema's `@unique` is per table and per
 *   spelling only).
 *
 * URL-PAGE-POST-b wires PAGES in (./resolve-request.ts reads them into the map
 * and rewrites through `contentPermalinkPath`); posts are not served yet.
 * Content has its own kind type, so `PermalinkKind` stays
 * `"product" | "category"`.
 *
 * NO `server-only` here, for the same reason as ./resolve-request.ts: proxy.ts
 * will import the map that reads this.
 */

import { canonicalPublicPagePath } from "@/lib/canonical-public-routes";
import { permalinkKey } from "@/lib/urls";

export type ContentPermalinkKind = "page" | "post";
export type ContentPermalinkTarget = { kind: ContentPermalinkKind; slug: string };

/**
 * The engine route that renders a page or a post, in `locale`: what a stored
 * permalink is rewritten to. A page goes through the table `pageHref` reads
 * (lib/canonical-public-routes.ts), so a trust alias (`about`, `om-os`,
 * `contact`, `privacy`) lands on its predictable route and every other page on
 * `/info/<slug>`; a post on `/blog/<slug>`, the route `app/[locale]/blog/[slug]`
 * serves. Always with the locale, like the product/category rewrite
 * (resolve-request.ts `resolvePermalinkRewrite`), and the slug encoded the same
 * way. No alias has a character `encodeURIComponent` changes, so encoding first
 * never changes which alias is found.
 */
export function contentPermalinkPath(target: ContentPermalinkTarget, locale: string): string {
  const slug = encodeURIComponent(target.slug);
  return target.kind === "page" ? canonicalPublicPagePath(slug, locale) : `/${locale}/blog/${slug}`;
}

/**
 * The pages that may be served at their permalink: the published ones, the
 * filter every public page read uses (`findPublishedPageBySlug`,
 * lib/public-pages.ts:133, and the sitemap's `listPublishedPageSummaries`,
 * :88). A draft (the site importer's default) has no public page, so its old
 * address is not served either.
 */
export const PUBLISHED_PAGE_WHERE = { status: "published" } as const;

/**
 * The posts that may be served at their permalink: exactly the ones
 * `/blog/<slug>` renders (`getPublishedPost`, plugins/blog/lib/blog.ts:106) and
 * the sitemap lists (app/sitemap.ts:56) — `status: "published"`, with no test
 * on `publishedAt`. A future `publishedAt` does not hide a post there, so it
 * must not hide it here: an old address that 404s while the new one answers is
 * the failure `url.parity` exists to catch. Scheduling is a change to all three.
 */
export const PUBLISHED_POST_WHERE = { status: "published" } as const;

export type PermalinkTable = "product" | "category" | "page" | "post";
export type PermalinkHolder = { table: PermalinkTable; slug: string; permalink: string | null };
export type PermalinkCollision = {
  key: string;
  holders: PermalinkHolder[];
  /** Holders sit in more than one table: no constraint can catch this one. */
  crossTable: boolean;
};

/**
 * Every lookup key (`permalinkKey`) held by more than one row, with its
 * holders, in the order the keys first appear. The rule `lib/woo/apply.ts`
 * checks after its write (postconditions, :92-107), widened from two tables to
 * four: every holder counts — a draft page or a deleted product too, since it
 * becomes a second holder the moment it is published again — and holders are
 * compared by key, not spelling, so `/a/` and `/a` in ONE table are a collision
 * the per-table `@unique` lets through (`crossTable: false`). A permalink with
 * no key is never served, so it holds nothing.
 */
export function permalinkCollisions(holders: readonly PermalinkHolder[]): PermalinkCollision[] {
  const byKey = new Map<string, PermalinkHolder[]>();
  for (const holder of holders) {
    const key = holder.permalink === null ? null : permalinkKey(holder.permalink);
    if (key === null) continue;
    const list = byKey.get(key);
    if (list) list.push(holder);
    else byKey.set(key, [holder]);
  }
  const collisions: PermalinkCollision[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    collisions.push({ key, holders: list, crossTable: new Set(list.map((h) => h.table)).size > 1 });
  }
  return collisions;
}
