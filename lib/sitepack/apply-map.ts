/**
 * SitePack import — the pure APPLY MAPPERS (ultraplan §5 apply step). Each turns a
 * SANITIZED serialized row (from `parseSitePackContent`) + the impure layer's
 * RESOLVED references into a plain `data` object the orchestrator hands to
 * `prisma.<model>.create({ data })`. No DB, no I/O — the impure apply layer owns
 * id-minting, relation resolution, media fetch, snapshots; this is the testable
 * transform core it wraps.
 *
 * Contracts honored (the import side of lib/sitepack/serialize.ts):
 *  - DRAFT on restore: Page/Service/Post carry a `status` column → forced to
 *    "draft" so a restore never publishes content before the owner reviews.
 *    Category/Product have NO status column → created live (the wizard shows this;
 *    the whole restore is auto-snapshotted for undo).
 *  - Natural-key relink: the collision-resolved `slug`/`sku` (from the dry-run
 *    plan's `resolveCollision`) and the freshly-minted relation ids
 *    (`categoryId`, `productId`, `assetId`, hero `*AssetId`) are INJECTED by the
 *    caller — never the pack's instance-specific CUIDs.
 *  - URL remap: legacy `heroImage`/`heroVideo`/`coverImage`/`images`/`videoUrl`
 *    URLs are rewritten to the new Blob URL via the caller's `urlRemap`
 *    (old absolute URL → new URL); an unmapped URL is left as-is (external links).
 *    `images` is a JSON-string array → each element remapped, re-stringified.
 *  - String-JSON columns (`tags`/`faq`/`images`/`layoutJson`) are TEXT — passed
 *    through verbatim (NO parse; the JSON.parse note in serialize.ts is for the
 *    create-TOOLS, not direct prisma). Json columns (`attributes`/`useCases`/
 *    `comparisonFacts`/`features`/`translations`) pass the value through.
 *  - Required scalars that a malformed pack left null get a conservative fallback
 *    (title/name → slug, body/description → "", priceDkk/stock → 0) so one bad row
 *    degrades instead of failing the whole restore.
 *  - Omit-when-absent: optional fields are only set when present, so prisma uses
 *    the column default (avoids the Json-null / explicit-null footguns).
 *  - NOT carried: supplierId (Supplier collection deferred), id/FK CUIDs, deletedAt.
 */

type Row = Record<string, unknown>;
export type CreateData = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
const DRAFT = "draft";

/** old absolute URL → new Blob URL (built by the impure media step). */
export type UrlRemap = ReadonlyMap<string, string>;

const remapUrl = (url: string | null, m: UrlRemap): string | null => (url ? (m.get(url) ?? url) : null);

/** `Product.images` is a required JSON-string array of URLs — remap each, re-stringify. */
export function remapImagesJson(imagesJson: string | null, m: UrlRemap): string {
  if (!imagesJson) return "[]";
  try {
    const arr: unknown = JSON.parse(imagesJson);
    if (!Array.isArray(arr)) return "[]";
    // Keep only string URLs (drop a malformed pack's non-string elements) so the
    // storefront's `string[]` gallery contract can't be violated.
    return JSON.stringify(arr.filter((u): u is string => typeof u === "string").map((u) => m.get(u) ?? u));
  } catch {
    return "[]";
  }
}

/** Set `key` only when `value` is defined + non-null (→ prisma uses the column default). */
function put(data: CreateData, key: string, value: unknown): void {
  if (value !== null && value !== undefined) data[key] = value;
}
/** A Json-column value: pass an object/array/primitive through; omit null/undefined. */
const jsonOrOmit = (v: unknown): unknown => (v === null || v === undefined ? undefined : v);

export type PageRefs = { slug: string; heroImageAssetId?: string | null; urlRemap: UrlRemap };
export type CategoryRefs = { slug: string; heroImageAssetId?: string | null; heroVideoAssetId?: string | null; urlRemap: UrlRemap };
export type ServiceRefs = { slug: string; heroImageAssetId?: string | null; urlRemap: UrlRemap };
export type PostRefs = { slug: string; urlRemap: UrlRemap };
export type ProductRefs = { slug: string; sku: string | null; categoryId: string; urlRemap: UrlRemap };
export type VariantRefs = { productId: string };
export type ProductMediaRefs = { productId: string; assetId: string };

export function toPageCreate(row: Row, refs: PageRefs): CreateData {
  const data: CreateData = {
    slug: refs.slug,
    title: str(row.title) ?? refs.slug,
    body: str(row.body) ?? "",
    showInNav: bool(row.showInNav),
    status: DRAFT,
  };
  put(data, "navOrder", int(row.navOrder)); // omit-when-absent → prisma @default(0)
  put(data, "bodyFormat", str(row.bodyFormat));
  put(data, "heroImage", remapUrl(str(row.heroImage), refs.urlRemap));
  put(data, "heroImageAssetId", refs.heroImageAssetId ?? null);
  put(data, "metaTitle", str(row.metaTitle));
  put(data, "metaDescription", str(row.metaDescription));
  put(data, "layoutJson", str(row.layoutJson));
  put(data, "vibeHtml", str(row.vibeHtml));
  put(data, "translations", jsonOrOmit(row.translations));
  return data;
}

