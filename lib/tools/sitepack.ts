import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { brand } from "@/brand.config";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { prisma } from "@/lib/db";
import { resolveStoreIdentity } from "@/lib/brand";
import { exportComposition } from "@/lib/compositions/export";
import { getPluginStates } from "@/lib/plugins/install";
import { readReleaseMarker } from "@/lib/sitepack/release";
import { runExport, type ExportData, type ExportReport } from "@/lib/sitepack/run-export";
import type { ExportMeta } from "@/lib/sitepack/export";
import { put } from "@vercel/blob";
import type { Prisma } from "@/app/generated/prisma/client";
import { findOrCreateBySha256, computeSha256 } from "@/lib/media/asset";
import { applyComposition as applyCompositionLook } from "@/lib/compositions/apply";
import { DESIGN_OPTIONS } from "@/designs/options";
import { openCartpack, compatGate } from "@/lib/sitepack/import-open";
import { parseSitePackContent } from "@/lib/sitepack/import-parse";
import { buildImportPlan, type ExistingState } from "@/lib/sitepack/import-plan";
import { runImport, type ImportModel } from "@/lib/sitepack/run-import";
import { CONTENT_SCHEMA_VERSION } from "@/lib/sitepack/spec";

/**
 * sitepack.export — snapshot the whole site to a portable `.cartpack` (ultraplan
 * §4). The thin impure shell over the proven pure pipeline (gather → assemble):
 * reads the owner-authored content + media from prisma/Blob, the composition look,
 * plugins + release marker, then calls runExport. Returns the `.cartpack` as
 * base64 + an export report. Read-only (settings:read), audited, default-off
 * behind the `sitePack` flag, never customer/voice-reachable.
 */

type Row = Record<string, unknown>;

/** The asset ids the content actually references (heroes + product galleries). */
export function collectReferencedAssetIds(input: { pages: Row[]; categories: Row[]; services: Row[]; productMedia: Row[] }): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v !== "") ids.add(v);
  };
  input.pages.forEach((p) => add(p.heroImageAssetId));
  input.categories.forEach((c) => {
    add(c.heroImageAssetId);
    add(c.heroVideoAssetId);
  });
  input.services.forEach((s) => add(s.heroImageAssetId));
  input.productMedia.forEach((m) => add(m.assetId));
  return [...ids];
}

/** A SitePack id stable across re-exports of the SAME site (so a registry can
 *  dedup/version) — derived from the store identity, no schema column needed. */
export function stableSitePackId(storeName: string, domain: string): string {
  return `sp-${createHash("sha256").update(`${storeName}|${domain}`).digest("hex").slice(0, 20)}`;
}

/** The git HEAD sha for exporter.gitRef (the honest source-checkout identity).
 *  Vercel deploys set the env; a dev tree has none → the marker's ref carries it. */
function gitHeadRef(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";
}

/** Stream an asset's bytes from its OWN trusted Blob URL (not safe-fetch — this is
 *  our row, our origin). Timeout + size cap so one hung/huge blob can't pin export. */
