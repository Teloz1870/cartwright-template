/**
 * SitePack content serializers (ultraplan §3.3) — turn owner-authored DB rows
 * into the portable NDJSON rows a SitePack carries.
 *
 * POSITIVE ALLOWLIST per model (same discipline as lib/sitepack/redact.ts): each
 * serializer builds the output from named fields, so an operational/derived/secret
 * column can't leak by accident. Every content row carries its `translations`
 * blob (dropping it silently loses all non-default-locale copy). Source CUID `id`s
 * + FK ids are NEVER carried — the natural key (slug / sku / sha256) is the
 * portable identity; the importer mints fresh ids and re-links by natural key.
 *
 * This file is the FLAT collections (Page, Category, Service, Post, MediaAsset).
 * The relational product family (Product + variants + product-media, which need
 * categorySlug / productSlug / assetSha256 resolution) lands in the next PR.
 *
 * Pure: no DB, no I/O. Inputs are the raw rows (permissive); the caller resolves
 * any cross-row natural keys (e.g. a MediaAsset's bare-hex sha256) and passes them.
 *
 * HERO FK PORTABILITY: Page/Category/Service drop the `heroImageAssetId` CUID
 * (instance-specific) but, when `mediaLibrary` is on, the hero may live ONLY in
 * that asset (legacy `heroImage` string is null). So the caller resolves the
 * asset's BARE-hex sha256 and passes it as `heroImageSha256` (+ `heroVideoSha256`
 * for Category) — a portable media key the importer re-links. Without it, a
 * media-library hero would silently vanish on export.
 *
 * IMPORT-SIDE COORDINATION (handled in the import PR, recorded here so the
 * contract is explicit — these serialized shapes do NOT 1:1 match the existing
 * create-tools):
 *  - Post.tags is a JSON-STRING here (faithful to the TEXT column); posts.create
 *    takes string[] → the importer must JSON.parse before calling it.
 *  - pages.upsert / categories.upsert / services.create accept only a thin subset
 *    (slug/title/body/…) → the importer needs direct prisma.create (or expanded
 *    tools + pages.set_layout) to land the full serialized row.
 *  - heroImage/coverImage carried URLs must be remapped to the new Blob asset URL
 *    (absolute — posts/services tools gate on z.string().url()).
 *  - MediaAsset alt/caption/SEO metadata can't be persisted by findOrCreateBySha256
 *    today → the importer needs a mediaAsset.update follow-up after dedup/create.
 *  - serializeProduct is a SUPERSET of products.create: sku / videoUrl / weightGram
 *    / vibeHtml / translations have no tool input, and faq is a JSON-STRING (the
 *    tool takes {q,a}[]) → the importer must use direct prisma.product.create (or
 *    a follow-up) + JSON.parse(faq). There is NO tool for variants/productMedia →
 *    direct prisma.{productVariant,productMedia}.create.
 *  - Product gallery is a legacy-vs-mediaLibrary DUAL PATH (images URL array vs
 *    ProductMedia rows) — the storefront shim picks ONE (strict either/or), so the
 *    importer restores both columns and must re-link ProductMedia.assetSha256 →
 *    newAssetId via the sha256→newAssetId map (no de-dup needed; not a conflict).
 *  - Supplier dropship routing (Product.supplierId) is NOT round-tripped yet —
 *    deferred until the Supplier collection is serialized (no natural key today).
 *
 * EXPORT-SIDE contract: the *Sha256 params (heroImageSha256/heroVideoSha256/
 * assetSha256) are non-null where required BY DESIGN, forcing the caller to deal
 * with a null MediaAsset.sha256 — the exporter must COMPUTE the sha256 from the
 * blob (or SKIP that row) rather than pass null, else the asset silently drops.
 */

type Row = Record<string, unknown>;

/** Caller-resolved portable hero references (bare-hex asset sha256) for the
 *  models whose hero may live only in a MediaAsset FK. */
export type HeroRefs = { heroImageSha256?: string | null; heroVideoSha256?: string | null };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
// Json columns (translations, useCases…) pass through structurally — but only
// plain JSON values, never a class instance.
const json = (v: unknown): unknown => (v === undefined ? null : v);
const isoOrNull = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v !== "") return v;
  return null;
};

// ── NDJSON ─────────────────────────────────────────────────────────────────────

