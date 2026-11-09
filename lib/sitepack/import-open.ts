import { unpackSitePack, type UnpackLimits } from "@/lib/sitepack/archive";
import { SitePackManifestSchema, CONTAINER_SCHEMA_VERSION, type SitePackManifest } from "@/lib/sitepack/spec";
import { fileHashes, merkleRoot } from "@/lib/sitepack/integrity";

/**
 * SitePack import — the read-first SECURITY gate (ultraplan §5 steps 1–4).
 *
 * `openCartpack` is the boundary a possibly-HOSTILE downloaded pack must clear
 * before any of its content is trusted:
 *   1. unpack (the codec already hardened bomb / traversal / caps).
 *   2. read manifest.json FIRST, alone, and Zod-validate it — every later
 *      decision (compat, trust) reads only the validated manifest.
 *   3. INTEGRITY-verify: recompute the per-file hashes over every entry EXCEPT
 *      manifest.json (can't hash itself) + SIGNATURE (signs the manifest), and
 *      assert the file SET, every file's hash, AND the Merkle root match what the
 *      manifest claims. A single added/removed/tampered byte fails here — so a
 *      later P1 Ed25519 signature over the manifest transitively covers every byte.
 *
 * `compatGate` is the only HARD version stop (§5 step 4): a pack newer than the
 * engine, an engine too old, or a mode mismatch are refused; everything else is
 * migrated/degraded downstream, never rejected.
 *
 * Pure (gz Buffer in) — no DB, no I/O. Pairs with the export round-trip.
 */

export type OpenedPack = { manifest: SitePackManifest; entries: Map<string, Buffer> };

export function openCartpack(gz: Buffer, limits: UnpackLimits): OpenedPack {
  const entries = unpackSitePack(gz, limits);

  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) throw new Error("SitePack: missing manifest.json.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("SitePack: manifest.json is not valid JSON.");
  }
  const manifest = SitePackManifestSchema.parse(parsed); // throws on any schema violation

  // Recompute integrity over everything the manifest's integrity.files covers
  // (i.e. NOT manifest.json / SIGNATURE — the same exclusion the exporter used).
  const content = new Map(entries);
  content.delete("manifest.json");
  content.delete("SIGNATURE");
  const recomputed = fileHashes(content);

  const claimed = Object.keys(manifest.integrity.files).sort();
  const actual = Object.keys(recomputed).sort();
  if (claimed.length !== actual.length || claimed.some((p, i) => p !== actual[i])) {
    throw new Error("SitePack: file set does not match the manifest (a file was added or removed).");
  }
  for (const path of claimed) {
    if (recomputed[path] !== manifest.integrity.files[path]) {
      throw new Error(`SitePack: integrity mismatch — "${path}" was modified.`);
    }
  }
  if (merkleRoot(recomputed) !== manifest.integrity.merkleRoot) {
    throw new Error("SitePack: Merkle root mismatch — the pack was tampered with.");
  }

  // Declared-vs-actual reconciliation (§5 step 3 / §9 zip-bomb defense): the
  // manifest's uncompressedBytes is summed over the SAME exclusion set, so this is
  // symmetric. (counts-per-collection reconciliation needs parsed NDJSON → it's
  // the apply layer's job, against manifest.counts + KNOWN_COUNT_KEYS.)
  let actualBytes = 0;
  for (const bytes of content.values()) actualBytes += bytes.byteLength;
  if (actualBytes !== manifest.uncompressedBytes) {
    throw new Error("SitePack: declared uncompressedBytes does not match the actual content.");
  }

  // P0 does not verify signatures — drop the (unverified) SIGNATURE so a later
  // layer can't mistake its mere presence for a trust signal.
  entries.delete("SIGNATURE");
  return { manifest, entries };
}

export type EngineCompat = { contentSchemaVersion: number; mode: SitePackManifest["mode"] };
export type CompatResult = { ok: true } | { ok: false; reason: string };

export function compatGate(manifest: SitePackManifest, engine: EngineCompat, opts: { allowModeMismatch?: boolean } = {}): CompatResult {
  if (manifest.containerSchemaVersion > CONTAINER_SCHEMA_VERSION) {
    return { ok: false, reason: "This pack uses a newer envelope format than this Cartwright understands — update the engine." };
  }
  if (manifest.contentSchemaVersion > engine.contentSchemaVersion) {
    return { ok: false, reason: "This pack was made by a NEWER Cartwright — update the engine before restoring it." };
  }
  if (engine.contentSchemaVersion < manifest.compat.minEngineContentSchema) {
    return { ok: false, reason: `This engine is too old — it needs content-schema ≥ ${manifest.compat.minEngineContentSchema}.` };
  }
  if (manifest.mode !== engine.mode && !opts.allowModeMismatch) {
    // The "Teloz renders as a webshop" class of regression — hard-blocked unless
    // the owner explicitly overrides.
    return { ok: false, reason: `Mode mismatch: the pack is a "${manifest.mode}" site but this engine runs in "${engine.mode}" mode.` };
  }
  return { ok: true };
}
