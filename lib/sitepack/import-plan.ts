import { KNOWN_COUNT_KEYS, type CountKey, type SitePackManifest } from "@/lib/sitepack/spec";
import type { SitePackContent } from "@/lib/sitepack/import-parse";

/**
 * SitePack import — the DRY-RUN PLAN (ultraplan §5, the confirm-surface). Given a
 * validated manifest, the sanitized content (from `parseSitePackContent`), and a
 * snapshot of the engine's EXISTING natural keys (gathered by the impure caller),
 * compute EXACTLY what a restore would do — WITHOUT touching the DB. This is the
 * object the `/admin/sitepacks` wizard renders before the owner confirms.
 *
 * Restore is NON-DESTRUCTIVE by the locked decision: a row whose natural key
 * already exists is created under a SUFFIXED key (`about` → `about-2`), never
 * overwriting. The suffix rule (`resolveCollision`) is exported so the apply layer
 * reuses it verbatim — the preview's predicted key MUST equal what apply writes.
 *
 * Uniqueness honored (prisma/schema.prisma): Page/Category/Service/Post `slug`,
 * Product `slug` AND `sku` (both @unique) — a product collides on EITHER. Variants
 * are `@@unique([productId, sku])`; a restored product is always a fresh id, so its
 * variants land under a new parent and never collide → they ride free (counted, not
 * collision-classified). Media dedups by content hash (sha256) → reuse vs fetch.
 *
 * Pure: no DB, no I/O. The caller passes the existing-key snapshot in.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export type SlugCollection = "pages" | "categories" | "services" | "posts" | "products";
export type RowAction = "create" | "create-suffixed" | "skip";

export type PlanItem = {
  /** The incoming natural key (slug), or null when the row has none. */
  key: string | null;
  action: RowAction;
  /** create-suffixed: the free slug the row will actually be created under (only when it differs). */
  resolvedSlug?: string;
  /** products only: the free sku, when the original collided. */
  resolvedSku?: string;
  /** skip: why. */
  reason?: string;
};

export type CollectionPlan = {
  collection: SlugCollection;
  total: number;
  create: number;
  suffixed: number;
  skip: number;
  items: PlanItem[];
};

export type MediaPlan = {
  total: number;
  /** sha256 already present → reused via findOrCreateBySha256, no download. */
  reuse: number;
  /** new blobs to store. */
  fetch: number;
  fetchBytes: number;
  /** rows with no content hash → cannot be restored. */
  skip: number;
};

export type CountCheck = { collection: CountKey; declared: number; actual: number; ok: boolean };

export type ImportPlan = {
  name: string;
  mode: SitePackManifest["mode"];
  collections: CollectionPlan[];
  /** Children that ride with their (possibly suffixed) parent product — counted only. */
  riders: { variants: number; productMedia: number };
  media: MediaPlan;
  designRef: { slug: string; kind: "data" | "code"; version: string; installed: boolean | null };
  countChecks: CountCheck[];
  warnings: string[];
  totals: { create: number; suffixed: number; skip: number };
};

/** The engine's existing natural keys + capability sets, gathered by the caller. */
export type ExistingState = {
  pageSlugs: ReadonlySet<string>;
  categorySlugs: ReadonlySet<string>;
  serviceSlugs: ReadonlySet<string>;
  postSlugs: ReadonlySet<string>;
  productSlugs: ReadonlySet<string>;
  productSkus: ReadonlySet<string>;
  mediaSha256: ReadonlySet<string>;
  /** Optional capability snapshots — drive degrade WARNINGS when provided. */
  installedDesigns?: ReadonlySet<string>;
  installedPlugins?: ReadonlySet<string>;
  enabledFeatures?: ReadonlySet<string>;
};

/** First free value in {value, value-2, value-3, …} not already taken — the
 *  deterministic suffix-on-collision rule. Exported so the apply layer reuses it
 *  and the predicted key equals the written key. */
