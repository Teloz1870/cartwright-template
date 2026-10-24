import { describe, expect, it } from "vitest";
import zlib from "node:zlib";

import {
  packSitePack,
  unpackSitePack,
  isSafeEntryPath,
  buildUstarHeader,
  BLOCK_SIZE,
  type PackEntry,
  type UnpackLimits,
} from "@/lib/sitepack/archive";

/** SitePack archive codec — round-trip + the adversarial unpack hardening. */

const LIMITS: UnpackLimits = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };

// Build a single-entry gzipped tar from a (possibly malicious) header + data —
// bypasses pack's validation so we can feed unpack adversarial archives.
function rawTarGz(header: Buffer, data: Buffer): Buffer {
  const pad = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE;
  const tar = Buffer.concat([header, data, Buffer.alloc(pad), Buffer.alloc(BLOCK_SIZE * 2)]);
  return zlib.gzipSync(tar);
}

describe("isSafeEntryPath", () => {
  it("accepts the controlled SitePack paths", () => {
    for (const p of ["manifest.json", "content/pages.ndjson", "media/blobs/abc123.webp", "look/composition.json"]) {
      expect(isSafeEntryPath(p), p).toBe(true);
    }
  });
  it("rejects traversal / absolute / weird paths", () => {
    for (const p of ["../etc/passwd", "a/../../b", "/abs/path", "a//b", "a/./b", "C:/win", "a\\b", "a\0b", "", "a b/c"]) {
      expect(isSafeEntryPath(p), p).toBe(false);
    }
  });
});

describe("pack/unpack round-trip", () => {
  const entries: PackEntry[] = [
    { path: "manifest.json", bytes: Buffer.from('{"schema":"cartwright-sitepack-v1"}') },
    { path: "content/pages.ndjson", bytes: Buffer.from('{"slug":"home"}\n{"slug":"about"}\n') },
    { path: "media/blobs/deadbeef.webp", bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]) },
  ];

  it("round-trips bytes exactly", () => {
    const packed = unpackSitePack(packSitePack(entries), LIMITS);
    expect([...packed.keys()].sort()).toEqual(["content/pages.ndjson", "manifest.json", "media/blobs/deadbeef.webp"]);
    for (const e of entries) expect(packed.get(e.path)).toEqual(e.bytes);
  });

  it("produces a gzip stream (magic 1f 8b)", () => {
    const gz = packSitePack(entries);
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
  });

  it("is deterministic — same entries → byte-identical archive (sorted, zeroed mtime)", () => {
    const a = packSitePack(entries);
    const b = packSitePack([...entries].reverse()); // order must not matter
    expect(a.equals(b)).toBe(true);
  });

  it("pins the gzip header for CROSS-HOST determinism (mtime=0, OS byte=0xff)", () => {
    const gz = packSitePack(entries);
    expect(Array.from(gz.subarray(4, 8))).toEqual([0, 0, 0, 0]); // MTIME
    expect(gz[9]).toBe(0xff); // OS = "unknown", not the host OS (0x03 Linux / 0x13 macOS)
  });

  it("round-trips an empty-file entry and a 600-byte entry (crosses a block boundary)", () => {
    const big = Buffer.alloc(600, 0x41);
    const packed = unpackSitePack(packSitePack([{ path: "a.txt", bytes: Buffer.alloc(0) }, { path: "b.txt", bytes: big }]), LIMITS);
    expect(packed.get("a.txt")!.length).toBe(0);
    expect(packed.get("b.txt")).toEqual(big);
  });

  it("pack refuses to emit an unsafe path", () => {
    expect(() => packSitePack([{ path: "../evil", bytes: Buffer.from("x") }])).toThrow(/unsafe/);
  });
});

describe("unpack hardening (adversarial)", () => {
  it("GZIP BOMB — decompression over the cap throws before materializing", () => {
    const bomb = zlib.gzipSync(Buffer.alloc(2_000_000)); // tiny gz, huge inflate
    expect(() => unpackSitePack(bomb, { ...LIMITS, maxTotalBytes: 1000 })).toThrow(/size cap|valid gzip/);
  });

  it("PATH TRAVERSAL — a valid-checksum header with a ../ name is rejected", () => {
    const data = Buffer.from("rooted");
    const gz = rawTarGz(buildUstarHeader("../../etc/passwd", data.length), data);
    expect(() => unpackSitePack(gz, LIMITS)).toThrow(/unsafe entry path/);
  });

  it("SYMLINK — a symlink typeflag (0x32 '2') is rejected", () => {
    const gz = rawTarGz(buildUstarHeader("link", 0, 0x32), Buffer.alloc(0));
    expect(() => unpackSitePack(gz, LIMITS)).toThrow(/unsupported entry type/);
  });

  it("HARDLINK — a hardlink typeflag (0x31 '1') is rejected", () => {
    const gz = rawTarGz(buildUstarHeader("hard", 0, 0x31), Buffer.alloc(0));
    expect(() => unpackSitePack(gz, LIMITS)).toThrow(/unsupported entry type/);
  });

  it("PER-ENTRY CAP — an entry over maxEntryBytes is rejected", () => {
    const gz = packSitePack([{ path: "big.bin", bytes: Buffer.alloc(2000) }]);
    expect(() => unpackSitePack(gz, { ...LIMITS, maxEntryBytes: 1000 })).toThrow(/exceeds/);
  });

  it("ENTRY-COUNT CAP — too many entries is rejected", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.txt`, bytes: Buffer.from(String(i)) }));
    expect(() => unpackSitePack(packSitePack(many), { ...LIMITS, maxEntries: 2 })).toThrow(/too many entries/);
  });

  it("DUPLICATE PATH — two entries with the same name is rejected (cap-bypass + overwrite guard)", () => {
    const data = Buffer.from("dup");
    const block = (name: string) => Buffer.concat([buildUstarHeader(name, data.length), data, Buffer.alloc(BLOCK_SIZE - data.length)]);
    const gz = zlib.gzipSync(Buffer.concat([block("a.txt"), block("a.txt"), Buffer.alloc(BLOCK_SIZE * 2)]));
    expect(() => unpackSitePack(gz, LIMITS)).toThrow(/duplicate entry path/);
  });

  it("CORRUPTION — a tampered header (bad checksum) is rejected", () => {
    const h = buildUstarHeader("x.txt", 4);
    h[0] = h[0] ^ 0xff; // flip a name byte AFTER the checksum was computed
    expect(() => unpackSitePack(rawTarGz(h, Buffer.from("data")), LIMITS)).toThrow(/checksum/);
  });

  it("TRUNCATION — an entry claiming more bytes than present is rejected", () => {
    const h = buildUstarHeader("x.txt", 9999); // claims 9999 bytes, supplies few
    const gz = zlib.gzipSync(Buffer.concat([h, Buffer.from("short")]));
    expect(() => unpackSitePack(gz, LIMITS)).toThrow(/truncated|checksum/);
  });
});
