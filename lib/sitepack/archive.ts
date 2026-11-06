import zlib from "node:zlib";

/**
 * SitePack archive codec — the one real new I/O primitive (ultraplan §9).
 *
 * A `.cartpack` is a gzipped USTAR tar. This module packs/unpacks it ENTIRELY IN
 * MEMORY — it never writes to the filesystem, so the classic tar attacks
 * (path-traversal `../`, absolute paths, symlink/hardlink escapes, device nodes)
 * cannot reach disk by construction. On top of that, unpack is hardened against:
 *   - GZIP BOMBS — decompression is capped via `gunzipSync({ maxOutputLength })`,
 *     so an over-cap payload throws BEFORE it is materialized in memory.
 *   - oversized entries / too many entries — per-entry + entry-count caps.
 *   - traversal / weird names — every entry path is allowlist-validated.
 *   - non-file entry types — only regular files; symlink/hardlink/dir/dev rejected.
 *   - corruption — the USTAR header checksum is verified.
 *
 * Pack is DETERMINISTIC (sorted entries, zeroed mtime/uid/gid) so re-exporting an
 * unchanged site is byte-identical — trivial diffing + registry dedup. We only
 * ever emit short, controlled paths (`content/pages.ndjson`, `media/blobs/<sha>.<ext>`
 * — all < 100 bytes), so the USTAR 100-char name limit is never hit (no PAX/GNU
 * long-name extension needed).
 *
 * Pure Node (`node:zlib`) — no deps, no Next/server-only, fully unit-testable.
 *
 * SCOPE BOUNDARY: this codec enforces only ABSOLUTE structural caps (it never
 * trusts a manifest — the manifest is itself untrusted input). The declared-vs-
 * actual reconciliation (summed bytes / entry count vs manifest.uncompressedBytes
 * / manifest.counts), the manifest-read-first gate, Merkle/signature verify, the
 * per-blob sha256-name check and HTML sanitization all belong to the import
 * pipeline (it has the parsed manifest) — deliberately NOT here.
 */

export const BLOCK_SIZE = 512;

export type PackEntry = { path: string; bytes: Buffer };
export type UnpackLimits = { maxTotalBytes: number; maxEntries: number; maxEntryBytes: number };

/** A tar entry path safe to carry: relative, no traversal, allowlisted charset. */
export function isSafeEntryPath(path: string): boolean {
  if (!path || path.length > 255) return false;
  if (path.startsWith("/")) return false; // absolute
  if (path.includes("\0") || path.includes("\\")) return false; // NUL / Windows separators
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false; // empty / traversal
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return false; // allowlist (blocks ":", drive letters, spaces, …)
  }
  return true;
}

function writeOctal(buf: Buffer, value: number, off: number, len: number): void {
  // `len-1` octal digits, zero-padded, then a NUL terminator.
  const str = value.toString(8);
  if (str.length > len - 1) throw new Error(`value ${value} too large for a ${len}-byte octal field`);
  buf.write(str.padStart(len - 1, "0"), off, "ascii");
  buf[off + len - 1] = 0;
}

function readOctal(buf: Buffer, off: number, len: number): number {
  const raw = buf.subarray(off, off + len).toString("ascii").replace(/\0/g, " ").trim();
  if (raw === "") return 0;
  // Reject anything non-octal rather than letting parseInt silently truncate at
  // the first bad char — also rejects GNU base-256 size encoding (high-bit byte),
  // which this codec deliberately does not support.
  if (/[^0-7]/.test(raw)) return NaN;
  const n = parseInt(raw, 8);
  return Number.isFinite(n) ? n : NaN;
}

/** Build a 512-byte USTAR header with a valid checksum. `typeflag` is the raw
 *  byte (0x30 = '0' = regular file). Low-level + exported so tests can craft
 *  adversarial headers (traversal names, symlink typeflags). */
export function buildUstarHeader(name: string, size: number, typeflag = 0x30): Buffer {
  const h = Buffer.alloc(BLOCK_SIZE);
  h.write(name.slice(0, 100), 0, 100, "ascii"); // name
  writeOctal(h, 0o644, 100, 8); // mode
  writeOctal(h, 0, 108, 8); // uid
  writeOctal(h, 0, 116, 8); // gid
  writeOctal(h, size, 124, 12); // size
  writeOctal(h, 0, 136, 12); // mtime = 0 (deterministic)
  h.write("        ", 148, 8, "ascii"); // checksum placeholder = 8 spaces
  h[156] = typeflag; // typeflag
  h.write("ustar\0", 257, 6, "ascii"); // magic
  h.write("00", 263, 2, "ascii"); // version
  // Checksum = unsigned sum of all 512 bytes with the checksum field as spaces.
  let sum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  h[154] = 0; // NUL
  h[155] = 0x20; // space
  return h;
}

function isZeroBlock(block: Buffer): boolean {
  for (let i = 0; i < block.length; i++) if (block[i] !== 0) return false;
  return true;
}

