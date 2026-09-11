import { describe, expect, it } from "vitest";

import {
  remapImagesJson,
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
 * SitePack import — the pure APPLY MAPPERS. Each turns a sanitized serialized row +
 * the impure layer's resolved refs into the `data` for prisma.create. These tests
 * pin the load-bearing contracts: DRAFT-on-restore, natural-key/relation injection,
 * URL remap, String-JSON passthrough, required-scalar fallback, omit-when-absent.
 */

const REMAP: UrlRemap = new Map([
  ["/old-hero.jpg", "https://blob.test/new-hero.jpg"],
  ["/a.jpg", "https://blob.test/a.jpg"],
]);

describe("remapImagesJson", () => {
  it("remaps each known URL and re-stringifies the array", () => {
    expect(remapImagesJson('["/a.jpg","/keep.jpg"]', REMAP)).toBe('["https://blob.test/a.jpg","/keep.jpg"]');
  });
  it("returns '[]' for null / non-array / malformed", () => {
    expect(remapImagesJson(null, REMAP)).toBe("[]");
    expect(remapImagesJson('{"not":"array"}', REMAP)).toBe("[]");
    expect(remapImagesJson("{not json", REMAP)).toBe("[]");
  });
  it("drops non-string array elements (string[] gallery contract)", () => {
    expect(remapImagesJson('["/a.jpg",42,null,{"x":1}]', REMAP)).toBe('["https://blob.test/a.jpg"]');
  });
});

describe("toPageCreate", () => {
  it("forces draft status, remaps hero, injects the hero asset id, drops portable/instance refs", () => {
    const data = toPageCreate(
      { id: "pg_old", title: "About", body: "## hi", heroImage: "/old-hero.jpg", heroImageSha256: "shaaa", deletedAt: "2026-01-01", vibeHtml: "<p>x</p>", translations: { en: { title: "About" } } },
      { slug: "about-2", heroImageAssetId: "asset_new", urlRemap: REMAP },
    );
    expect(data).toMatchObject({
      slug: "about-2",
      title: "About",
      body: "## hi",
      status: "draft",
      heroImage: "https://blob.test/new-hero.jpg",
      heroImageAssetId: "asset_new",
      vibeHtml: "<p>x</p>",
      translations: { en: { title: "About" } },
    });
    // Exact key set — locks against ANY rogue-key leak (e.g. a `...row` refactor
    // would smuggle id/heroImageSha256/deletedAt straight into prisma.create).
    expect(Object.keys(data).sort()).toEqual(
      ["slug", "title", "body", "showInNav", "status", "heroImage", "heroImageAssetId", "vibeHtml", "translations"].sort(),
    );
  });

  it("falls back title→slug, body→'' and OMITS absent optionals", () => {
    const data = toPageCreate({}, { slug: "blank", urlRemap: REMAP });
    expect(data).toMatchObject({ slug: "blank", title: "blank", body: "", status: "draft" });
    expect("heroImage" in data).toBe(false);
    expect("heroImageAssetId" in data).toBe(false); // no asset → omitted, not null
    expect("vibeHtml" in data).toBe(false);
    expect("translations" in data).toBe(false);
  });
});

describe("toProductCreate", () => {
  it("remaps images, injects categoryId + resolved sku, passes String-JSON + Json fields through", () => {
    const data = toProductCreate(
      {
        name: "Gate",
        description: "d",
        priceDkk: 49900,
        stock: 3,
        images: '["/a.jpg"]',
        faq: '[{"q":"?","a":"!"}]',
        attributes: { color: "grey" },
        sku: "GATE-1",
        id: "prod_old", // instance ids must NOT be carried
        categorySlug: "fences", // export-only natural key, not a column
        supplierId: "supp_old", // deferred — must NOT be carried
        deletedAt: "2026-01-01",
      },
      { slug: "gate-2", sku: "GATE-1-2", categoryId: "cat_new", urlRemap: REMAP },
    );
    expect(data).toMatchObject({
      name: "Gate",
      slug: "gate-2",
      priceDkk: 49900,
      stock: 3,
      images: '["https://blob.test/a.jpg"]',
      categoryId: "cat_new",
      sku: "GATE-1-2",
      faq: '[{"q":"?","a":"!"}]', // TEXT column → verbatim
      attributes: { color: "grey" },
    });
    // Exact key set — no id/categorySlug/supplierId/deletedAt/status leak.
    expect(Object.keys(data).sort()).toEqual(
      ["name", "slug", "description", "priceDkk", "stock", "featured", "images", "categoryId", "sku", "faq", "attributes"].sort(),
    );
  });

  it("defaults required scalars and a null sku is omitted", () => {
    const data = toProductCreate({}, { slug: "x", sku: null, categoryId: "cat", urlRemap: REMAP });
    expect(data).toMatchObject({ name: "x", slug: "x", description: "", priceDkk: 0, stock: 0, featured: false, images: "[]", categoryId: "cat" });
    expect("sku" in data).toBe(false); // null sku omitted (column nullable)
  });
});

describe("toServiceCreate / toPostCreate (status-bearing)", () => {
  it("service forces draft + remaps hero + injects hero asset", () => {
    const data = toServiceCreate({ title: "Install", body: "b", heroImage: "/old-hero.jpg" }, { slug: "install", heroImageAssetId: "a1", urlRemap: REMAP });
    expect(data).toMatchObject({ slug: "install", status: "draft", heroImage: "https://blob.test/new-hero.jpg", heroImageAssetId: "a1" });
    expect(Object.keys(data).sort()).toEqual(["slug", "title", "body", "showInNav", "status", "heroImage", "heroImageAssetId"].sort());
  });

  it("service falls back title→slug, body→'' on an empty row (required scalars)", () => {
    const data = toServiceCreate({}, { slug: "svc", urlRemap: REMAP });
    expect(data).toMatchObject({ slug: "svc", title: "svc", body: "", status: "draft" });
  });

  it("post forces draft, carries tags verbatim (TEXT), remaps coverImage, omits publishedAt", () => {
    const data = toPostCreate({ title: "News", body: "b", tags: '["a","b"]', coverImage: "/a.jpg", publishedAt: "2026-01-01T00:00:00Z" }, { slug: "news", urlRemap: REMAP });
    expect(data).toMatchObject({ slug: "news", status: "draft", tags: '["a","b"]', coverImage: "https://blob.test/a.jpg" });
    expect(Object.keys(data).sort()).toEqual(["slug", "title", "body", "status", "coverImage", "tags"].sort());
  });

  it("post falls back title→slug, body→'' on an empty row (required scalars)", () => {
    const data = toPostCreate({}, { slug: "p", urlRemap: REMAP });
    expect(data).toMatchObject({ slug: "p", title: "p", body: "", status: "draft" });
  });
});

describe("toCategoryCreate", () => {
  it("has no status, falls back name→slug, remaps hero video + injects both asset ids", () => {
    const data = toCategoryCreate(
      { heroVideo: "/old-hero.jpg", faq: '[{"q":"?","a":"!"}]' },
      { slug: "fences", heroImageAssetId: "img1", heroVideoAssetId: "vid1", urlRemap: REMAP },
    );
    expect(data).toMatchObject({ name: "fences", slug: "fences", heroVideo: "https://blob.test/new-hero.jpg", heroImageAssetId: "img1", heroVideoAssetId: "vid1", faq: '[{"q":"?","a":"!"}]' });
    expect(Object.keys(data).sort()).toEqual(["name", "slug", "heroImageAssetId", "heroVideo", "heroVideoAssetId", "faq"].sort());
    expect("status" in data).toBe(false);
  });
});

describe("toVariantCreate / toProductMediaCreate (relation riders)", () => {
  it("variant injects productId, defaults attributes to {}", () => {
    const data = toVariantCreate({ sku: "v1", priceDkk: 52900, stock: 2 }, { productId: "prod_new" });
    expect(data).toEqual({ productId: "prod_new", sku: "v1", priceDkk: 52900, stock: 2, attributes: {} });
  });
  it("variant preserves a provided attributes object", () => {
    const data = toVariantCreate({ sku: "v1", priceDkk: 1, attributes: { color: "grey" } }, { productId: "p" });
    expect(data.attributes).toEqual({ color: "grey" });
  });
  it("productMedia injects productId + assetId, defaults role to 'gallery'", () => {
    const data = toProductMediaCreate({ position: 0 }, { productId: "prod_new", assetId: "asset_new" });
    expect(data).toEqual({ productId: "prod_new", assetId: "asset_new", position: 0, role: "gallery" });
  });
});
