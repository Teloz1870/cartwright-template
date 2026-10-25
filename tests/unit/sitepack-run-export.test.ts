import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// run-export pulls computeSha256 from @/lib/media/asset, which imports @/lib/db —
// mock it so the prisma import is inert (computeSha256 itself is pure crypto).
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { readReleaseMarker } from "@/lib/sitepack/release";
import { runExport, type ExportData } from "@/lib/sitepack/run-export";
import { unpackSitePack } from "@/lib/sitepack/archive";
import { parseNdjson } from "@/lib/sitepack/serialize";
import { SitePackManifestSchema, type SitePackManifest } from "@/lib/sitepack/spec";
import type { ExportMeta } from "@/lib/sitepack/export";

const LIMITS = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };
const bareSha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const meta: ExportMeta = {
  id: "01J8X",
  name: "Aluzaun",
  createdAt: "2026-06-14T00:00:00Z",
  exporter: { version: "0.0.0-source", channel: "source", ref: "source" } as ExportMeta["exporter"],
  mode: "webshop",
  defaultLocale: "da",
  locales: ["da", "en"],
  designRef: { slug: "aurora-shop", kind: "data" },
};

describe("readReleaseMarker", () => {
  // Hermetic: read from tmpdir fixtures, never the host repo's live
  // .cartwright/release.json. That file is "0.0.0-source" in this source
  // checkout but the released marker (e.g. "0.37.1"/"stable") in any scaffold,
  // so the old test that read process.cwd() passed only in the source repo and
  // failed in every released/scaffolded project.
  const tmpRoots: string[] = [];
  function rootWithMarker(marker: Record<string, unknown>): string {
    const root = mkdtempSync(path.join(tmpdir(), "cw-release-"));
    tmpRoots.push(root);
    mkdirSync(path.join(root, ".cartwright"), { recursive: true });
    writeFileSync(path.join(root, ".cartwright", "release.json"), JSON.stringify(marker));
    return root;
  }
  afterEach(() => {
    for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  it("reads a released stable marker (as a scaffolded project has)", () => {
    const root = rootWithMarker({ version: "0.37.1", channel: "stable", commit: "abc123", ref: "v0.37.1" });
    expect(readReleaseMarker(root)).toEqual({ version: "0.37.1", channel: "stable", commit: "abc123", ref: "v0.37.1" });
  });
  it("reads a source marker", () => {
    const root = rootWithMarker({ version: "0.0.0-source", channel: "source", commit: "", ref: "source" });
    const m = readReleaseMarker(root);
    expect(m.version).toBe("0.0.0-source");
    expect(m.channel).toBe("source");
  });
  it("fails soft to source defaults when the file is missing", () => {
    const m = readReleaseMarker("/definitely/not/a/cartwright/root");
    expect(m).toEqual({ version: "0.0.0-source", channel: "source", commit: "", ref: "source" });
  });
});

describe("runExport — orchestration", () => {
  const HERO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 0x41)]);
  const GAL = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 0x42)]);

  function data(over: Partial<ExportData> = {}): ExportData {
    return {
      pages: [{ id: "p1", slug: "about", title: "About", body: "## hi", heroImageAssetId: "asHero" }],
      categories: [{ id: "c1", slug: "fences", name: "Fences" }],
      services: [],
      posts: [],
      products: [{ id: "pr1", slug: "panel", categoryId: "c1", name: "Panel", priceDkk: 49900 }],
      variants: [],
      productMedia: [
        { productId: "pr1", assetId: "asGal", position: 0 },
        { productId: "pr1", assetId: "asDead", position: 1 }, // its bytes will fail → skipped
      ],
      mediaAssets: [
        { id: "asHero", mime: "image/jpeg", sha256: null }, // stored sha null → computed
        { id: "asGal", mime: "image/jpeg", sha256: null },
        { id: "asDead", mime: "image/jpeg", sha256: null }, // fetch returns null → omitted
      ],
      branding: { storeName: "Aluzaun", anthropicApiKey: "sk-SECRET" },
      integration: { aiProvider: "anthropic", stripeSecretKey: "sk_live_SECRET" },
      compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
      fetchAssetBytes: async (a) => (a.id === "asHero" ? HERO : a.id === "asGal" ? GAL : null),
      ...over,
    };
  }

  it("produces a .cartpack: computes sha on null, omits unfetchable assets, skips their refs", async () => {
    const { cartpack, report } = await runExport(data(), meta);
    const out = unpackSitePack(cartpack, LIMITS);

    // asHero + asGal computed their bare-hex sha from bytes; asDead omitted.
    expect(out.has(`media/blobs/${bareSha(HERO)}.jpg`)).toBe(true);
    expect(out.has(`media/blobs/${bareSha(GAL)}.jpg`)).toBe(true);
    expect(out.get(`media/blobs/${bareSha(HERO)}.jpg`)).toEqual(HERO);
    expect(report.mediaFetchFailed).toBe(1); // asDead
    expect(report.skippedProductMedia).toBe(1); // the row pointing at asDead

    // The page hero re-links to the computed sha; the kept product-media too.
    const pages = parseNdjson(out.get("content/pages.ndjson")!.toString()) as { heroImageSha256: string }[];
    expect(pages[0].heroImageSha256).toBe(bareSha(HERO));
    const pm = parseNdjson(out.get("content/product-media.ndjson")!.toString()) as { assetSha256: string }[];
    expect(pm).toHaveLength(1);
    expect(pm[0].assetSha256).toBe(bareSha(GAL));

    // Manifest is schema-valid; counts.mediaAssets = the 2 bundled.
    const manifest: SitePackManifest = SitePackManifestSchema.parse(JSON.parse(out.get("manifest.json")!.toString()));
    expect(manifest.counts.mediaAssets).toBe(2);
  });

  it("ALWAYS recomputes the content address from bytes, ignoring a stale stored sha (integrity)", async () => {
    const staleStored = "deadbeefcafe"; // hex but WRONG (doesn't match HERO's bytes)
    const { cartpack } = await runExport(
      data({
        productMedia: [],
        pages: [{ id: "p1", slug: "x", title: "X", body: "## b", heroImageAssetId: "asHero" }],
        mediaAssets: [{ id: "asHero", mime: "image/jpeg", sha256: staleStored }],
      }),
      meta,
    );
    const out = unpackSitePack(cartpack, LIMITS);
    expect(out.has(`media/blobs/${bareSha(HERO)}.jpg`)).toBe(true); // the ACTUAL hash
    expect(out.has(`media/blobs/${staleStored}.jpg`)).toBe(false); // never the stale DB value
  });

  it("leaks NO secret from branding/integration through the orchestration", async () => {
    const { cartpack } = await runExport(data(), meta);
    const out = unpackSitePack(cartpack, LIMITS);
    const all = Buffer.concat([...out.values()]).toString("utf8");
    expect(all).not.toContain("sk-SECRET");
    expect(all).not.toContain("sk_live_SECRET");
    expect(all).toContain("Aluzaun");
  });
});
