import { packSitePack, type PackEntry } from "@/lib/sitepack/archive";
import { buildManifest, canonicalManifestJson } from "@/lib/sitepack/manifest";
import type { SitePackManifest } from "@/lib/sitepack/spec";
import { redactBranding, integrationStub } from "@/lib/sitepack/redact";
import {
  toNdjson,
  serializePage,
  serializeCategory,
  serializeService,
  serializePost,
  serializeMediaAsset,
  serializeProduct,
  serializeProductVariant,
  serializeProductMedia,
} from "@/lib/sitepack/serialize";

/**
 * SitePack export ASSEMBLY (ultraplan §4) — the pure heart of export.
 *
 * `assembleCartpack` turns already-GATHERED + RESOLVED data (the impure prisma/
 * Blob reads + natural-key resolution live in the `sitepack.export` tool, next
 * PR) into a finished `.cartpack` Buffer: content NDJSON + media blobs + the
 * redacted branding + the embedded composition `look` → integrity manifest →
 * gzipped USTAR. No DB, no I/O, no Date.now — fully unit-testable, which is what
 * lets the round-trip test prove the WHOLE path (DB-shape → pack → unpack → verify).
 */

type Row = Record<string, unknown>;

export type GatheredMedia = { row: Row; sha256: string; bytes: Buffer };

export type GatheredSite = {
  pages: { row: Row; heroImageSha256: string | null }[];
  categories: { row: Row; heroImageSha256: string | null; heroVideoSha256: string | null }[];
  services: { row: Row; heroImageSha256: string | null }[];
  posts: Row[];
  products: { row: Row; categorySlug: string | null }[];
  variants: { row: Row; productSlug: string | null }[];
  productMedia: { row: Row; productSlug: string | null; assetSha256: string }[];
  media: GatheredMedia[];
  // The FULL rows — redactBranding/integrationStub are positive allowlists, so a
  // `select`-narrowed row would silently drop posture/look fields. branding's
  // genomeJson carries the authoritative genome (the pack has no separate
  // genome.json — §3.4); the importer applies it OVER composition.voice.
  branding: Row;
  integration: Row;
  /** exportComposition() output, already JSON-stringified (the verbatim look). */
  compositionJson: string;
};

export type ExportMeta = {
  id: string;
  name: string;
  createdAt: string; // ISO 8601, caller-stamped
  exporter: { version: string; channel: "stable" | "next" | "source"; commit?: string; gitRef?: string };
  mode: SitePackManifest["mode"];
  defaultLocale: string;
  locales: string[];
  designRef: { slug: string; kind: "data" | "code"; version?: string };
  pluginsRequired?: string[];
  featuresRequested?: string[];
  featuresRequired?: string[];
  containsCode?: boolean;
};

// The extension is INFORMATIONAL — the bare-hex sha256 is the sole content
// address (the importer strips at the first "." to recover it; a hex sha never
// contains "."). Cover the realistic media set so common types don't collapse to
// ".bin"; the map is fixed so re-export stays byte-identical.
function extFromMime(mime: unknown): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}

const BARE_HEX = /^[0-9a-f]+$/;

/**
 * Build the content/media/look/branding entry map (NOT manifest.json — that's
 * computed from these + added by assembleCartpack). Empty collections emit no
 * file (a missing content/*.ndjson means "empty" to the importer).
 */
