import { describe, expect, it } from "vitest";

import {
  toNdjson,
  parseNdjson,
  serializePage,
  serializeCategory,
  serializeService,
  serializePost,
  serializeMediaAsset,
  serializeProduct,
  serializeProductVariant,
  serializeProductMedia,
} from "@/lib/sitepack/serialize";

/** SitePack content serializers — allowlist carries owner fields, drops ids/FKs/
 *  operational; translations always rides; NDJSON round-trips. */

// A forbidden field must NOT appear as a key in the serialized output.
function assertDropped(out: Record<string, unknown>, dropped: string[]) {
  const keys = Object.keys(out);
  for (const k of dropped) expect(keys, `leaked field ${k}`).not.toContain(k);
}

describe("serializePage", () => {
  it("carries owner content incl. translations; drops id/FK/timestamps", () => {
    const row = {
      id: "ckPAGE", slug: "about", title: "About", body: "## Story", bodyFormat: "text",
      heroImage: "/img/h.jpg", metaTitle: "About Us", metaDescription: "d", showInNav: true, navOrder: 2,
      status: "published", layoutJson: '{"sections":[]}', vibeHtml: "<p>x</p>",
      translations: { en: { title: "About" } },
      heroImageAssetId: "ckASSET", updatedAt: new Date(),
    };
    const out = serializePage(row);
    expect(out.slug).toBe("about");
    expect(out.showInNav).toBe(true);
    expect(out.navOrder).toBe(2);
    expect(out.translations).toEqual({ en: { title: "About" } });
    assertDropped(out as Record<string, unknown>, ["id", "heroImageAssetId", "updatedAt", "heroImageAsset"]);
  });

  it("carries the resolved hero asset sha256 so a mediaLibrary-only hero survives (no legacy URL)", () => {
    // mediaLibrary-on: heroImage string is null, the hero lives in the asset FK.
    const out = serializePage({ slug: "p", title: "P", body: "b", heroImage: null, heroImageAssetId: "ckASSET" }, { heroImageSha256: "ba7816bf" });
    expect(out.heroImage).toBeNull();
    expect(out.heroImageSha256).toBe("ba7816bf"); // portable key → importer re-links the asset
  });
});

describe("serializeCategory", () => {
  it("carries SEO/look fields + translations; drops id + asset FKs", () => {
    const row = {
      id: "ckCAT", name: "Fences", slug: "fences", description: "d", vibeHtml: null,
      heroImage: "/c.jpg", heroVideo: "/c.mp4", descriptionLong: "## long", metaTitle: "t",
      metaDescription: "md", faq: '[{"q":"?","a":"!"}]', translations: { en: {} },
      heroImageAssetId: "a1", heroVideoAssetId: "a2",
    };
    const out = serializeCategory(row);
    expect(out.slug).toBe("fences");
    expect(out.faq).toBe('[{"q":"?","a":"!"}]');
    expect(out.translations).toEqual({ en: {} });
    assertDropped(out as Record<string, unknown>, ["id", "heroImageAssetId", "heroVideoAssetId"]);
  });
});

describe("serializeService", () => {
  it("carries body/features/status + translations; drops id/timestamps/FK", () => {
    const row = {
      id: "ckSVC", slug: "brand", title: "Brand", shortDescription: "s", priceString: "from $4,500",
      heroImage: "/s.jpg", features: ["Logo", "Palette"], body: "## get", vibeHtml: null,
      showInNav: false, navOrder: 1, status: "draft", translations: null,
      heroImageAssetId: "x", createdAt: new Date(), updatedAt: new Date(),
    };
    const out = serializeService(row);
    expect(out.features).toEqual(["Logo", "Palette"]);
    expect(out.status).toBe("draft");
    assertDropped(out as Record<string, unknown>, ["id", "heroImageAssetId", "createdAt", "updatedAt"]);
  });
});

