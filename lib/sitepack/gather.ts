import type { GatheredSite } from "@/lib/sitepack/export";

/**
 * SitePack gather — the PURE resolution at the heart of the export tool.
 *
 * `resolveGatheredSite` takes the raw fetched rows + a pre-built asset map (id →
 * { sha256, bytes }, with the sha256 already COMPUTED from the blob when the DB
 * column was null — that I/O lives in the tool) and produces the `GatheredSite`
 * the assembly consumes: FK CUIDs resolved to portable natural keys
 * (categoryId → categorySlug, productId → productSlug, *AssetId → bare-hex
 * sha256). No DB, no I/O — fully unit-testable.
 *
 * Only REFERENCED assets (heroes + product galleries) are emitted into `media`,
 * keyed by sha256, so the bundle carries exactly the bytes it points at. A
 * ProductMedia row whose asset has no resolvable sha256 is SKIPPED (it can't be
 * content-addressed) — the tool counts skips for the export report.
 *
 * P0 boundary: a legacy URL hero (heroImage string, NOT a mediaLibrary FK) travels
 * as a URL in the content row and is re-fetched/remapped by the import's media
 * step — only mediaLibrary-FK heroes travel as blobs here (via *Sha256).
 *
 * TOOL CONTRACT (the next PR's impure shell must honor):
 *  - query Product with `where: { deletedAt: null }` — this resolver does NOT
 *    filter soft-deleted rows.
 *  - `select` must RETAIN the id/slug/FK columns this resolves against
 *    (id, slug, categoryId, productId, assetId, heroImage*AssetId) even though the
 *    serializers drop them.
 *  - build assetById with sha256 = MediaAsset.sha256 ?? computeSha256(blobBytes);
 *    on a Blob-fetch failure OMIT the asset (never a placeholder/empty sha — an
 *    empty sha fails the export's BARE_HEX guard and throws).
 *  - surface skippedProductMedia + a "URL-only heroes (re-fetched on import)"
 *    count in the export report.
 */

type Row = Record<string, unknown>;

export type AssetEntry = { sha256: string; bytes: Buffer; row: Row };

export type ResolveInput = {
  pages: Row[];
  categories: Row[];
  services: Row[];
  posts: Row[];
  products: Row[]; // each carries id + slug + categoryId
  variants: Row[]; // each carries productId
  productMedia: Row[]; // each carries productId + assetId
  /** id → resolved asset (sha256 already computed when the DB value was null). */
  assetById: Map<string, AssetEntry>;
  branding: Row;
  integration: Row;
  compositionJson: string;
};

export type ResolveResult = { site: GatheredSite; skippedProductMedia: number };

const idStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function resolveGatheredSite(input: ResolveInput): ResolveResult {
  const shaOf = (assetId: unknown): string | null => {
    const id = idStr(assetId);
    return id ? (input.assetById.get(id)?.sha256 ?? null) : null;
  };
  // id-guarded maps (same discipline as shaOf) so a malformed FK can't collide on
  // a "undefined"/"null" key and resolve a wrong natural key — it resolves to null.
  const slugMap = (rows: Row[]): Map<string, string | null> => {
    const m = new Map<string, string | null>();
    for (const r of rows) {
      const id = idStr(r.id);
      if (id) m.set(id, idStr(r.slug));
    }
    return m;
  };
  const categorySlugById = slugMap(input.categories);
  const productSlugById = slugMap(input.products);
  const slugOf = (map: Map<string, string | null>, fk: unknown): string | null => {
    const id = idStr(fk);
    return id ? (map.get(id) ?? null) : null;
  };

  // ProductMedia rows whose asset can't be content-addressed are dropped (counted).
  let skippedProductMedia = 0;
  const productMedia: GatheredSite["productMedia"] = [];
  for (const row of input.productMedia) {
    const assetSha256 = shaOf(row.assetId);
    if (assetSha256 == null) {
      skippedProductMedia += 1;
      continue;
    }
    productMedia.push({ row, productSlug: slugOf(productSlugById, row.productId), assetSha256 });
  }

  // Collect ONLY the assets actually referenced → the media bundle.
  const referenced = new Set<string>();
  const collect = (id: unknown) => {
    const s = idStr(id);
    if (s && input.assetById.has(s)) referenced.add(s);
  };
  input.pages.forEach((p) => collect(p.heroImageAssetId));
  input.categories.forEach((c) => {
    collect(c.heroImageAssetId);
    collect(c.heroVideoAssetId);
  });
  input.services.forEach((s) => collect(s.heroImageAssetId));
  input.productMedia.forEach((m) => {
    // only the ones we actually kept (have a sha)
    if (shaOf(m.assetId) != null) collect(m.assetId);
  });

  const media: GatheredSite["media"] = [...referenced]
    .map((id) => input.assetById.get(id)!)
    .map((a) => ({ row: a.row, sha256: a.sha256, bytes: a.bytes }));

  const site: GatheredSite = {
    pages: input.pages.map((row) => ({ row, heroImageSha256: shaOf(row.heroImageAssetId) })),
    categories: input.categories.map((row) => ({
      row,
      heroImageSha256: shaOf(row.heroImageAssetId),
      heroVideoSha256: shaOf(row.heroVideoAssetId),
    })),
    services: input.services.map((row) => ({ row, heroImageSha256: shaOf(row.heroImageAssetId) })),
    posts: input.posts,
    products: input.products.map((row) => ({ row, categorySlug: slugOf(categorySlugById, row.categoryId) })),
    variants: input.variants.map((row) => ({ row, productSlug: slugOf(productSlugById, row.productId) })),
    productMedia,
    media,
    branding: input.branding,
    integration: input.integration,
    compositionJson: input.compositionJson,
  };

  return { site, skippedProductMedia };
}