export function buildSitePackEntries(g: GatheredSite): { entries: Map<string, Buffer>; counts: Record<string, number> } {
  // Fail CLOSED at export (not at a downloader's import): every media sha must be
  // bare hex (→ a safe blob path), and every sha REFERENCED by a hero/gallery
  // must be backed by a gathered blob — else the pack ships a dangling content
  // address. Catches a gatherer bug here, loudly, instead of silently dropping an
  // asset on restore.
  const mediaShas = new Set<string>();
  for (const m of g.media) {
    if (!BARE_HEX.test(m.sha256)) throw new Error(`SitePack export: media sha256 must be bare lowercase hex, got "${m.sha256}"`);
    mediaShas.add(m.sha256);
  }
  const referenced: (string | null)[] = [
    ...g.pages.map((p) => p.heroImageSha256),
    ...g.categories.flatMap((c) => [c.heroImageSha256, c.heroVideoSha256]),
    ...g.services.map((s) => s.heroImageSha256),
    ...g.productMedia.map((m) => m.assetSha256),
  ];
  for (const sha of referenced) {
    if (sha != null && !mediaShas.has(sha)) {
      throw new Error(`SitePack export: dangling media reference "${sha}" — referenced but no blob gathered`);
    }
  }

  const entries = new Map<string, Buffer>();
  const setNd = (path: string, rows: unknown[]) => {
    if (rows.length) entries.set(path, Buffer.from(toNdjson(rows), "utf8"));
  };

  setNd("content/pages.ndjson", g.pages.map((p) => serializePage(p.row, { heroImageSha256: p.heroImageSha256 })));
  setNd("content/categories.ndjson", g.categories.map((c) => serializeCategory(c.row, { heroImageSha256: c.heroImageSha256, heroVideoSha256: c.heroVideoSha256 })));
  setNd("content/services.ndjson", g.services.map((s) => serializeService(s.row, { heroImageSha256: s.heroImageSha256 })));
  setNd("content/posts.ndjson", g.posts.map((row) => serializePost(row)));
  setNd("content/products.ndjson", g.products.map((p) => serializeProduct(p.row, { categorySlug: p.categorySlug })));
  setNd("content/product-variants.ndjson", g.variants.map((v) => serializeProductVariant(v.row, { productSlug: v.productSlug })));
  setNd("content/product-media.ndjson", g.productMedia.map((m) => serializeProductMedia(m.row, { productSlug: m.productSlug, assetSha256: m.assetSha256 })));

  // Media: the metadata manifest + the content-addressed binaries (bare-hex sha).
  setNd("media/manifest.ndjson", g.media.map((m) => serializeMediaAsset(m.row, m.sha256)));
  for (const m of g.media) entries.set(`media/blobs/${m.sha256}.${extFromMime(m.row.mime)}`, m.bytes);

  // Branding (redacted) + integration stub + the verbatim composition look.
  entries.set("content/branding.json", Buffer.from(JSON.stringify(redactBranding(g.branding)), "utf8"));
  entries.set("content/integrations.stub.json", Buffer.from(JSON.stringify(integrationStub(g.integration)), "utf8"));
  entries.set("look/composition.json", Buffer.from(g.compositionJson, "utf8"));

  const counts: Record<string, number> = {
    pages: g.pages.length,
    categories: g.categories.length,
    products: g.products.length,
    services: g.services.length,
    posts: g.posts.length,
    mediaAssets: g.media.length,
    variants: g.variants.length,
    productMedia: g.productMedia.length,
  };
  return { entries, counts };
}

/** The full export: gathered data + metadata → a finished `.cartpack` Buffer. */
export function assembleCartpack(g: GatheredSite, meta: ExportMeta): Buffer {
  const { entries, counts } = buildSitePackEntries(g);
  const manifest = buildManifest({
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    exporter: meta.exporter,
    mode: meta.mode,
    defaultLocale: meta.defaultLocale,
    locales: meta.locales,
    designRef: meta.designRef,
    pluginsRequired: meta.pluginsRequired,
    featuresRequested: meta.featuresRequested,
    featuresRequired: meta.featuresRequired,
    containsCode: meta.containsCode,
    counts,
    entries, // integrity is over these (manifest.json itself is added AFTER)
  });
  entries.set("manifest.json", canonicalManifestJson(manifest));

  const packEntries: PackEntry[] = [...entries].map(([path, bytes]) => ({ path, bytes }));
  return packSitePack(packEntries);
}
