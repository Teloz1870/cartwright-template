import { describe, expect, it } from "vitest";

import { assembleCartpack, type GatheredSite, type ExportMeta } from "@/lib/sitepack/export";
import { packSitePack, unpackSitePack, type PackEntry } from "@/lib/sitepack/archive";
import { openCartpack, compatGate } from "@/lib/sitepack/import-open";
import { CONTENT_SCHEMA_VERSION, CONTAINER_SCHEMA_VERSION, type SitePackManifest } from "@/lib/sitepack/spec";

const LIMITS = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };

function gathered(): GatheredSite {
  return {
    pages: [{ row: { slug: "about", title: "About", body: "## Story", status: "published" }, heroImageSha256: null }],
    categories: [],
    services: [],
    posts: [],
    products: [],
    variants: [],
    productMedia: [],
    media: [],
    branding: { storeName: "Aluzaun" },
    integration: { aiProvider: "anthropic" },
    compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Aluzaun", skin: "aurora-shop" }),
  };
}

const meta: ExportMeta = {
  id: "01J8ABCDEF",
  name: "Aluzaun",
  createdAt: "2026-06-14T00:00:00Z",
  exporter: { version: "0.0.0-source", channel: "source", ref: "source" } as ExportMeta["exporter"],
  mode: "webshop",
  defaultLocale: "da",
  locales: ["da", "en"],
  designRef: { slug: "aurora-shop", kind: "data" },
};

// Re-pack a set of entries WITHOUT rebuilding the manifest → simulates tampering
// (the manifest still claims the original hashes).
function repack(entries: Map<string, Buffer>): Buffer {
  return packSitePack([...entries].map(([path, bytes]) => ({ path, bytes }) as PackEntry));
}

describe("openCartpack — round-trip + integrity gate", () => {
  it("opens a freshly exported pack and returns the validated manifest", () => {
    const opened = openCartpack(assembleCartpack(gathered(), meta), LIMITS);
    expect(opened.manifest.mode).toBe("webshop");
    expect(opened.manifest.name).toBe("Aluzaun");
    expect(opened.entries.has("content/pages.ndjson")).toBe(true);
  });

  it("REJECTS a tampered file (a content byte changed after export)", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    entries.set("content/pages.ndjson", Buffer.from('{"slug":"EVIL","title":"x","body":"y"}\n'));
    expect(() => openCartpack(repack(entries), LIMITS)).toThrow(/integrity mismatch|Merkle/);
  });

  it("REJECTS an ADDED file not in the manifest", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    entries.set("content/sneaky.ndjson", Buffer.from('{"x":1}\n'));
    expect(() => openCartpack(repack(entries), LIMITS)).toThrow(/file set does not match/);
  });

  it("REJECTS a REMOVED file the manifest claims", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    entries.delete("content/pages.ndjson");
    expect(() => openCartpack(repack(entries), LIMITS)).toThrow(/file set does not match/);
  });

  it("REJECTS a missing manifest.json", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    entries.delete("manifest.json");
    expect(() => openCartpack(repack(entries), LIMITS)).toThrow(/missing manifest/);
  });

  it("REJECTS a manifest that is not schema-valid (a non-SitePack tarball)", () => {
    const gz = packSitePack([{ path: "manifest.json", bytes: Buffer.from('{"schema":"not-a-sitepack"}') }]);
    expect(() => openCartpack(gz, LIMITS)).toThrow();
  });

  it("REJECTS a declared uncompressedBytes that doesn't match the actual content (zip-bomb defense)", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    const m = JSON.parse(entries.get("manifest.json")!.toString("utf8"));
    m.uncompressedBytes = 999999; // lie — the integrity.files still match, so this is the only check that catches it
    entries.set("manifest.json", Buffer.from(JSON.stringify(m)));
    expect(() => openCartpack(repack(entries), LIMITS)).toThrow(/uncompressedBytes/);
  });

  it("drops the (P0-unverified) SIGNATURE from the returned entries", () => {
    const entries = unpackSitePack(assembleCartpack(gathered(), meta), LIMITS);
    entries.set("SIGNATURE", Buffer.from("not-a-real-sig")); // excluded from integrity on both sides
    const opened = openCartpack(repack(entries), LIMITS);
    expect(opened.entries.has("SIGNATURE")).toBe(false);
  });
});

const baseManifest = (over: Partial<SitePackManifest> = {}): SitePackManifest =>
  ({
    containerSchemaVersion: CONTAINER_SCHEMA_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    compat: { minEngineContentSchema: CONTENT_SCHEMA_VERSION, sectionSpecVersions: {} },
    mode: "webshop",
    ...over,
  }) as SitePackManifest;

describe("compatGate", () => {
  const engine = { contentSchemaVersion: CONTENT_SCHEMA_VERSION, mode: "webshop" as const };

  it("passes a same-version, same-mode pack", () => {
    expect(compatGate(baseManifest(), engine)).toEqual({ ok: true });
  });

  it("rejects a pack with a NEWER envelope (containerSchemaVersion)", () => {
    expect(compatGate(baseManifest({ containerSchemaVersion: 99 }), engine)).toMatchObject({ ok: false });
  });

  it("rejects a pack made by a NEWER engine", () => {
    expect(compatGate(baseManifest({ contentSchemaVersion: 99 }), engine)).toMatchObject({ ok: false });
  });

  it("rejects when the engine is too old for the pack's minEngine floor", () => {
    const m = baseManifest({ compat: { minEngineContentSchema: 99, sectionSpecVersions: {} } });
    expect(compatGate(m, engine)).toMatchObject({ ok: false });
  });

  it("hard-blocks a webshop pack onto a website engine (identity guard)", () => {
    const r = compatGate(baseManifest({ mode: "webshop" }), { contentSchemaVersion: CONTENT_SCHEMA_VERSION, mode: "website" });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/[Mm]ode mismatch/);
  });

  it("allows a mode mismatch only with the explicit override", () => {
    const r = compatGate(baseManifest({ mode: "webshop" }), { contentSchemaVersion: CONTENT_SCHEMA_VERSION, mode: "website" }, { allowModeMismatch: true });
    expect(r).toEqual({ ok: true });
  });
});