describe("serializePost", () => {
  it("carries blog fields, normalizes publishedAt → ISO, drops id/timestamps", () => {
    const row = {
      id: "ckPOST", slug: "hello", title: "Hello", excerpt: "e", body: "b", bodyFormat: "text",
      coverImage: "/p.jpg", author: "Kim", status: "published", publishedAt: new Date("2026-01-01T00:00:00Z"),
      tags: '["news"]', metaTitle: "t", metaDescription: "md", vibeHtml: null,
      translations: { en: {} }, createdAt: new Date(), updatedAt: new Date(),
    };
    const out = serializePost(row);
    expect(out.publishedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(out.tags).toBe('["news"]');
    assertDropped(out as Record<string, unknown>, ["id", "createdAt", "updatedAt"]);
  });

  it("a never-published post serializes publishedAt as null", () => {
    expect(serializePost({ slug: "x", title: "X", body: "b", publishedAt: null }).publishedAt).toBeNull();
  });
});

describe("serializeMediaAsset", () => {
  it("carries metadata + the BARE-hex content address; drops url/blobPathname/id/aiStatus/uploader", () => {
    const row = {
      id: "ckMEDIA", url: "https://blob.store/secret-token/x.webp", blobPathname: "admin-uploads/uuid-x.webp",
      mime: "image/webp", sizeBytes: 12345, width: 800, height: 600, durationSec: null,
      altDa: "alt", altEn: "alt-en", title: "t", caption: "c", geoSnippet: "g",
      dominantColors: '["#fff"]', suggestedSlug: "x", aiStatus: "ok", aiModel: "m",
      aiLastError: "boom", uploadedBy: "admin:km@teloz.net", driveFileId: "drive123",
      sha256: "BARE_FROM_DB", createdAt: new Date(),
    };
    const out = serializeMediaAsset(row, "ba7816bf"); // caller passes the resolved bare-hex sha256
    expect(out.sha256).toBe("ba7816bf"); // bare hex, not "sha256-…"
    expect(out.mime).toBe("image/webp");
    expect(out.altEn).toBe("alt-en");
    const blob = JSON.stringify(out);
    // No instance-specific / operational / credential-bearing field survives.
    for (const leak of ["url", "blobPathname", "secret-token", "aiStatus", "aiLastError", "uploadedBy", "driveFileId", "id\"", "createdAt"]) {
      expect(blob, `leaked ${leak}`).not.toContain(leak);
    }
  });
});

describe("serializeProduct (relational)", () => {
  it("resolves categoryId→categorySlug, carries AEO/attributes/translations, drops FKs + derived + soft-delete", () => {
    const row = {
      id: "ckPROD", sku: "fence-2x3", name: "Panel", slug: "panel-2x3", description: "d",
      priceDkk: 49900, stock: 0, featured: true, images: '["/a.jpg"]', videoUrl: null,
      frameColor: null, lensColor: null, brand: null, attributes: { height: "2m" },
      answerSummary: "Strong fence.", faq: '[{"q":"?","a":"!"}]', useCases: [{ title: "Garden" }],
      comparisonFacts: { material: "alu" }, weightGram: 12000, vibeHtml: null, translations: { en: {} },
      categoryId: "ckCAT", supplierId: "ckSUP", videoGenerationId: "luma-1", sheetRowRef: "12",
      deletedAt: null, createdAt: new Date(),
    };
    const out = serializeProduct(row, { categorySlug: "fences" });
    expect(out.categorySlug).toBe("fences");
    expect(out.priceDkk).toBe(49900);
    expect(out.stock).toBe(0); // falsy-but-valid preserved
    expect(out.featured).toBe(true);
    expect(out.attributes).toEqual({ height: "2m" });
    expect(out.useCases).toEqual([{ title: "Garden" }]);
    expect(out.translations).toEqual({ en: {} });
    assertDropped(out as Record<string, unknown>, ["id", "categoryId", "supplierId", "videoGenerationId", "sheetRowRef", "deletedAt", "createdAt", "embedding"]);
  });
});

describe("serializeProductVariant (relational)", () => {
  it("resolves parent → productSlug; carries variant pricing/attributes; drops id/productId", () => {
    const out = serializeProductVariant(
      { id: "ckVAR", productId: "ckPROD", sku: "fence-2x3-grey", priceDkk: 52900, stock: 5, attributes: { color: "grey" } },
      { productSlug: "panel-2x3" },
    );
    expect(out.productSlug).toBe("panel-2x3");
    expect(out.sku).toBe("fence-2x3-grey");
    expect(out.priceDkk).toBe(52900);
    expect(out.attributes).toEqual({ color: "grey" });
    assertDropped(out as Record<string, unknown>, ["id", "productId"]);
  });
});

describe("serializeProductMedia (relational join)", () => {
  it("resolves BOTH FKs to natural keys (productSlug + bare-hex assetSha256); drops productId/assetId", () => {
    const out = serializeProductMedia(
      { productId: "ckPROD", assetId: "ckASSET", position: 2, role: "gallery" },
      { productSlug: "panel-2x3", assetSha256: "ba7816bf" },
    );
    expect(out.productSlug).toBe("panel-2x3");
    expect(out.assetSha256).toBe("ba7816bf"); // bare hex, re-linked via sha256→newAssetId map
    expect(out.position).toBe(2);
    assertDropped(out as Record<string, unknown>, ["productId", "assetId"]);
  });
});

describe("NDJSON", () => {
  it("round-trips rows (toNdjson → parseNdjson)", () => {
    const rows = [serializePage({ slug: "a", title: "A", body: "x" }), serializePage({ slug: "b", title: "B", body: "y" })];
    expect(parseNdjson(toNdjson(rows))).toEqual(rows);
  });

  it("empty input → empty string → empty array", () => {
    expect(toNdjson([])).toBe("");
    expect(parseNdjson("")).toEqual([]);
  });

  it("skips blank lines and throws on a malformed line", () => {
    expect(parseNdjson('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(() => parseNdjson('{"a":1}\n{not json}\n')).toThrow(/malformed NDJSON at line 2/);
  });
});
