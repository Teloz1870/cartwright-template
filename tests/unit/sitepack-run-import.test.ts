import { describe, expect, it } from "vitest";

import { assembleCartpack, type GatheredSite, type ExportMeta } from "@/lib/sitepack/export";
import { openCartpack } from "@/lib/sitepack/import-open";
import { runImport, type ImportDeps, type ImportModel } from "@/lib/sitepack/run-import";
import type { ExistingState } from "@/lib/sitepack/import-plan";

/**
 * SitePack import ORCHESTRATION — proven against a REAL pack (assembleCartpack →
 * openCartpack) with recording FAKE deps, so the dependency ordering, id capture +
 * relink (category→product→variant/productMedia, hero asset FK), the plan's
 * collision-resolved slug, snapshot-before-write, and the counts are all asserted
 * without prisma / Blob.
 */

const LIMITS = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };
const SHA = "aaaaaa01"; // bare-hex content address of the one bundled asset
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

function gathered(): GatheredSite {
  return {
    pages: [
      { row: { slug: "about", title: "About", body: "b", status: "published" }, heroImageSha256: null },
      { row: { slug: "home", title: "Home", body: "b", status: "published" }, heroImageSha256: null },
    ],
    categories: [{ row: { name: "Fences", slug: "fences" }, heroImageSha256: SHA, heroVideoSha256: null }],
    services: [{ row: { slug: "install", title: "Install", body: "b" }, heroImageSha256: null }],
    posts: [{ slug: "news", title: "News", body: "b", status: "published" }],
    products: [
      { row: { sku: "PANEL-1", name: "Panel", slug: "panel", description: "d", priceDkk: 49900, stock: 3, images: '["/a.jpg"]' }, categorySlug: "fences" },
    ],
    variants: [{ row: { sku: "panel-grey", priceDkk: 52900, stock: 2, attributes: { color: "grey" } }, productSlug: "panel" }],
    productMedia: [{ row: { position: 0, role: "gallery" }, productSlug: "panel", assetSha256: SHA }],
    media: [{ row: { mime: "image/webp", sizeBytes: WEBP.length, altEn: "fence" }, sha256: SHA, bytes: WEBP }],
    branding: { storeName: "Aluzaun" },
    integration: { aiProvider: "anthropic" },
    compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
  };
}

/** A malformed pack with TWO categories + TWO products sharing an original slug
 *  (a real DB can't produce this — unique slugs — but a crafted pack can). */
function dupGathered(): GatheredSite {
  return {
    pages: [],
    services: [],
    posts: [],
    categories: [
      { row: { name: "F1", slug: "fences" }, heroImageSha256: null, heroVideoSha256: null },
      { row: { name: "F2", slug: "fences" }, heroImageSha256: null, heroVideoSha256: null },
    ],
    products: [
      { row: { name: "P1", slug: "panel", description: "d", priceDkk: 1, stock: 1, images: "[]" }, categorySlug: "fences" },
      { row: { name: "P2", slug: "panel", description: "d", priceDkk: 1, stock: 1, images: "[]" }, categorySlug: "fences" },
    ],
    variants: [{ row: { sku: "v1", priceDkk: 1, stock: 1, attributes: {} }, productSlug: "panel" }],
    productMedia: [],
    media: [],
    branding: { storeName: "Aluzaun" },
    integration: { aiProvider: "anthropic" },
    compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
  };
}

const META: ExportMeta = {
  id: "01J8ABCDEF",
  name: "Aluzaun",
  createdAt: "2026-06-14T00:00:00Z",
  exporter: { version: "0.0.0-source", channel: "source", ref: "source" } as ExportMeta["exporter"],
  mode: "webshop",
  defaultLocale: "da",
  locales: ["da"],
  designRef: { slug: "aurora-shop", kind: "data" },
};

const emptyExisting = (over: Partial<ExistingState> = {}): ExistingState => ({
  pageSlugs: new Set(),
  categorySlugs: new Set(),
  serviceSlugs: new Set(),
  postSlugs: new Set(),
  productSlugs: new Set(),
  productSkus: new Set(),
  mediaSha256: new Set(),
  ...over,
});

type CreateCall = { model: ImportModel; data: Record<string, unknown>; id: string };

/** Recording fake deps. `order` captures the side-effect sequence; `creates` the rows. */
function makeDeps(over: Partial<ImportDeps> = {}, existing?: ExistingState) {
  const order: string[] = [];
  const creates: CreateCall[] = [];
  let n = 0;
  const deps: ImportDeps = {
    gatherExisting: async () => existing ?? emptyExisting(),
    snapshot: async () => {
      order.push("snapshot");
      return "snap_1";
    },
    storeMedia: async (row) => {
      order.push(`media:${row.sha256 as string}`);
      return `asset_${row.sha256 as string}`;
    },
    createRow: async (model, data) => {
      const id = `${model}_${++n}`;
      order.push(`create:${model}`);
      creates.push({ model, data, id });
      return id;
    },
    applyComposition: async () => {
      order.push("composition");
    },
    ...over,
  };
  return { deps, order, creates };
}

const find = (creates: CreateCall[], model: ImportModel, pred: (d: Record<string, unknown>) => boolean) =>
  creates.find((c) => c.model === model && pred(c.data));

