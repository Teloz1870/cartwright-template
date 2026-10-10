import { describe, expect, it } from "vitest";

import { resolveGatheredSite, type ResolveInput, type AssetEntry } from "@/lib/sitepack/gather";

/** SitePack gather — pure FK→natural-key resolution + referenced-media collection. */

function asset(sha256: string): AssetEntry {
  return { sha256, bytes: Buffer.from(sha256), row: { mime: "image/jpeg", sizeBytes: 10 } };
}

function input(over: Partial<ResolveInput> = {}): ResolveInput {
  return {
    pages: [],
    categories: [{ id: "cat1", slug: "fences", name: "Fences" }],
    services: [],
    posts: [],
    products: [{ id: "prod1", slug: "panel", categoryId: "cat1", name: "Panel" }],
    variants: [{ id: "var1", productId: "prod1", sku: "panel-grey" }],
    productMedia: [{ productId: "prod1", assetId: "asA", position: 0 }],
    assetById: new Map([["asA", asset("aa11")]]),
    branding: { storeName: "X" },
    integration: { aiProvider: "anthropic" },
    compositionJson: "{}",
    ...over,
  };
}

describe("resolveGatheredSite", () => {
  it("resolves categoryId→categorySlug and productId→productSlug", () => {
    const { site } = resolveGatheredSite(input());
    expect(site.products[0].categorySlug).toBe("fences");
    expect(site.variants[0].productSlug).toBe("panel");
    expect(site.productMedia[0]).toMatchObject({ productSlug: "panel", assetSha256: "aa11" });
  });

  it("resolves hero asset FKs → bare-hex sha256 (and null when no FK)", () => {
    const { site } = resolveGatheredSite(
      input({
        pages: [{ slug: "p", heroImageAssetId: "asA" }, { slug: "q", heroImageAssetId: null }],
        categories: [{ id: "cat1", slug: "fences", heroImageAssetId: "asA", heroVideoAssetId: "asV" }],
        assetById: new Map([["asA", asset("aa11")], ["asV", asset("vv22")]]),
        productMedia: [],
      }),
    );
    expect(site.pages[0].heroImageSha256).toBe("aa11");
    expect(site.pages[1].heroImageSha256).toBeNull();
    expect(site.categories[0].heroImageSha256).toBe("aa11");
    expect(site.categories[0].heroVideoSha256).toBe("vv22");
  });

  it("SKIPS a ProductMedia row whose asset has no resolvable sha256 (counted)", () => {
    const r = resolveGatheredSite(
      input({
        productMedia: [
          { productId: "prod1", assetId: "asA", position: 0 }, // resolvable
          { productId: "prod1", assetId: "ghost", position: 1 }, // no asset in map → skip
        ],
      }),
    );
    expect(r.site.productMedia).toHaveLength(1);
    expect(r.site.productMedia[0].assetSha256).toBe("aa11");
    expect(r.skippedProductMedia).toBe(1);
  });

  it("emits into media ONLY the assets actually referenced (not every asset in the map)", () => {
    const { site } = resolveGatheredSite(
      input({
        pages: [{ slug: "p", heroImageAssetId: "asA" }],
        productMedia: [],
        // asB is in the map but referenced by nothing → must NOT travel.
        assetById: new Map([["asA", asset("aa11")], ["asB", asset("bb33")]]),
      }),
    );
    expect(site.media.map((m) => m.sha256).sort()).toEqual(["aa11"]);
  });

  it("dedups a referenced asset shared by a hero AND a product-media row", () => {
    const { site } = resolveGatheredSite(
      input({
        pages: [{ slug: "p", heroImageAssetId: "asA" }],
        productMedia: [{ productId: "prod1", assetId: "asA", position: 0 }],
        assetById: new Map([["asA", asset("aa11")]]),
      }),
    );
    expect(site.media).toHaveLength(1); // one physical blob, two references
  });
});