function checksumOk(header: Buffer): boolean {
  const stored = readOctal(header, 148, 8);
  if (!Number.isFinite(stored)) return false;
  let sum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  return sum === stored;
}

function readName(header: Buffer): string {
  const cut = (off: number, len: number): string => {
    const slice = header.subarray(off, off + len);
    const nul = slice.indexOf(0);
    return slice.subarray(0, nul === -1 ? len : nul).toString("ascii");
  };
  const name = cut(0, 100);
  // We never SPLIT a name across the prefix field (our paths are < 100 bytes),
  // but recombine it when present so a foreign/standard tar is read correctly —
  // and so a `../` smuggled via prefix is seen by isSafeEntryPath, not bypassed.
  const prefix = cut(345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

/** Pack entries into a deterministic gzipped USTAR. Throws on an unsafe / too-long
 *  path (we never emit one, but fail loud rather than smuggle it). */
export function packSitePack(entries: PackEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const blocks: Buffer[] = [];
  for (const e of sorted) {
    if (!isSafeEntryPath(e.path)) throw new Error(`SitePack pack: unsafe entry path "${e.path}"`);
    if (Buffer.byteLength(e.path, "utf8") > 100) throw new Error(`SitePack pack: path too long for USTAR "${e.path}"`);
    blocks.push(buildUstarHeader(e.path, e.bytes.length));
    blocks.push(e.bytes);
    const pad = (BLOCK_SIZE - (e.bytes.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(BLOCK_SIZE * 2)); // two zero blocks = end of archive
  const gz = zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
  // Canonicalize the 10-byte gzip header so re-export is byte-identical ACROSS
  // HOSTS: zero MTIME (bytes 4–7) and pin the OS byte (9) to 0xff "unknown".
  // Node otherwise writes the host OS there (0x03 Linux / 0x13 macOS), which
  // would make the same site pack differently on a dev Mac vs Linux CI and break
  // registry dedup / diffing.
  gz[4] = 0;
  gz[5] = 0;
  gz[6] = 0;
  gz[7] = 0;
  gz[9] = 0xff;
  return gz;
}

/** Unpack a gzipped USTAR into an in-memory path→bytes map, enforcing every cap.
 *  Throws on a bomb, an over-cap entry, too many entries, a bad path, a non-file
 *  entry type, corruption, or truncation. */
export function unpackSitePack(gz: Buffer, limits: UnpackLimits): Map<string, Buffer> {
  let tar: Buffer;
  try {
    // maxOutputLength caps decompression — a gzip bomb throws here, before the
    // expanded bytes ever exist in memory.
    tar = zlib.gunzipSync(gz, { maxOutputLength: limits.maxTotalBytes });
  } catch {
    throw new Error(`SitePack: not valid gzip, or exceeds the ${limits.maxTotalBytes}-byte size cap.`);
  }

  const out = new Map<string, Buffer>();
  let off = 0;
  while (off + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(off, off + BLOCK_SIZE);
    if (isZeroBlock(header)) break; // end of archive
    // Cap entry count BEFORE doing any per-entry work (header parse / alloc).
    if (out.size >= limits.maxEntries) throw new Error(`SitePack: too many entries (max ${limits.maxEntries}).`);
    if (!checksumOk(header)) throw new Error("SitePack: corrupt tar header (checksum mismatch).");

    const name = readName(header);
    const typeflag = header[156];
    if (typeflag !== 0x30 && typeflag !== 0) {
      // 0x30 '0' / 0x00 = regular file. Anything else (symlink '2', hardlink '1',
      // dir '5', char/block/fifo) is rejected — they exist only to escape.
      throw new Error(`SitePack: unsupported entry type for "${name}" (only regular files).`);
    }
    if (!isSafeEntryPath(name)) throw new Error(`SitePack: unsafe entry path "${name}".`);
    // Reject DUPLICATE paths: a Map would silently overwrite (last wins), letting
    // a pack (a) smuggle physical entries past the unique-key maxEntries cap, and
    // (b) ship one copy that matches the manifest hash + a second that overwrites
    // it. We never emit duplicates, so a duplicate is hostile.
    if (out.has(name)) throw new Error(`SitePack: duplicate entry path "${name}".`);

    const size = readOctal(header, 124, 12); // USTAR size field is 12 bytes (124–135)
    if (!Number.isFinite(size) || size < 0) throw new Error(`SitePack: bad size for "${name}".`);
    if (size > limits.maxEntryBytes) throw new Error(`SitePack: entry "${name}" exceeds the ${limits.maxEntryBytes}-byte cap.`);

    const dataStart = off + BLOCK_SIZE;
    if (dataStart + size > tar.length) throw new Error(`SitePack: truncated entry "${name}".`);

    out.set(name, Buffer.from(tar.subarray(dataStart, dataStart + size)));
    off = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return out;
}