describe("runImport — happy path against a real pack", () => {
  it("snapshots first, stores media, then creates in dependency order, ending with the look", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps, order } = makeDeps();
    await runImport(opened, deps);

    expect(order[0]).toBe("snapshot");
    expect(order.indexOf(`media:${SHA}`)).toBeLessThan(order.indexOf("create:category"));
    expect(order.indexOf("create:category")).toBeLessThan(order.indexOf("create:product"));
    expect(order.indexOf("create:product")).toBeLessThan(order.indexOf("create:variant"));
    expect(order.indexOf("create:product")).toBeLessThan(order.indexOf("create:productMedia"));
    expect(order[order.length - 1]).toBe("composition");
  });

  it("relinks children to fresh parent ids and the hero asset by sha", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps, creates } = makeDeps();
    await runImport(opened, deps);

    const category = find(creates, "category", () => true)!;
    const product = find(creates, "product", () => true)!;
    expect(product.data.categoryId).toBe(category.id); // product → fresh category id
    expect(find(creates, "variant", () => true)!.data.productId).toBe(product.id);
    const pm = find(creates, "productMedia", () => true)!;
    expect(pm.data.productId).toBe(product.id);
    expect(pm.data.assetId).toBe(`asset_${SHA}`); // gallery → stored asset id
    expect(category.data.heroImageAssetId).toBe(`asset_${SHA}`); // hero FK relink
  });

  it("creates a colliding page under the plan's suffixed slug (non-destructive)", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps, creates } = makeDeps({}, emptyExisting({ pageSlugs: new Set(["about"]) }));
    await runImport(opened, deps);

    expect(find(creates, "page", (d) => d.slug === "about-2")).toBeTruthy(); // about → about-2
    expect(find(creates, "page", (d) => d.slug === "home")).toBeTruthy();
  });

  it("reports accurate counts, snapshot id, media stored, and applied look", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps } = makeDeps();
    const result = await runImport(opened, deps);

    expect(result.created).toMatchObject({ categories: 1, products: 1, variants: 1, productMedia: 1, pages: 2, services: 1, posts: 1 });
    expect(result).toMatchObject({ snapshotId: "snap_1", mediaStored: 1, mediaFailed: 0, appliedComposition: true });
    expect(result.plan.collections.length).toBeGreaterThan(0);
  });
});

describe("runImport — degrade (no dangling FK)", () => {
  it("when storeMedia fails, skips the gallery row and omits the hero asset, counts the failure", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps, creates } = makeDeps({ storeMedia: async () => null });
    const result = await runImport(opened, deps);

    expect(result.mediaStored).toBe(0);
    expect(result.mediaFailed).toBe(1);
    expect(result.skipped.productMedia).toBe(1); // no assetId → never a dangling FK
    expect(find(creates, "productMedia", () => true)).toBeUndefined();
    expect("heroImageAssetId" in find(creates, "category", () => true)!.data).toBe(false); // hero omitted
    expect(result.created.products).toBe(1); // the product itself still imports
  });

  it("skips a product whose category did not import (orphan FK)", async () => {
    const g = gathered();
    g.products[0].categorySlug = "ghost"; // points at no imported category
    const opened = openCartpack(assembleCartpack(g, META), LIMITS);
    const { deps, creates } = makeDeps();
    const result = await runImport(opened, deps);

    expect(result.skipped.products).toBe(1);
    expect(result.created.products ?? 0).toBe(0);
    expect(find(creates, "variant", () => true)).toBeUndefined(); // its variant has no parent → skipped
    expect(result.skipped.variants).toBe(1);
  });
});

describe("runImport — relink robustness + edge cases", () => {
  it("keep-first: two same-original-slug parents → children link to the FIRST, both created", async () => {
    const opened = openCartpack(assembleCartpack(dupGathered(), META), LIMITS);
    const { deps, creates } = makeDeps();
    const result = await runImport(opened, deps);

    const firstCat = find(creates, "category", (d) => d.slug === "fences")!;
    expect(find(creates, "category", (d) => d.slug === "fences-2")).toBeTruthy(); // both categories created
    const prodCreates = creates.filter((c) => c.model === "product");
    expect(prodCreates).toHaveLength(2);
    for (const p of prodCreates) expect(p.data.categoryId).toBe(firstCat.id); // both link to the FIRST 'fences'
    const firstProd = find(creates, "product", (d) => d.slug === "panel")!;
    expect(find(creates, "variant", () => true)!.data.productId).toBe(firstProd.id); // variant → FIRST 'panel'
    expect(result.created).toMatchObject({ categories: 2, products: 2, variants: 1 });
  });

  it("creates a product under the plan's resolved slug+sku, children follow the fresh id", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps, creates } = makeDeps({}, emptyExisting({ productSlugs: new Set(["panel"]), productSkus: new Set(["PANEL-1"]) }));
    await runImport(opened, deps);

    const product = find(creates, "product", () => true)!;
    expect(product.data.slug).toBe("panel-2");
    expect(product.data.sku).toBe("PANEL-1-2");
    expect(find(creates, "variant", () => true)!.data.productId).toBe(product.id);
    expect(find(creates, "productMedia", () => true)!.data.productId).toBe(product.id);
  });

  it("skips the look when the pack carries no composition.json", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    opened.entries.delete("look/composition.json");
    let applied = false;
    const { deps } = makeDeps({
      applyComposition: async () => {
        applied = true;
      },
    });
    const result = await runImport(opened, deps);
    expect(result.appliedComposition).toBe(false);
    expect(applied).toBe(false);
  });

  it("propagates a createRow failure (fail-fast; the snapshot is the undo point)", async () => {
    const opened = openCartpack(assembleCartpack(gathered(), META), LIMITS);
    const { deps } = makeDeps({
      createRow: async () => {
        throw new Error("DB down");
      },
    });
    await expect(runImport(opened, deps)).rejects.toThrow(/DB down/);
  });
});
