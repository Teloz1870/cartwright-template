import { createHash } from "node:crypto";

/**
 * SitePack integrity — content-addressed hashing + a Merkle root over every file
 * (ultraplan §3.2). The manifest carries `integrity.files` (per-file sha256) and
 * `integrity.merkleRoot`; in P1 the detached Ed25519 SIGNATURE signs the manifest
 * (which embeds the root), so the signature transitively covers every byte.
 *
 * Pure (`node:crypto`) — no DB, no I/O. Deterministic (sorted leaves) so the root
 * is byte-stable across re-exports of an unchanged site.
 */

/**
 * sha256 of bytes, in the manifest's `"sha256-<hex>"` form — for `integrity.files`
 * + `merkleRoot` ONLY.
 *
 * ⚠️ This is NOT the media CONTENT-ADDRESS form. `media/blobs/<sha>.<ext>`
 * filenames and the `assetSha256` join keys use BARE hex (matching
 * `MediaAsset.sha256` + `lib/media/asset.ts:computeSha256` + `findOrCreateBySha256`).
 * Mixing the two would make the blob filename `media/blobs/sha256-<hex>` and break
 * the importer's hash-verify + the asset lookup. Use `computeSha256` (bare hex)
 * for blob names; use this only to fill the manifest's integrity hashes.
 */
export function sha256(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Per-file hashes for the manifest's `integrity.files`. Pass the content / media
 * / look entries — NOT `manifest.json` itself (it embeds these) and NOT
 * `SIGNATURE` (it signs the manifest).
 */
export function fileHashes(entries: Map<string, Buffer>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of [...entries.keys()].sort()) {
    out[path] = sha256(entries.get(path)!);
  }
  return out;
}

/**
 * A binary Merkle root over the per-file hashes (leaves sorted by path → stable).
 * Any change to any file's bytes changes a leaf → changes the root. The empty
 * set hashes to the digest of zero bytes. Odd levels duplicate the last node
 * (standard). Returns the `"sha256-<hex>"` form.
 */
export function merkleRoot(files: Record<string, string>): string {
  const leaves: Uint8Array[] = Object.keys(files)
    .sort()
    .map((path) => createHash("sha256").update(`${path}\0${files[path]}`).digest());
  if (leaves.length === 0) return sha256(Buffer.alloc(0));

  let level: Uint8Array[] = leaves;
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      next.push(createHash("sha256").update(Buffer.concat([a, b])).digest());
    }
    level = next;
  }
  return `sha256-${Buffer.from(level[0]).toString("hex")}`;
}
