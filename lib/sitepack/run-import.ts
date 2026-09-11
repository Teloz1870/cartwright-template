import type { OpenedPack } from "@/lib/sitepack/import-open";
import { parseSitePackContent } from "@/lib/sitepack/import-parse";
import { buildImportPlan, type ExistingState, type ImportPlan, type SlugCollection } from "@/lib/sitepack/import-plan";
import {
  toPageCreate,
  toCategoryCreate,
  toServiceCreate,
  toPostCreate,
  toProductCreate,
  toVariantCreate,
  toProductMediaCreate,
  type UrlRemap,
} from "@/lib/sitepack/apply-map";

/**
 * SitePack import ORCHESTRATION — wires the proven pure layers (parse/sanitize →
 * plan → apply-map) to the engine's side effects, which are INJECTED so the whole
 * sequence is unit-testable without prisma / Blob / the network. The
 * `sitepack.import` tool supplies the real `ImportDeps` (prisma writes, Blob
 * store, snapshot-via-runExport, applyComposition); this module owns the ORDER and
 * the relinking that a correct restore depends on.
 *
 * Precondition: the caller already ran `openCartpack` + `compatGate` (this never
 * re-checks integrity/compat). Sequence:
 *   1. parse + sanitize the entries; gather the engine's existing natural keys.
 *   2. build the dry-run plan (the SAME object the wizard confirmed) — its
 *      resolved slugs/skus ARE what we create under (non-destructive).
 *   3. snapshot the current site FIRST (the undo point) before any write.
 *   4. media FIRST → a sha256 → new-assetId map (hero/gallery FK relink). NOTE:
 *      the pack carries NO old URLs (url is never serialized), so legacy
 *      heroImage/images URL STRINGS can't be remapped in P0 — `urlRemap` is empty
 *      and images render via the FK relink (heroImageAssetId / ProductMedia.assetId).
 *      Carrying old URLs to remap the legacy strings is a P1 follow-up.
 *   5. create in DEPENDENCY ORDER, capturing fresh ids to relink children:
 *      categories → products (→ variants, productMedia) → pages → services → posts.
 *      A child whose parent/asset didn't resolve is SKIPPED + counted (never a
 *      dangling FK). Plan items are 1:1 with content rows (by index).
 *   6. applyComposition(look) — the verbatim, audited no-code design apply path.
 *
 * Branding/integration are intentionally NOT applied here (identity + secrets are
 * a policy call for the tool/wizard — a fresh `create-cartwright --from` wants the
 * branding; an additive restore onto a live site does not). createRow failures
 * propagate (fail-fast) — the snapshot is the undo.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export type ImportModel = "category" | "product" | "variant" | "productMedia" | "page" | "service" | "post";

export type ImportDeps = {
  /** existing natural keys + capability sets, for the plan. */
  gatherExisting: () => Promise<ExistingState>;
  /** snapshot the CURRENT site as an undo .cartpack BEFORE any write; id/label or null. */
  snapshot: () => Promise<string | null>;
  /** dedup-or-create one bundled asset (fetch+store the blob if new); the new/existing assetId, or null. */
  storeMedia: (mediaRow: Row, blob: Buffer | null) => Promise<string | null>;
  /** create one row in `model`; returns the new id. Failures propagate (snapshot = undo). */
  createRow: (model: ImportModel, data: Record<string, unknown>) => Promise<string>;
  /** apply the composition look verbatim (the only audited no-code design path). */
  applyComposition: (compositionJson: string) => Promise<void>;
};

export type ImportResult = {
  plan: ImportPlan;
  snapshotId: string | null;
  created: Record<string, number>;
  skipped: Record<string, number>;
  /** unique media assets resolved (newly stored OR deduped to an existing asset). */
  mediaStored: number;
  mediaFailed: number;
  appliedComposition: boolean;
};

const bump = (rec: Record<string, number>, key: string): void => {
  rec[key] = (rec[key] ?? 0) + 1;
};

/** Index media blobs by content hash in ONE pass (`media/blobs/<sha>.<ext>` → bytes)
 *  so each asset is an O(1) lookup, not an O(entries) prefix scan per asset. */
function indexBlobs(entries: Map<string, Buffer>): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const dir = "media/blobs/";
  for (const [path, bytes] of entries) {
    if (path.startsWith(dir)) {
      const sha = path.slice(dir.length).split(".")[0]; // sha is bare-hex (no dots)
      if (sha) out.set(sha, bytes);
    }
  }
  return out;
}

