import { computeSha256 } from "@/lib/media/asset";
import { resolveGatheredSite, type AssetEntry } from "@/lib/sitepack/gather";
import { assembleCartpack, type ExportMeta } from "@/lib/sitepack/export";

/**
 * SitePack export orchestration — wires the proven pure layers (gather → assemble)
 * to the gathered rows + an INJECTED blob-fetch, so the whole orchestration is
 * unit-testable without prisma or the network. The `sitepack.export` tool fills
 * `ExportData` from prisma + a real Blob fetch + exportComposition/getPluginStates
 * + the release marker, then calls this.
 *
 * The asset-map step is the one impure concern: for each referenced MediaAsset,
 * fetch its bytes (the tool's injected `fetchAssetBytes`), then ALWAYS compute the
 * content address from those bytes (`computeSha256(bytes)`) — the DB
 * `MediaAsset.sha256` is a DEDUP key only and may be stale/wrong; trusting it
 * would ship a blob at `media/blobs/<sha>` whose bytes don't hash to `<sha>`,
 * breaking the importer's per-blob verify. An asset whose bytes can't be fetched
 * is OMITTED (never a placeholder sha) — gather then skips any ProductMedia/hero
 * that pointed at it, so the pack never ships a dangling content address.
 *
 * TOOL CONTRACT for the final `sitepack.export` PR (the impure shell):
 *  - implement fetchAssetBytes as `fetch(asset.url)` → Buffer (our own trusted
 *    Blob URL — NOT through safe-fetch; add an AbortController timeout + size cap).
 *  - exporter.gitRef = the actual git HEAD sha (e.g. `git rev-parse HEAD` /
 *    VERCEL_GIT_COMMIT_SHA), NOT the release marker's `ref` ("source") — that's
 *    the whole point of the honest 0.0.0-source fallback. Use the marker's
 *    version/channel/commit.
 *  - scope `settings:read` (read-only); gate behind a NEW default-off `sitePack`
 *    feature flag (do not reuse `siteImport`); audit; never customer/voice-reachable.
 *  - prisma: Product `where: { deletedAt: null }`; `select` must retain id/slug/FKs
 *    (categoryId/productId/assetId/heroImage*AssetId); branding+integration are
 *    FULL rows (the redactors are positive allowlists).
 *  - designRef.kind: "data" for a built-in DESIGNS-registry slug; "code" only for
 *    a truly custom pack — and couple kind:"code" ⇒ containsCode:true.
 *  - id should be STABLE across re-exports (persist it; a fresh ULID each export
 *    breaks registry dedup).
 */

type Row = Record<string, unknown>;

export type ExportData = {
  pages: Row[];
  categories: Row[];
  services: Row[];
  posts: Row[];
  products: Row[];
  variants: Row[];
  productMedia: Row[];
  /** the REFERENCED MediaAsset rows (the tool pre-filters to heroes + galleries). */
  mediaAssets: Row[];
  branding: Row;
  integration: Row;
  compositionJson: string;
  /** injected: stream an asset's bytes from Blob; null on failure (asset omitted). */
  fetchAssetBytes: (asset: Row) => Promise<Buffer | null>;
};

export type ExportReport = {
  counts: Record<string, number>;
  skippedProductMedia: number;
  mediaFetchFailed: number;
  sizeBytes: number;
};

export async function runExport(data: ExportData, meta: ExportMeta): Promise<{ cartpack: Buffer; report: ExportReport }> {
  const assetById = new Map<string, AssetEntry>();
  let mediaFetchFailed = 0;
  for (const a of data.mediaAssets) {
    const id = typeof a.id === "string" && a.id !== "" ? a.id : null;
    if (!id) continue;
    const bytes = await data.fetchAssetBytes(a);
    if (!bytes) {
      mediaFetchFailed += 1;
      continue; // omit — never a placeholder sha (would trip the export's bare-hex guard)
    }
    // ALWAYS hash the actual bytes — the content address must match the bytes.
    assetById.set(id, { sha256: computeSha256(bytes), bytes, row: a });
  }

  const { site, skippedProductMedia } = resolveGatheredSite({
    pages: data.pages,
    categories: data.categories,
    services: data.services,
    posts: data.posts,
    products: data.products,
    variants: data.variants,
    productMedia: data.productMedia,
    assetById,
    branding: data.branding,
    integration: data.integration,
    compositionJson: data.compositionJson,
  });

  const cartpack = assembleCartpack(site, meta);
  const counts: Record<string, number> = {
    pages: data.pages.length,
    categories: data.categories.length,
    products: data.products.length,
    services: data.services.length,
    posts: data.posts.length,
    mediaAssets: site.media.length, // the assets actually bundled
  };
  return { cartpack, report: { counts, skippedProductMedia, mediaFetchFailed, sizeBytes: cartpack.length } };
}