async function fetchAssetBytes(asset: Row, maxBytes = 12_000_000, timeoutMs = 20_000): Promise<Buffer | null> {
  const url = asset.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    if (len && Number(len) > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const exportInput = z.object({
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

/**
 * Gather the LIVE site → a `.cartpack` — the shared core of `sitepack.export` AND
 * the import tool's undo snapshot. No flag check / no audit here: each caller owns
 * its own gating (the export tool, and the import handler before it snapshots).
 */
async function exportLiveSite(): Promise<{ cartpack: Buffer; report: ExportReport; designSlug: string; name: string }> {
  // No `select` → all scalar columns (retains the FKs gather resolves against +
  // the full branding/integration rows the positive-allowlist redactors need).
  const [pages, categories, services, posts, products, variants, productMedia, branding, integration, composition, plugins] =
    await Promise.all([
      prisma.page.findMany(),
      prisma.category.findMany(),
      prisma.service.findMany(),
      prisma.post.findMany(),
      prisma.product.findMany({ where: { deletedAt: null } }),
      // Only child rows of LIVE products (else an orphan variant/media of a
      // soft-deleted product would resolve productSlug:null in the pack).
      prisma.productVariant.findMany({ where: { product: { deletedAt: null } } }),
      prisma.productMedia.findMany({ where: { product: { deletedAt: null } } }),
      prisma.brandingSettings.findFirst(),
      prisma.integrationSettings.findFirst(),
      exportComposition(),
      getPluginStates(),
    ]);

  const asRows = (v: unknown): Row[] => v as unknown as Row[];
  const brandingRow = (branding ?? {}) as unknown as Row;
  const referencedIds = collectReferencedAssetIds({
    pages: asRows(pages),
    categories: asRows(categories),
    services: asRows(services),
    productMedia: asRows(productMedia),
  });
  const mediaAssets = referencedIds.length
    ? asRows(await prisma.mediaAsset.findMany({ where: { id: { in: referencedIds } } }))
    : [];

  const marker = readReleaseMarker();
  const storeName = (typeof brandingRow.storeName === "string" && brandingRow.storeName) || brand.storeName;
  // Take the skin the COMPOSITION resolved → designRef.slug provably equals the
  // embedded look's skin (one source of truth), falling back to the direct
  // identity resolution if the composition didn't carry one.
  const composedSkin = (composition as { skin?: string }).skin;
  const designSlug = (typeof composedSkin === "string" && composedSkin) || resolveStoreIdentity(branding).designSlug;

  const meta: ExportMeta = {
    id: stableSitePackId(storeName, brand.domain ?? ""),
    name: storeName || "Cartwright site",
    createdAt: new Date().toISOString(),
    exporter: {
      version: marker.version,
      channel: marker.channel,
      commit: marker.commit || gitHeadRef(),
      gitRef: gitHeadRef() || marker.ref,
    },
    mode: brand.mode,
    defaultLocale: brand.defaultLocale,
    locales: [...brand.locales],
    designRef: { slug: designSlug, kind: "data" },
    pluginsRequired: plugins.filter((p) => p.enabled).map((p) => p.slug),
    featuresRequested: Object.entries(brand.features as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k),
    featuresRequired: brand.mode === "webshop" ? ["webshop"] : [],
    containsCode: false, // P0: built-in data-designs only
  };

  const data: ExportData = {
    pages: asRows(pages),
    categories: asRows(categories),
    services: asRows(services),
    posts: asRows(posts),
    products: asRows(products),
    variants: asRows(variants),
    productMedia: asRows(productMedia),
    mediaAssets,
    branding: brandingRow,
    integration: (integration ?? {}) as unknown as Row,
    compositionJson: JSON.stringify(composition),
    fetchAssetBytes,
  };

  const { cartpack, report } = await runExport(data, meta);
  return { cartpack, report, designSlug, name: meta.name };
}

export const exportSite = defineTool({
  name: "sitepack.export",
  description:
    "Export this entire site (design + pages + products/services + content + media + branding) as a portable .cartpack that can be restored onto a newer Cartwright. Read-only; returns the pack as base64 + a report. Excludes orders/customers/keys/domain by design. Requires confirm: true.",
  scope: "settings:read",
  input: exportInput,
  examples: [{ name: "Export the whole site", body: { confirm: true } }],
  handler: async (args, ctx) => {
    // The .cartpack is captured OUT of the audited result — withAudit persists
    // `afterJson: safeStringify(result)`, and we must NOT write the whole exported
    // site (megabytes of base64) into the audit log. Only the report is logged.
    let cartpackBase64 = "";
    const summary = await withAudit(
      { actor: ctx.actor, tool: "sitepack.export", args, ip: ctx.ip, userAgent: ctx.userAgent, before: () => Promise.resolve(null) },
      async () => {
        // Default-off until the admin Snapshot/Restore UI ships (ultraplan §8).
        if (!(brand.features as { sitePack?: boolean }).sitePack) {
          throw new Error("SitePack is disabled. Enable the 'sitePack' feature flag (/admin/features) first.");
        }
        const { cartpack, report, designSlug, name } = await exportLiveSite();
        cartpackBase64 = cartpack.toString("base64"); // captured OUTSIDE the logged result
        return {
          name,
          filename: `${designSlug || "site"}.cartpack`,
          sizeBytes: report.sizeBytes,
          counts: report.counts,
          skippedProductMedia: report.skippedProductMedia,
          mediaFetchFailed: report.mediaFetchFailed,
        };
      },
    );
    // The audit log holds only `summary` (the report); the pack rides back to the
    // caller (the wizard downloads it) without ever touching afterJson.
    return { ...summary, cartpackBase64 };
  },
});

// ── sitepack.import ──────────────────────────────────────────────────────────
//
// The impure shell that wires REAL deps (prisma writes, Blob store, the export
// snapshot, applyComposition) into the proven pure orchestrator runImport. The
// pure cores (openCartpack/compatGate/parse/plan/apply-map/runImport) carry the
// correctness; this layer is the I/O + the WRITE gating (settings:write, confirm,
// audit, default-off sitePack flag, admin-only).
//
// TRANSACTION (P0): runImport is NOT wrapped in prisma.$transaction — it
// interleaves Blob I/O (storeMedia) and applyComposition's own prisma writes,
// neither of which can live inside a DB transaction. The undo SNAPSHOT (taken
// before any write) is the rollback mechanism; a mid-import failure leaves a
// partial restore the owner can revert by re-importing the returned snapshot.
// Media is content-addressed + deduped, so a retry never double-uploads.

const IMPORT_LIMITS = { maxTotalBytes: 500_000_000, maxEntries: 50_000, maxEntryBytes: 25_000_000 };

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
/** Informational blob extension from a mime (the bare-hex sha is the real address). */
export function extFor(mime: string): string {
  return MIME_EXT[mime] ?? "bin";
}

const sstr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const sint = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pure assembly of the existing-key snapshot from already-fetched rows + the
 *  capability lists — the testable core of gatherExisting. */
export function assembleExistingState(parts: {
  pages: { slug: string | null }[];
  categories: { slug: string | null }[];
  services: { slug: string | null }[];
  posts: { slug: string | null }[];
  products: { slug: string | null; sku: string | null }[];
  media: { sha256: string | null }[];
  installedDesigns: string[];
  installedPlugins: string[];
  enabledFeatures: string[];
}): ExistingState {
  const slugSet = (rows: { slug: string | null }[]) => new Set(rows.map((r) => r.slug).filter((s): s is string => !!s));
  return {
    pageSlugs: slugSet(parts.pages),
    categorySlugs: slugSet(parts.categories),
    serviceSlugs: slugSet(parts.services),
    postSlugs: slugSet(parts.posts),
    productSlugs: slugSet(parts.products),
    productSkus: new Set(parts.products.map((p) => p.sku).filter((s): s is string => !!s)),
    mediaSha256: new Set(parts.media.map((m) => m.sha256).filter((s): s is string => !!s)),
    installedDesigns: new Set(parts.installedDesigns),
    installedPlugins: new Set(parts.installedPlugins),
    enabledFeatures: new Set(parts.enabledFeatures),
  };
}

/** Existing natural keys + capabilities for the dry-run plan. Soft-deleted
 *  products are INCLUDED: Product.slug + Product.sku are plain @unique, so a
 *  soft-deleted (deletedAt-set) row STILL occupies its key in the DB index — the
 *  planner must SEE it to suffix around it, else createRow hits a P2002 unique
 *  violation. (Export filters deletedAt:null — but that's a different concern:
 *  don't ship deleted content. Collision-avoidance needs ALL occupied keys.) */
async function gatherExisting(): Promise<ExistingState> {
  const [pages, categories, services, posts, products, media, plugins] = await Promise.all([
    prisma.page.findMany({ select: { slug: true } }),
    prisma.category.findMany({ select: { slug: true } }),
    prisma.service.findMany({ select: { slug: true } }),
    prisma.post.findMany({ select: { slug: true } }),
    prisma.product.findMany({ select: { slug: true, sku: true } }), // incl. soft-deleted — keys still taken
    prisma.mediaAsset.findMany({ where: { sha256: { not: null } }, select: { sha256: true } }),
    getPluginStates(),
  ]);
  return assembleExistingState({
    pages,
    categories,
    services,
    posts,
    products,
    media,
    installedDesigns: DESIGN_OPTIONS.map((d) => d.slug),
    installedPlugins: plugins.filter((p) => p.enabled).map((p) => p.slug),
    enabledFeatures: Object.entries(brand.features as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  });
}

/** Dedup-or-create one MediaAsset by content hash. A dedup hit returns the
 *  existing asset id WITHOUT re-uploading or overwriting its (maybe hand-edited)
 *  metadata. A new asset is verified (the blob's bytes MUST hash to the claimed
 *  sha — a hostile pack can name a blob with a sha its bytes don't match), then
 *  uploaded + created + its carried metadata set. */
async function storeMediaAsset(mediaRow: Row, blob: Buffer | null, uploadedBy: string): Promise<string | null> {
  const sha = sstr(mediaRow.sha256);
  if (!sha) return null;
  const existing = await prisma.mediaAsset.findFirst({ where: { sha256: sha }, select: { id: true } });
  if (existing) return existing.id; // dedup — no re-upload, no metadata overwrite
  if (!blob) return null; // a new asset needs its bytes
  if (computeSha256(blob) !== sha) return null; // content-address mismatch → reject

  const mime = sstr(mediaRow.mime) ?? "application/octet-stream";
  const pathname = `sitepack/media/${sha}.${extFor(mime)}`;
  const uploaded = await put(pathname, blob, { access: "public", addRandomSuffix: false, contentType: mime });
  // A concurrent import of the same NEW sha can race past the dedup check above and
  // both reach create → the loser hits the sha256/blobPathname @unique and refetches.
  let asset: { id: string };
  try {
    asset = await findOrCreateBySha256({
      url: uploaded.url,
      mime,
      sizeBytes: sint(mediaRow.sizeBytes) ?? blob.byteLength,
      width: sint(mediaRow.width),
      height: sint(mediaRow.height),
      durationSec: sint(mediaRow.durationSec),
      blobPathname: pathname,
      sha256: sha,
      uploadedBy,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const won = await prisma.mediaAsset.findFirst({ where: { sha256: sha }, select: { id: true } });
      if (won) return won.id;
    }
    throw e;
  }
  // findOrCreateBySha256's params can't carry the metadata → set it on the fresh row.
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      altDa: sstr(mediaRow.altDa),
      altEn: sstr(mediaRow.altEn),
      title: sstr(mediaRow.title),
      caption: sstr(mediaRow.caption),
      geoSnippet: sstr(mediaRow.geoSnippet),
      dominantColors: sstr(mediaRow.dominantColors),
      suggestedSlug: sstr(mediaRow.suggestedSlug),
    },
  });
  return asset.id;
}

/** Create one row, mapping the ImportModel to its prisma delegate. NOTE: "variant"
 *  → productVariant; productMedia has a composite key (no id → returns ""). The
 *  apply-map data carries scalar FKs → the Unchecked create-input variant. */
export async function createRow(model: ImportModel, data: Record<string, unknown>): Promise<string> {
  switch (model) {
    case "category":
      return (await prisma.category.create({ data: data as Prisma.CategoryUncheckedCreateInput })).id;
    case "product":
      return (await prisma.product.create({ data: data as Prisma.ProductUncheckedCreateInput })).id;
    case "variant":
      return (await prisma.productVariant.create({ data: data as Prisma.ProductVariantUncheckedCreateInput })).id;
    case "productMedia":
      await prisma.productMedia.create({ data: data as Prisma.ProductMediaUncheckedCreateInput });
      return ""; // composite key — runImport ignores the productMedia return
    case "page":
      return (await prisma.page.create({ data: data as Prisma.PageUncheckedCreateInput })).id;
    case "service":
      return (await prisma.service.create({ data: data as Prisma.ServiceUncheckedCreateInput })).id;
    case "post":
      return (await prisma.post.create({ data: data as Prisma.PostUncheckedCreateInput })).id;
    default: {
      const _exhaustive: never = model; // compile-time guard if ImportModel grows
      return _exhaustive;
    }
  }
}

const importInput = z
  .object({
    cartpackBase64: z.string().min(1),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
    allowModeMismatch: z.boolean().optional(),
  })
  .refine((d) => d.dryRun === true || d.confirm === true, {
    message: "Requires confirm: true to apply (or dryRun: true to preview).",
  });

export const importSite = defineTool({
  name: "sitepack.import",
  description:
    "Restore a portable .cartpack onto THIS site. NON-destructive: a colliding slug/sku is created with a suffix (about → about-2), never overwriting. dryRun:true returns the plan (preview) without writing; confirm:true applies it after snapshotting the current site first (the snapshot rides back as base64 for undo). Pages/services/posts restore as drafts. Admin-only, behind the sitePack flag.",
  scope: "settings:write",
  input: importInput,
  examples: [
    { name: "Preview a restore", body: { cartpackBase64: "<base64 .cartpack>", dryRun: true } },
    { name: "Apply a restore", body: { cartpackBase64: "<base64 .cartpack>", confirm: true } },
  ],
  handler: async (args, ctx) => {
    if (!(brand.features as { sitePack?: boolean }).sitePack) {
      throw new Error("SitePack is disabled. Enable the 'sitePack' feature flag (/admin/features) first.");
    }
    // Security + compat gate FIRST (a hostile/incompatible pack never reaches the DB).
    const opened = openCartpack(Buffer.from(args.cartpackBase64, "base64"), IMPORT_LIMITS);
    const compat = compatGate(
      opened.manifest,
      { contentSchemaVersion: CONTENT_SCHEMA_VERSION, mode: brand.mode },
      { allowModeMismatch: args.allowModeMismatch },
    );
    if (!compat.ok) throw new Error(compat.reason);

    // Preview — read-only: the plan the wizard shows before the owner confirms.
    if (args.dryRun) {
      const content = await parseSitePackContent(opened.entries);
      const plan = buildImportPlan(opened.manifest, content, await gatherExisting());
      return { dryRun: true, name: opened.manifest.name, mode: opened.manifest.mode, plan };
    }

    // Validate the look's JSON SYNTAX up front: a corrupt look (bad JSON) means a
    // corrupt pack → reject BEFORE any write. (A schema-incompatible-but-valid look
    // — e.g. an un-installed skin — still imports content + DEGRADES, see below.)
    const compositionRaw = opened.entries.get("look/composition.json")?.toString("utf8");
    if (compositionRaw) {
      try {
        JSON.parse(compositionRaw);
      } catch {
        throw new Error("SitePack: look/composition.json is not valid JSON — the pack is corrupt.");
      }
    }

    // Apply. The undo SNAPSHOT + the outcome ALWAYS ride back (even on a mid-import
    // failure: the snapshot is the only undo, so the caller must receive it).
    let snapshotBase64 = "";
    let compositionError: string | null = null;
    const outcome = await withAudit(
      {
        actor: ctx.actor,
        tool: "sitepack.import",
        // NOT the megabyte base64 — only the identity + the mode-override flag.
        args: { name: opened.manifest.name, mode: opened.manifest.mode, allowModeMismatch: args.allowModeMismatch ?? false },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => Promise.resolve(null),
      },
      async () => {
        try {
          const result = await runImport(opened, {
            gatherExisting,
            snapshot: async () => {
              const snap = await exportLiveSite();
              snapshotBase64 = snap.cartpack.toString("base64"); // captured OUTSIDE the logged result
              return `pre-import-${opened.manifest.id}`;
            },
            storeMedia: (row, blob) => storeMediaAsset(row, blob, ctx.actor),
            createRow,
            applyComposition: async (json) => {
              // Best-effort look: a foreign/incompatible composition (e.g. an
              // un-installed skin) DEGRADES — content survives + a warning — never
              // aborts the restore. JSON syntax was validated above, so no throw here.
              const r = await applyCompositionLook(JSON.parse(json), {}, ctx.actor);
              if (!r.ok) compositionError = r.error;
            },
          });
          return {
            ok: true as const,
            name: opened.manifest.name,
            created: result.created,
            skipped: result.skipped,
            mediaStored: result.mediaStored,
            mediaFailed: result.mediaFailed,
            appliedComposition: result.appliedComposition && !compositionError,
            snapshotId: result.snapshotId,
            warnings: compositionError ? [...result.plan.warnings, `Look not applied: ${compositionError}`] : result.plan.warnings,
          };
        } catch (e) {
          // A genuine write failure mid-restore. The snapshot (taken first) is the
          // undo — surface it + the error so the wizard can offer a rollback.
          return { ok: false as const, name: opened.manifest.name, error: e instanceof Error ? e.message : String(e) };
        }
      },
    );
    return { ...outcome, snapshotBase64 };
  },
});

export const sitepackTools = [exportSite, importSite];