export function toCategoryCreate(row: Row, refs: CategoryRefs): CreateData {
  const data: CreateData = { name: str(row.name) ?? refs.slug, slug: refs.slug };
  put(data, "description", str(row.description));
  put(data, "vibeHtml", str(row.vibeHtml));
  put(data, "heroImage", remapUrl(str(row.heroImage), refs.urlRemap));
  put(data, "heroImageAssetId", refs.heroImageAssetId ?? null);
  put(data, "heroVideo", remapUrl(str(row.heroVideo), refs.urlRemap));
  put(data, "heroVideoAssetId", refs.heroVideoAssetId ?? null);
  put(data, "descriptionLong", str(row.descriptionLong));
  put(data, "metaTitle", str(row.metaTitle));
  put(data, "metaDescription", str(row.metaDescription));
  put(data, "faq", str(row.faq));
  put(data, "translations", jsonOrOmit(row.translations));
  return data;
}

export function toServiceCreate(row: Row, refs: ServiceRefs): CreateData {
  const data: CreateData = {
    slug: refs.slug,
    title: str(row.title) ?? refs.slug,
    body: str(row.body) ?? "",
    showInNav: bool(row.showInNav),
    status: DRAFT,
  };
  put(data, "shortDescription", str(row.shortDescription));
  put(data, "priceString", str(row.priceString));
  put(data, "heroImage", remapUrl(str(row.heroImage), refs.urlRemap));
  put(data, "heroImageAssetId", refs.heroImageAssetId ?? null);
  put(data, "features", jsonOrOmit(row.features));
  put(data, "vibeHtml", str(row.vibeHtml));
  put(data, "navOrder", int(row.navOrder));
  put(data, "translations", jsonOrOmit(row.translations));
  return data;
}

export function toPostCreate(row: Row, refs: PostRefs): CreateData {
  const data: CreateData = {
    slug: refs.slug,
    title: str(row.title) ?? refs.slug,
    body: str(row.body) ?? "",
    status: DRAFT, // a restored post never publishes; publishedAt left unset
  };
  put(data, "excerpt", str(row.excerpt));
  put(data, "bodyFormat", str(row.bodyFormat));
  put(data, "coverImage", remapUrl(str(row.coverImage), refs.urlRemap));
  put(data, "author", str(row.author));
  put(data, "tags", str(row.tags)); // TEXT column (JSON-string) → verbatim
  put(data, "metaTitle", str(row.metaTitle));
  put(data, "metaDescription", str(row.metaDescription));
  put(data, "vibeHtml", str(row.vibeHtml));
  put(data, "translations", jsonOrOmit(row.translations));
  return data;
}

export function toProductCreate(row: Row, refs: ProductRefs): CreateData {
  const data: CreateData = {
    name: str(row.name) ?? refs.slug,
    slug: refs.slug,
    description: str(row.description) ?? "",
    priceDkk: int(row.priceDkk) ?? 0,
    stock: int(row.stock) ?? 0,
    featured: bool(row.featured),
    images: remapImagesJson(str(row.images), refs.urlRemap),
    categoryId: refs.categoryId,
  };
  put(data, "sku", refs.sku); // collision-resolved (string | null)
  put(data, "videoUrl", remapUrl(str(row.videoUrl), refs.urlRemap));
  put(data, "frameColor", str(row.frameColor));
  put(data, "lensColor", str(row.lensColor));
  put(data, "brand", str(row.brand));
  put(data, "attributes", jsonOrOmit(row.attributes));
  put(data, "answerSummary", str(row.answerSummary));
  put(data, "faq", str(row.faq));
  put(data, "useCases", jsonOrOmit(row.useCases));
  put(data, "comparisonFacts", jsonOrOmit(row.comparisonFacts));
  put(data, "weightGram", int(row.weightGram));
  put(data, "vibeHtml", str(row.vibeHtml));
  put(data, "translations", jsonOrOmit(row.translations));
  return data;
}

export function toVariantCreate(row: Row, refs: VariantRefs): CreateData {
  return {
    productId: refs.productId,
    sku: str(row.sku) ?? "",
    priceDkk: int(row.priceDkk) ?? 0,
    stock: int(row.stock) ?? 0,
    attributes: jsonOrOmit(row.attributes) ?? {}, // required Json
  };
}

export function toProductMediaCreate(row: Row, refs: ProductMediaRefs): CreateData {
  return {
    productId: refs.productId,
    assetId: refs.assetId,
    position: int(row.position) ?? 0,
    role: str(row.role) ?? "gallery",
  };
}
