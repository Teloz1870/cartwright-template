import { describe, expect, it } from "vitest";

import { assembleCartpack, buildSitePackEntries, type GatheredSite, type ExportMeta } from "@/lib/sitepack/export";
import { unpackSitePack } from "@/lib/sitepack/archive";
import { parseNdjson } from "@/lib/sitepack/serialize";
import { fileHashes } from "@/lib/sitepack/integrity";
import { SitePackManifestSchema } from "@/lib/sitepack/spec";

/**
 * The export PAYOFF test: a realistic gathered site → assembleCartpack → a real
 * `.cartpack` → unpack → every byte verified. Proves the whole export path end to
 * end: serializers → media-blobs → manifest + integrity → codec → round-trip.
 */

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(28, 0x42)]);

function gathered(): GatheredSite {
  return {
    pages: [{ row: { slug: "about", title: "About", body: "## Story", status: "published" }, heroImageSha256: null }],
    categories: [{ row: { name: "Fences", slug: "fences", description: "d" }, heroImageSha256: null, heroVideoSha256: null }],
    services: [],
    posts: [{ slug: "hello", title: "Hello", body: "first post", status: "published" }],
    products: [{ row: { sku: "f-1", name: "Panel", slug: "panel", description: "d", priceDkk: 49900, stock: 3, images: '["/a.jpg"]' }, categorySlug: "fences" }],
    variants: [{ row: { sku: "f-1-grey", priceDkk: 52900, stock: 2, attributes: { color: "grey" } }, productSlug: "panel" }],
    productMedia: [{ row: { position: 0, role: "gallery" }, productSlug: "panel", assetSha256: "deadbeef01" }],
    media: [{ row: { mime: "image/jpeg", sizeBytes: JPEG.length, altDa: "hegn", altEn: "fence" }, sha256: "deadbeef01", bytes: JPEG }],
    branding: { storeName: "Aluzaun", tagline: "Fences", themeJson: '{"accent":"#1e3f5a"}', domain: "aluzaun.dk", emailFrom: "no-reply@aluzaun.dk" },
    integration: { aiProvider: "anthropic", anthropicApiKey: "sk-SECRET-LEAK", stripeSecretKey: "sk_live_SECRET" },
    compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
  };
}

const meta: ExportMeta = {
  id: "01J8ABCDEF",
  name: "Aluzaun",
  createdAt: "2026-06-14T00:00:00Z",
  exporter: { version: "0.0.0-source", channel: "source", gitRef: "main" },
  mode: "webshop",
  defaultLocale: "da",
  locales: ["da", "en"],
  designRef: { slug: "aurora-shop", kind: "data" },
  featuresRequested: ["webshop"],
};

const LIMITS = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };

describe("assembleCartpack — round-trip", () => {
  it("produces a .cartpack that unpacks with the right structure + a schema-valid manifest", () => {
    const out = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    expect([...out.keys()].sort()).toEqual([
      "content/branding.json",
      "content/categories.ndjson",
      "content/pages.ndjson",
      "content/product-media.ndjson",
      "content/product-variants.ndjson",
      "content/products.ndjson",
      "content/integrations.stub.json",
      "content/posts.ndjson",
      "look/composition.json",
      "manifest.json",
      "media/blobs/deadbeef01.jpg",
      "media/manifest.ndjson",
    ].sort());

    const manifest = SitePackManifestSchema.parse(JSON.parse(out.get("manifest.json")!.toString("utf8")));
    expect(manifest.mode).toBe("webshop");
    expect(manifest.counts).toEqual({ pages: 1, categories: 1, products: 1, services: 0, posts: 1, mediaAssets: 1, variants: 1, productMedia: 1 });
  });

  it("round-trips content + the media binary byte-exact", () => {
    const out = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    const pages = parseNdjson(out.get("content/pages.ndjson")!.toString("utf8")) as { slug: string }[];
    expect(pages[0].slug).toBe("about");
    expect(parseNdjson(out.get("content/products.ndjson")!.toString("utf8"))[0]).toMatchObject({ slug: "panel", categorySlug: "fences", priceDkk: 49900 });
    // The image binary survives the whole pipeline unchanged.
    expect(out.get("media/blobs/deadbeef01.jpg")).toEqual(JPEG);
  });

  it("integrity round-trips: recomputing fileHashes over the unpacked files matches the manifest", () => {
    const out = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    const manifest = SitePackManifestSchema.parse(JSON.parse(out.get("manifest.json")!.toString("utf8")));
    // Recompute over everything EXCEPT manifest.json (the integrity-exclusion contract).
    const recomputed = new Map(out);
    recomputed.delete("manifest.json");
    expect(fileHashes(recomputed)).toEqual(manifest.integrity.files);
    expect(manifest.integrity.merkleRoot).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it("leaks NO secret — the exported bytes never contain an API key or PII email", () => {
    const gz = assembleCartpack(gathered(), meta);
    const out = unpackSitePack(gz, LIMITS);
    const allBytes = Buffer.concat([...out.values()]).toString("utf8");
    for (const secret of ["sk-SECRET-LEAK", "sk_live_SECRET", "anthropicApiKey", "stripeSecretKey", "no-reply@aluzaun.dk", "aluzaun.dk", "emailFrom"]) {
      expect(allBytes, `leaked ${secret}`).not.toContain(secret);
    }
    // ...while the non-secret look DID travel.
    expect(out.get("content/branding.json")!.toString("utf8")).toContain("Aluzaun");
  });

  it("omits empty collections (services has no rows → no file)", () => {
    const out = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    expect(out.has("content/services.ndjson")).toBe(false);
  });

  it("buildSitePackEntries excludes manifest.json (added later by assembleCartpack)", () => {
    const { entries } = buildSitePackEntries(gathered());
    expect(entries.has("manifest.json")).toBe(false);
  });

  it("FAILS CLOSED on a dangling media reference (a referenced sha with no gathered blob)", () => {
    const g = gathered();
    g.pages[0].heroImageSha256 = "cafef00d"; // referenced…
    // …but no media blob with that sha is gathered → must throw at export.
    expect(() => buildSitePackEntries(g)).toThrow(/dangling media reference/);
  });

  it("FAILS CLOSED on a non-hex media sha (would make an unsafe blob path)", () => {
    const g = gathered();
    g.media[0].sha256 = "NOT/HEX..";
    expect(() => buildSitePackEntries(g)).toThrow(/bare lowercase hex/);
  });
});