export function resolveCollision(value: string, taken: ReadonlySet<string>): string {
  if (!taken.has(value)) return value;
  for (let n = 2; ; n++) {
    const candidate = `${value}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function planSlugCollection(collection: SlugCollection, rows: Row[], existing: ReadonlySet<string>): CollectionPlan {
  const taken = new Set(existing);
  const items: PlanItem[] = [];
  let create = 0,
    suffixed = 0,
    skip = 0;
  for (const row of rows) {
    const key = str(row.slug);
    if (!key) {
      items.push({ key: null, action: "skip", reason: "missing slug" });
      skip++;
      continue;
    }
    if (!taken.has(key)) {
      taken.add(key);
      items.push({ key, action: "create" });
      create++;
    } else {
      const resolvedSlug = resolveCollision(key, taken);
      taken.add(resolvedSlug);
      items.push({ key, action: "create-suffixed", resolvedSlug });
      suffixed++;
    }
  }
  return { collection, total: rows.length, create, suffixed, skip, items };
}

function planProducts(rows: Row[], existingSlugs: ReadonlySet<string>, existingSkus: ReadonlySet<string>): CollectionPlan {
  const takenSlugs = new Set(existingSlugs);
  const takenSkus = new Set(existingSkus);
  const items: PlanItem[] = [];
  let create = 0,
    suffixed = 0,
    skip = 0;
  for (const row of rows) {
    const slug = str(row.slug);
    if (!slug) {
      items.push({ key: null, action: "skip", reason: "missing slug" });
      skip++;
      continue;
    }
    const sku = str(row.sku);
    const slugCollides = takenSlugs.has(slug);
    const skuCollides = sku !== null && takenSkus.has(sku);
    if (!slugCollides && !skuCollides) {
      takenSlugs.add(slug);
      if (sku) takenSkus.add(sku);
      items.push({ key: slug, action: "create" });
      create++;
    } else {
      const resolvedSlug = resolveCollision(slug, takenSlugs);
      takenSlugs.add(resolvedSlug);
      const item: PlanItem = { key: slug, action: "create-suffixed" };
      if (resolvedSlug !== slug) item.resolvedSlug = resolvedSlug;
      if (sku) {
        const resolvedSku = skuCollides ? resolveCollision(sku, takenSkus) : sku;
        takenSkus.add(resolvedSku);
        if (resolvedSku !== sku) item.resolvedSku = resolvedSku;
      }
      items.push(item);
      suffixed++;
    }
  }
  return { collection: "products", total: rows.length, create, suffixed, skip, items };
}

function planMedia(rows: Row[], existing: ReadonlySet<string>): MediaPlan {
  const seen = new Set<string>(); // dedup BOTH reuse + fetch by content hash
  let reuse = 0,
    fetch = 0,
    fetchBytes = 0,
    skip = 0;
  for (const row of rows) {
    const sha = str(row.sha256);
    if (!sha) {
      skip++;
      continue;
    }
    if (seen.has(sha)) continue; // same asset listed twice → count once
    seen.add(sha);
    if (existing.has(sha)) {
      reuse++;
    } else {
      fetch++;
      const n = row.sizeBytes;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) fetchBytes += n;
    }
  }
  return { total: rows.length, reuse, fetch, fetchBytes, skip };
}

export function buildImportPlan(manifest: SitePackManifest, content: SitePackContent, existing: ExistingState): ImportPlan {
  const collections: CollectionPlan[] = [
    planSlugCollection("pages", content.pages, existing.pageSlugs),
    planSlugCollection("categories", content.categories, existing.categorySlugs),
    planSlugCollection("services", content.services, existing.serviceSlugs),
    planSlugCollection("posts", content.posts, existing.postSlugs),
    planProducts(content.products, existing.productSlugs, existing.productSkus),
  ];
  const media = planMedia(content.media, existing.mediaSha256);
  const warnings: string[] = [];

  // Design degrade (P0 = data-design is the steered default; a code design that
  // isn't installed restores as fallback palette only).
  const installed = existing.installedDesigns ? existing.installedDesigns.has(manifest.designRef.slug) : null;
  if (manifest.designRef.kind === "code" && installed === false) {
    warnings.push(
      `The pack's design "${manifest.designRef.slug}" is a code design that isn't installed here — restore falls back to its palette only.`,
    );
  }
  if (existing.installedPlugins) {
    for (const p of manifest.pluginsRequired) {
      if (!existing.installedPlugins.has(p)) warnings.push(`Required plugin "${p}" is not installed — related content may not render.`);
    }
  }
  if (existing.enabledFeatures) {
    for (const f of manifest.featuresRequired) {
      if (!existing.enabledFeatures.has(f)) warnings.push(`Required feature "${f}" is not enabled.`);
    }
  }

  // Counts reconciliation: the exporter's declared counts vs what survived
  // parse+sanitize (the non-object-row filter can drop malformed rows).
  const actualByKey: Record<CountKey, number> = {
    pages: content.pages.length,
    categories: content.categories.length,
    products: content.products.length,
    services: content.services.length,
    posts: content.posts.length,
    mediaAssets: content.media.length,
    variants: content.variants.length,
    productMedia: content.productMedia.length,
  };
  const countChecks: CountCheck[] = KNOWN_COUNT_KEYS.map((collection) => {
    const declared = manifest.counts[collection] ?? 0;
    const actual = actualByKey[collection];
    const ok = declared === actual;
    if (!ok) {
      const tail = declared > actual ? ` (${declared - actual} dropped as malformed)` : "";
      warnings.push(`Count mismatch for ${collection}: pack declares ${declared}, ${actual} parsed${tail}.`);
    }
    return { collection, declared, actual, ok };
  });
  if (media.skip > 0) {
    warnings.push(`${media.skip} media ${media.skip === 1 ? "entry has" : "entries have"} no content hash and will be skipped.`);
  }

  const totals = collections.reduce(
    (t, c) => ({ create: t.create + c.create, suffixed: t.suffixed + c.suffixed, skip: t.skip + c.skip }),
    { create: 0, suffixed: 0, skip: 0 },
  );

  return {
    name: manifest.name,
    mode: manifest.mode,
    collections,
    riders: { variants: content.variants.length, productMedia: content.productMedia.length },
    media,
    designRef: { ...manifest.designRef, installed },
    countChecks,
    warnings,
    totals,
  };
}