export async function runImport(opened: OpenedPack, deps: ImportDeps): Promise<ImportResult> {
  const content = await parseSitePackContent(opened.entries);
  const existing = await deps.gatherExisting();
  const plan = buildImportPlan(opened.manifest, content, existing);

  const snapshotId = await deps.snapshot(); // undo point — BEFORE any write

  const created: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const urlRemap: UrlRemap = new Map(); // P0: no old URLs in the pack → FK relink only

  // ── 1. Media → sha256 → new assetId (hero/gallery FK relink) ──────────────────
  const blobBySha = indexBlobs(opened.entries);
  const assetIdBySha = new Map<string, string>();
  let mediaStored = 0;
  let mediaFailed = 0;
  for (const m of content.media) {
    const sha = str(m.sha256);
    if (!sha) {
      mediaFailed++;
      continue;
    }
    if (assetIdBySha.has(sha)) continue; // same asset listed twice → store once
    const assetId = await deps.storeMedia(m, blobBySha.get(sha) ?? null);
    if (!assetId) {
      mediaFailed++;
      continue;
    }
    assetIdBySha.set(sha, assetId);
    mediaStored++;
  }
  const assetOf = (sha: unknown): string | null => {
    const s = str(sha);
    return s ? (assetIdBySha.get(s) ?? null) : null;
  };

  const itemsOf = (c: SlugCollection) => plan.collections.find((x) => x.collection === c)!.items;

  // ── 2. Categories (parents of products) ──────────────────────────────────────
  const categoryIdBySlug = new Map<string, string>(); // ORIGINAL slug → new id
  const catItems = itemsOf("categories");
  for (let i = 0; i < content.categories.length; i++) {
    const item = catItems[i];
    if (item.action === "skip" || !item.key) {
      bump(skipped, "categories");
      continue;
    }
    const row = content.categories[i];
    const data = toCategoryCreate(row, {
      slug: item.resolvedSlug ?? item.key,
      heroImageAssetId: assetOf(row.heroImageSha256),
      heroVideoAssetId: assetOf(row.heroVideoSha256),
      urlRemap,
    });
    const newId = await deps.createRow("category", data);
    // Keep-FIRST: a source DB has unique slugs, but a malformed pack could carry
    // two categories with the same original slug (the 2nd created suffixed). The
    // original slug must resolve to the FIRST (which kept it) so products relink
    // deterministically — never the last-created (silent mislink).
    if (!categoryIdBySlug.has(item.key)) categoryIdBySlug.set(item.key, newId);
    bump(created, "categories");
  }

  // ── 3. Products → variants + product-media ───────────────────────────────────
  const productIdBySlug = new Map<string, string>(); // ORIGINAL slug → new id
  const prodItems = itemsOf("products");
  for (let i = 0; i < content.products.length; i++) {
    const item = prodItems[i];
    if (item.action === "skip" || !item.key) {
      bump(skipped, "products");
      continue;
    }
    const row = content.products[i];
    const categorySlug = str(row.categorySlug);
    const categoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : undefined;
    if (!categoryId) {
      bump(skipped, "products"); // orphan — categoryId is a required FK
      continue;
    }
    const data = toProductCreate(row, {
      slug: item.resolvedSlug ?? item.key,
      sku: item.resolvedSku ?? str(row.sku), // resolved sku if it collided, else original
      categoryId,
      urlRemap,
    });
    const newId = await deps.createRow("product", data);
    if (!productIdBySlug.has(item.key)) productIdBySlug.set(item.key, newId); // keep-first (see categories)
    bump(created, "products");
  }

  // Variants + ProductMedia ride free under the fresh parent (relink by natural key).
  for (const v of content.variants) {
    const productId = productIdBySlug.get(str(v.productSlug) ?? "");
    if (!productId) {
      bump(skipped, "variants");
      continue;
    }
    await deps.createRow("variant", toVariantCreate(v, { productId }));
    bump(created, "variants");
  }
  for (const pm of content.productMedia) {
    const productId = productIdBySlug.get(str(pm.productSlug) ?? "");
    const assetId = assetOf(pm.assetSha256);
    if (!productId || !assetId) {
      bump(skipped, "productMedia");
      continue;
    }
    await deps.createRow("productMedia", toProductMediaCreate(pm, { productId, assetId }));
    bump(created, "productMedia");
  }

  // ── 4. Independent content: pages, services, posts ───────────────────────────
  const pageItems = itemsOf("pages");
  for (let i = 0; i < content.pages.length; i++) {
    const item = pageItems[i];
    if (item.action === "skip" || !item.key) {
      bump(skipped, "pages");
      continue;
    }
    const row = content.pages[i];
    await deps.createRow("page", toPageCreate(row, { slug: item.resolvedSlug ?? item.key, heroImageAssetId: assetOf(row.heroImageSha256), urlRemap }));
    bump(created, "pages");
  }
  const svcItems = itemsOf("services");
  for (let i = 0; i < content.services.length; i++) {
    const item = svcItems[i];
    if (item.action === "skip" || !item.key) {
      bump(skipped, "services");
      continue;
    }
    const row = content.services[i];
    await deps.createRow("service", toServiceCreate(row, { slug: item.resolvedSlug ?? item.key, heroImageAssetId: assetOf(row.heroImageSha256), urlRemap }));
    bump(created, "services");
  }
  const postItems = itemsOf("posts");
  for (let i = 0; i < content.posts.length; i++) {
    const item = postItems[i];
    if (item.action === "skip" || !item.key) {
      bump(skipped, "posts");
      continue;
    }
    const row = content.posts[i];
    await deps.createRow("post", toPostCreate(row, { slug: item.resolvedSlug ?? item.key, urlRemap }));
    bump(created, "posts");
  }

  // ── 5. The look (verbatim composition apply) ─────────────────────────────────
  const compositionJson = opened.entries.get("look/composition.json")?.toString("utf8");
  let appliedComposition = false;
  if (compositionJson) {
    await deps.applyComposition(compositionJson);
    appliedComposition = true;
  }

  return { plan, snapshotId, created, skipped, mediaStored, mediaFailed, appliedComposition };
}
