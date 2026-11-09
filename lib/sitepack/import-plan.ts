import { KNOWN_COUNT_KEYS, type CountKey, type SitePackManifest } from "@/lib/sitepack/spec";
import type { SitePackContent } from "@/lib/sitepack/import-parse";
import { SLUG_RULE, slugifyOrEmpty } from "@/lib/tools/slug";

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
 * Slugs are held to the engine's stored-slug rule (`SLUG_RULE`) BEFORE collision
 * resolution — every other writer enforces it, and a pack slug outside it (`"cup "`)
 * would sit beside the real `cup`, listed verbatim in the catalog feed and resolved
 * to the wrong product by ACP's trim. See `storedSlug`. `key` stays the pack's own
 * slug, because children (products → categorySlug, variants → productSlug) relink by it.
 * Slugs are placed in two passes (`placeSlugs`): a pack slug that already meets the
 * rule claims itself first, so a malformed twin (`"cup "`) never pushes it to `cup-2`.
 * A category with no usable slug falls back to its name; when even that is empty it
 * is skipped, and so are its products (apply could not link them).
 *
 * Pure: no DB, no I/O. The caller passes the existing-key snapshot in.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const INVALID_SLUG = "no URL-safe slug";
const CATEGORY_SKIPPED = "its category is skipped";

/** The slug a pack row is stored under before collision resolution: the pack's own
 *  slug when it meets the rule, trimmed + lowercased when that is all it lacks,
 *  otherwise renamed by the shared slugify. null = nothing slug-safe survives
 *  (refused — never the synthetic `item-<time>` fallback, which would differ
 *  between the dry-run the owner confirmed and the apply). */
function storedSlug(raw: string): string | null {
  const lowered = raw.trim().toLowerCase();
  if (SLUG_RULE.test(lowered)) return lowered;
  return slugifyOrEmpty(lowered) || null;
}

export type SlugCollection = "pages" | "categories" | "services" | "posts" | "products";
export type RowAction = "create" | "create-suffixed" | "skip";