/** Objects → newline-delimited JSON (one row per line, trailing newline). */
export function toNdjson(rows: unknown[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** NDJSON → objects. Blank lines are skipped. Throws on a malformed line. */
export function parseNdjson(text: string): unknown[] {
  const out: unknown[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      throw new Error(`SitePack: malformed NDJSON at line ${i + 1}`);
    }
  }
  return out;
}

// ── Page ────────────────────────────────────────────────────────────────────────

export type SerializedPage = {
  slug: string | null;
  title: string | null;
  body: string | null;
  bodyFormat: string | null;
  heroImage: string | null;
  heroImageSha256: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  showInNav: boolean;
  navOrder: number | null;
  status: string | null;
  layoutJson: string | null;
  vibeHtml: string | null;
  translations: unknown;
};

export function serializePage(row: Row, hero: HeroRefs = {}): SerializedPage {
  return {
    slug: str(row.slug),
    title: str(row.title),
    body: str(row.body),
    bodyFormat: str(row.bodyFormat),
    heroImage: str(row.heroImage), // legacy URL → remapped to a new asset URL on import
    heroImageSha256: hero.heroImageSha256 ?? null, // mediaLibrary hero → portable key
    metaTitle: str(row.metaTitle),
    metaDescription: str(row.metaDescription),
    showInNav: bool(row.showInNav),
    navOrder: int(row.navOrder),
    status: str(row.status),
    layoutJson: str(row.layoutJson),
    vibeHtml: str(row.vibeHtml), // sanitized by the importer before persist (sanitizeUserHtml)
    translations: json(row.translations),
  };
}

// ── Category ──────────────────────────────────────────────────────────────────

export type SerializedCategory = {
  name: string | null;
  slug: string | null;
  description: string | null;
  vibeHtml: string | null;
  heroImage: string | null;
  heroImageSha256: string | null;
  heroVideo: string | null;
  heroVideoSha256: string | null;
  descriptionLong: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  faq: string | null;
  translations: unknown;
};

export function serializeCategory(row: Row, hero: HeroRefs = {}): SerializedCategory {
  return {
    name: str(row.name),
    slug: str(row.slug),
    description: str(row.description),
    // NOTE: carried for forward-compat — the category storefront page does not
    // render vibeHtml today (only info/home/service/blog do). Harmless on restore.
    vibeHtml: str(row.vibeHtml),
    heroImage: str(row.heroImage),
    heroImageSha256: hero.heroImageSha256 ?? null,
    heroVideo: str(row.heroVideo),
    heroVideoSha256: hero.heroVideoSha256 ?? null,
    descriptionLong: str(row.descriptionLong),
    metaTitle: str(row.metaTitle),
    metaDescription: str(row.metaDescription),
    faq: str(row.faq),
    translations: json(row.translations),
  };
}

// ── Service ─────────────────────────────────────────────────────────────────────

export type SerializedService = {
  slug: string | null;
  title: string | null;
  shortDescription: string | null;
  priceString: string | null;
  heroImage: string | null;
  heroImageSha256: string | null;
  features: unknown;
  body: string | null;
  vibeHtml: string | null;
  showInNav: boolean;
  navOrder: number | null;
  status: string | null;
  translations: unknown;
};

export function serializeService(row: Row, hero: HeroRefs = {}): SerializedService {
  return {
    slug: str(row.slug),
    title: str(row.title),
    shortDescription: str(row.shortDescription),
    priceString: str(row.priceString),
    heroImage: str(row.heroImage),
    heroImageSha256: hero.heroImageSha256 ?? null,
    features: json(row.features), // Json array
    body: str(row.body),
    vibeHtml: str(row.vibeHtml),
    showInNav: bool(row.showInNav),
    navOrder: int(row.navOrder),
    status: str(row.status),
    translations: json(row.translations),
  };
}

// ── Post ────────────────────────────────────────────────────────────────────────

export type SerializedPost = {
  slug: string | null;
  title: string | null;
  excerpt: string | null;
  body: string | null;
  bodyFormat: string | null;
  coverImage: string | null;
  author: string | null;
  status: string | null;
  publishedAt: string | null;
  tags: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  vibeHtml: string | null;
  translations: unknown;
};

export function serializePost(row: Row): SerializedPost {
  return {
    slug: str(row.slug),
    title: str(row.title),
    excerpt: str(row.excerpt),
    body: str(row.body),
    bodyFormat: str(row.bodyFormat),
    coverImage: str(row.coverImage),
    author: str(row.author),
    status: str(row.status),
    publishedAt: isoOrNull(row.publishedAt),
    tags: str(row.tags), // JSON-string array
    metaTitle: str(row.metaTitle),
    metaDescription: str(row.metaDescription),
    vibeHtml: str(row.vibeHtml),
    translations: json(row.translations),
  };
}

// ── MediaAsset (media/manifest.ndjson) ────────────────────────────────────────
//
// The binary travels separately at `media/blobs/<sha256>.<ext>`; this row is the
// metadata + the content address. `sha256` is BARE hex (the caller passes the
// resolved value — see lib/media/asset.ts:computeSha256 — NOT the manifest's
// "sha256-"-prefixed form). url/blobPathname/id are NEVER carried (instance-
// specific → remapped on import); aiStatus resets to "pending" on import.

export type SerializedMediaAsset = {
  sha256: string;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  altDa: string | null;
  altEn: string | null;
  title: string | null;
  caption: string | null;
  geoSnippet: string | null;
  dominantColors: string | null;
  suggestedSlug: string | null;
};

export function serializeMediaAsset(row: Row, sha256: string): SerializedMediaAsset {
  return {
    sha256, // bare hex, caller-resolved
    mime: str(row.mime),
    sizeBytes: int(row.sizeBytes),
    width: int(row.width),
    height: int(row.height),
    durationSec: int(row.durationSec),
    altDa: str(row.altDa),
    altEn: str(row.altEn),
    title: str(row.title),
    caption: str(row.caption),
    geoSnippet: str(row.geoSnippet),
    dominantColors: str(row.dominantColors),
    suggestedSlug: str(row.suggestedSlug),
  };
}

// ── Product (relational) ──────────────────────────────────────────────────────
//
// The Product↔Category FK is resolved to `categorySlug` (the portable identity)
// by the caller. `images` is a legacy JSON-string array of URLs (remapped on
// import, like heroImage); the deduped media gallery rides via ProductMedia
// (below) keyed by assetSha256. Dropped: id, categoryId/supplierId/embedding
// (FK/derived), videoGenerationId, sheetRowRef (instance-specific), deletedAt
// (the exporter filters soft-deleted rows out — they never reach here).

export type SerializedProduct = {
  sku: string | null;
  name: string | null;
  slug: string | null;
  categorySlug: string | null;
  description: string | null;
  priceDkk: number | null;
  stock: number | null;
  featured: boolean;
  images: string | null;
  videoUrl: string | null;
  frameColor: string | null;
  lensColor: string | null;
  brand: string | null;
  attributes: unknown;
  answerSummary: string | null;
  faq: string | null;
  useCases: unknown;
  comparisonFacts: unknown;
  weightGram: number | null;
  vibeHtml: string | null;
  translations: unknown;
};

export function serializeProduct(row: Row, resolved: { categorySlug: string | null }): SerializedProduct {
  return {
    sku: str(row.sku),
    name: str(row.name),
    slug: str(row.slug),
    categorySlug: resolved.categorySlug, // resolved from categoryId → portable key
    description: str(row.description),
    priceDkk: int(row.priceDkk),
    stock: int(row.stock),
    featured: bool(row.featured),
    images: str(row.images), // legacy JSON-string URL array → importer remaps URLs
    videoUrl: str(row.videoUrl),
    frameColor: str(row.frameColor),
    lensColor: str(row.lensColor),
    brand: str(row.brand),
    attributes: json(row.attributes),
    answerSummary: str(row.answerSummary),
    faq: str(row.faq),
    useCases: json(row.useCases),
    comparisonFacts: json(row.comparisonFacts),
    weightGram: int(row.weightGram),
    vibeHtml: str(row.vibeHtml),
    translations: json(row.translations),
  };
}

// ── ProductVariant (relational) ───────────────────────────────────────────────
// Parent resolved to `productSlug`. Drops id/productId + cart/order relations.

export type SerializedProductVariant = {
  productSlug: string | null;
  sku: string | null;
  priceDkk: number | null;
  stock: number | null;
  attributes: unknown;
};

export function serializeProductVariant(row: Row, resolved: { productSlug: string | null }): SerializedProductVariant {
  return {
    productSlug: resolved.productSlug,
    sku: str(row.sku),
    priceDkk: int(row.priceDkk),
    stock: int(row.stock),
    attributes: json(row.attributes), // required Json (variant-defining pairs)
  };
}

// ── ProductMedia (the ordered Product↔MediaAsset gallery join) ─────────────────
// Both FK CUIDs resolved to natural keys: productSlug + the asset's BARE-hex
// sha256 (matching the media/blobs/<sha>.<ext> content address).

export type SerializedProductMedia = {
  productSlug: string | null;
  assetSha256: string;
  position: number | null;
  role: string | null;
};

export function serializeProductMedia(
  row: Row,
  resolved: { productSlug: string | null; assetSha256: string },
): SerializedProductMedia {
  return {
    productSlug: resolved.productSlug,
    assetSha256: resolved.assetSha256, // bare hex → re-linked via the sha256→newAssetId map
    position: int(row.position),
    role: str(row.role),
  };
}
