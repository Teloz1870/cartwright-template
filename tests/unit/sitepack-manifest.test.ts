import { describe, expect, it } from "vitest";

import { sha256, fileHashes, merkleRoot } from "@/lib/sitepack/integrity";
import { buildManifest, canonicalManifestJson, type BuildManifestInput } from "@/lib/sitepack/manifest";
import { SITEPACK_SCHEMA, CONTENT_SCHEMA_VERSION } from "@/lib/sitepack/spec";

function entries(obj: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(obj).map(([k, v]) => [k, Buffer.from(v)]));
}

const baseInput = (e: Map<string, Buffer>): BuildManifestInput => ({
  id: "01J8ABCDEF",
  name: "Aluzaun",
  createdAt: "2026-06-14T00:00:00Z",
  exporter: { version: "0.0.0-source", channel: "source", gitRef: "main" },
  mode: "webshop",
  defaultLocale: "da",
  locales: ["da", "en"],
  designRef: { slug: "aurora-shop", kind: "data" },
  pluginsRequired: ["three-scenes"],
  featuresRequested: ["webshop", "reviews"],
  counts: { pages: 2, products: 1 },
  entries: e,
});

describe("integrity", () => {
  it("sha256 is the prefixed hex digest", () => {
    expect(sha256(Buffer.from("abc"))).toBe("sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("fileHashes hashes every entry, keyed + sorted by path", () => {
    const f = fileHashes(entries({ "b.txt": "two", "a.txt": "one" }));
    expect(Object.keys(f)).toEqual(["a.txt", "b.txt"]); // sorted
    expect(f["a.txt"]).toBe(sha256(Buffer.from("one")));
  });

  it("merkleRoot is deterministic + order-independent (sorted leaves)", () => {
    const a = merkleRoot(fileHashes(entries({ "a.txt": "one", "b.txt": "two", "c.txt": "three" })));
    const b = merkleRoot(fileHashes(entries({ "c.txt": "three", "a.txt": "one", "b.txt": "two" })));
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it("merkleRoot changes if ANY file's bytes change (tamper-evident)", () => {
    const clean = merkleRoot(fileHashes(entries({ "a.txt": "one", "b.txt": "two" })));
    const tampered = merkleRoot(fileHashes(entries({ "a.txt": "one", "b.txt": "two!" })));
    expect(tampered).not.toBe(clean);
  });

  it("an empty set has a stable root (digest of zero bytes)", () => {
    expect(merkleRoot({})).toBe(sha256(Buffer.alloc(0)));
  });
});

describe("buildManifest", () => {
  it("assembles a valid manifest with computed integrity + uncompressedBytes", () => {
    const e = entries({ "content/pages.ndjson": "hello", "look/composition.json": "{}" });
    const m = buildManifest(baseInput(e));
    expect(m.schema).toBe(SITEPACK_SCHEMA);
    expect(m.contentSchemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(m.uncompressedBytes).toBe("hello".length + "{}".length);
    expect(Object.keys(m.integrity.files).sort()).toEqual(["content/pages.ndjson", "look/composition.json"]);
    expect(m.integrity.merkleRoot).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(m.containsCode).toBe(false);
    expect(m.compat.minEngineContentSchema).toBe(CONTENT_SCHEMA_VERSION);
  });

  it("is byte-stable across re-exports of the same input (same id/createdAt)", () => {
    const e = entries({ "a.json": "1", "b.json": "2" });
    const m1 = canonicalManifestJson(buildManifest(baseInput(e)));
    const m2 = canonicalManifestJson(buildManifest(baseInput(e)));
    expect(m1.equals(m2)).toBe(true);
  });

  it("canonical JSON keeps NESTED keys (regression: replacer-array would drop them)", () => {
    const m = buildManifest(baseInput(entries({ "a.json": "1" })));
    const parsed = JSON.parse(canonicalManifestJson(m).toString("utf8"));
    // Nested objects must survive canonicalization fully.
    expect(parsed.exporter.engine).toBe("cartwright");
    expect(parsed.exporter.channel).toBe("source");
    expect(typeof parsed.compat.sectionSpecVersions.genome).toBe("number");
    expect(parsed.integrity.algo).toBe("sha256");
    expect(parsed.designRef.slug).toBe("aurora-shop");
  });

  it("the merkleRoot changes when a packed file changes (manifest reflects tamper)", () => {
    const m1 = buildManifest(baseInput(entries({ "a.json": "1" })));
    const m2 = buildManifest(baseInput(entries({ "a.json": "2" })));
    expect(m1.integrity.merkleRoot).not.toBe(m2.integrity.merkleRoot);
  });

  it("fails closed on an internally-inconsistent input (defaultLocale not in locales)", () => {
    expect(() => buildManifest({ ...baseInput(entries({ "a.json": "1" })), defaultLocale: "de" })).toThrow(/defaultLocale/);
  });

  it("carries the 0.0.0-source exporter honestly (no Date.now / no version lie)", () => {
    const m = buildManifest(baseInput(entries({ "a.json": "1" })));
    expect(m.exporter.version).toBe("0.0.0-source");
    expect(m.exporter.channel).toBe("source");
    expect(m.exporter.gitRef).toBe("main");
  });

  it("refuses entries that include manifest.json or SIGNATURE (no self-referential integrity)", () => {
    expect(() => buildManifest(baseInput(entries({ "a.json": "1", "manifest.json": "{}" })))).toThrow(/manifest.json|SIGNATURE/);
    expect(() => buildManifest(baseInput(entries({ "a.json": "1", SIGNATURE: "sig" })))).toThrow(/manifest.json|SIGNATURE/);
  });

  it("signing contract: canonical JSON survives a parse→re-canonicalize round-trip byte-identically", () => {
    const m = buildManifest(baseInput(entries({ "a.json": "1", "b.json": "2" })));
    const once = canonicalManifestJson(m);
    const reparsed = JSON.parse(once.toString("utf8"));
    const twice = canonicalManifestJson(reparsed as typeof m);
    expect(once.equals(twice)).toBe(true); // what P1 signs == what the importer re-hashes
  });
});