export type PlanItem = {
  /** The incoming natural key (slug), or null when the row has none. */
  key: string | null;
  action: RowAction;
  /** The slug the row will actually be created under, when it differs from `key`
   *  (a collision suffix and/or the stored-slug normalisation). */
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

/** The first few entries of a warning list, so a large malformed pack stays readable. */
function examples(list: string[], max = 3): string {
  const shown = list.slice(0, max).join(", ");
  return list.length > max ? `${shown}, +${list.length - max} more` : shown;
}

/** Where each row's slug lands. Pass 1: a row whose pack slug already meets the
 *  rule (stored slug === key) claims it when it is free, so it is kept exactly as
 *  written whatever order the pack lists its rows in. Pass 2: every other row, in
 *  pack order, takes its slug or the first free suffix. null slug = row skipped. */
function placeSlugs(keys: (string | null)[], slugs: (string | null)[], taken: Set<string>): ({ slug: string; collides: boolean } | null)[] {
  const own = new Set<number>();
  slugs.forEach((slug, i) => {
    if (slug !== null && slug === keys[i] && !taken.has(slug)) {
      taken.add(slug);
      own.add(i);
    }
  });
  return slugs.map((slug, i) => {
    if (slug === null) return null;
    if (own.has(i)) return { slug, collides: false };
    const resolved = resolveCollision(slug, taken);
    taken.add(resolved);
    return { slug: resolved, collides: resolved !== slug };
  });
}

function planSlugCollection(
  collection: SlugCollection,
  rows: Row[],
  existing: ReadonlySet<string>,
  fallback: (row: Row) => string | null = () => null,
): CollectionPlan {
  const keys = rows.map((row) => str(row.slug));
  const slugs = rows.map((row, i) => {
    const key = keys[i];
    return key === null ? null : (storedSlug(key) ?? fallback(row));
  });
  const placed = placeSlugs(keys, slugs, new Set(existing));
  const items: PlanItem[] = [];
  let create = 0,
    suffixed = 0,
    skip = 0;
  rows.forEach((_, i) => {
    const key = keys[i];
    const p = placed[i];
    if (!key || !p) {
      items.push(key ? { key, action: "skip", reason: INVALID_SLUG } : { key: null, action: "skip", reason: "missing slug" });
      skip++;
    } else if (!p.collides) {
      items.push(p.slug === key ? { key, action: "create" } : { key, action: "create", resolvedSlug: p.slug });
      create++;
    } else {
      items.push({ key, action: "create-suffixed", resolvedSlug: p.slug });
      suffixed++;
    }
  });
  return { collection, total: rows.length, create, suffixed, skip, items };
}

function planProducts(
  rows: Row[],
  existingSlugs: ReadonlySet<string>,
  existingSkus: ReadonlySet<string>,
  lostCategories: ReadonlySet<string>,
): CollectionPlan {
  const keys = rows.map((row) => str(row.slug));
  const reasons = rows.map((row, i): string | null => {
    const key = keys[i];
    if (key === null) return "missing slug";
    if (storedSlug(key) === null) return INVALID_SLUG;
    const category = str(row.categorySlug);
    return category !== null && lostCategories.has(category) ? CATEGORY_SKIPPED : null;
  });
  const placed = placeSlugs(
    keys,
    keys.map((key, i) => (key === null || reasons[i] ? null : storedSlug(key))),
    new Set(existingSlugs),
  );
  const takenSkus = new Set(existingSkus);
  const items: PlanItem[] = [];
  let create = 0,
    suffixed = 0,
    skip = 0;
  rows.forEach((row, i) => {
    const key = keys[i];
    const p = placed[i];
    const reason = reasons[i];
    if (!key || !p || reason) {
      items.push({ key, action: "skip", reason: reason ?? INVALID_SLUG });
      skip++;
      return;
    }
    const sku = str(row.sku);
    const skuCollides = sku !== null && takenSkus.has(sku);
    if (!p.collides && !skuCollides) {
      if (sku) takenSkus.add(sku);
      items.push(p.slug === key ? { key, action: "create" } : { key, action: "create", resolvedSlug: p.slug });
      create++;
      return;
    }
    const item: PlanItem = { key, action: "create-suffixed" };
    if (p.slug !== key) item.resolvedSlug = p.slug;
    if (sku) {
      const resolvedSku = skuCollides ? resolveCollision(sku, takenSkus) : sku;
      takenSkus.add(resolvedSku);
      if (resolvedSku !== sku) item.resolvedSku = resolvedSku;
    }
    items.push(item);
    suffixed++;
  });
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
  // A category with no usable slug is stored under its name's slug instead of being
  // dropped, because its products link to it. Only when the name yields nothing too
  // is it skipped — and then its products are planned as skipped, which is what the
  // apply does with them (categoryId is a required FK).
  const categories = planSlugCollection("categories", content.categories, existing.categorySlugs, (row) => slugifyOrEmpty(str(row.name) ?? "") || null);
  const keptCategories = new Set(categories.items.filter((i) => i.action !== "skip").map((i) => i.key));
  const lostCategories = new Set<string>();
  for (const i of categories.items) if (i.key !== null && !keptCategories.has(i.key)) lostCategories.add(i.key);
  const productPlan = planProducts(content.products, existing.productSlugs, existing.productSkus, lostCategories);
  const collections: CollectionPlan[] = [
    planSlugCollection("pages", content.pages, existing.pageSlugs),
    categories,
    planSlugCollection("services", content.services, existing.serviceSlugs),
    planSlugCollection("posts", content.posts, existing.postSlugs),
    productPlan,
  ];
  // Riders go with their product: only those whose product the plan restores are counted.
  const keptProducts = new Set(productPlan.items.filter((i) => i.action !== "skip").map((i) => i.key));
  const riding = (rows: Row[]) => rows.filter((r) => keptProducts.has(str(r.productSlug))).length;
  const orphaned = productPlan.items.filter((i) => i.reason === CATEGORY_SKIPPED).map((i) => i.key);
  const lostWith = (rows: Row[]) => rows.filter((r) => !keptProducts.has(str(r.productSlug)) && orphaned.includes(str(r.productSlug))).length;
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
  for (const c of collections) {
    const renamed: string[] = [];
    const refused: string[] = [];
    for (const i of c.items) {
      if (i.key === null) continue;
      if (i.reason === INVALID_SLUG) refused.push(JSON.stringify(i.key));
      else if (i.action !== "skip" && storedSlug(i.key) !== i.key) {
        const fromName = storedSlug(i.key) === null ? " (from its name)" : "";
        renamed.push(`${JSON.stringify(i.key)} → "${i.resolvedSlug ?? i.key}"${fromName}`);
      }
    }
    const n = renamed.length;
    if (n > 0) {
      warnings.push(
        `${c.collection}: ${n} ${n === 1 ? "slug is" : "slugs are"} not URL-safe (a-z, 0-9, hyphens) and will be stored normalised — ${examples(renamed)}.`,
      );
    }
    const m = refused.length;
    if (m > 0) {
      warnings.push(`${c.collection}: ${m} ${m === 1 ? "row has" : "rows have"} no URL-safe slug and will be skipped — ${examples(refused)}.`);
    }
  }
  if (orphaned.length > 0) {
    const o = orphaned.length;
    const variants = lostWith(content.variants);
    const gallery = lostWith(content.productMedia);
    const riders =
      variants + gallery > 0
        ? `, with ${variants} ${variants === 1 ? "variant" : "variants"} and ${gallery} ${gallery === 1 ? "gallery link" : "gallery links"}`
        : "";
    warnings.push(
      `products: ${o} ${o === 1 ? "row is" : "rows are"} in a skipped category and will be skipped too${riders} — ${examples(orphaned.map((k) => JSON.stringify(k)))}.`,
    );
  }
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
    riders: { variants: riding(content.variants), productMedia: riding(content.productMedia) },
    media,
    designRef: { ...manifest.designRef, installed },
    countChecks,
    warnings,
    totals,
  };
}
