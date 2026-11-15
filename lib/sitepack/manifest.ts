import {
  SITEPACK_SCHEMA,
  CONTAINER_SCHEMA_VERSION,
  CONTENT_SCHEMA_VERSION,
  SECTION_SPEC_VERSIONS,
  SitePackManifestSchema,
  type SitePackManifest,
} from "@/lib/sitepack/spec";
import { fileHashes, merkleRoot } from "@/lib/sitepack/integrity";

/**
 * SitePack manifest builder (ultraplan §3.2). Assembles the read-first manifest
 * from gathered export parts, computes integrity over the pack's files, and
 * self-validates against SitePackManifestSchema before returning — so a malformed
 * manifest fails at export, never at a downloader's import.
 *
 * Pure: no DB, no I/O, no Date.now (the caller stamps `createdAt` + `id`).
 */

export type BuildManifestInput = {
  id: string; // ULID-ish, stable across re-exports (caller-provided)
  name: string;
  createdAt: string; // ISO 8601, caller-stamped (no Date.now in pure code)
  exporter: {
    version: string; // from .cartwright/release.json (may be "0.0.0-source")
    channel: "stable" | "next" | "source";
    commit?: string;
    gitRef?: string;
  };
  // Default to the engine constant (correct at v1). Provided as inputs so the
  // `sitepack migrate` escape hatch (§6.6) can stamp a target contentSchemaVersion,
  // and so a pack's minEngine floor can be computed separately from the cursor
  // (§6.5) once additive evolution begins — without forking buildManifest.
  contentSchemaVersion?: number;
  minEngineContentSchema?: number;
  mode: SitePackManifest["mode"];
  defaultLocale: string;
  locales: string[];
  designRef: { slug: string; kind: "data" | "code"; version?: string };
  pluginsRequired?: string[];
  featuresRequested?: string[];
  featuresRequired?: string[];
  containsCode?: boolean;
  counts: Record<string, number>;
  /** Content/media/look entries (NOT manifest.json, NOT SIGNATURE) → drives
   *  integrity + uncompressedBytes. */
  entries: Map<string, Buffer>;
  license?: string;
  author?: { handle?: string; keyId?: string };
};

export function buildManifest(input: BuildManifestInput): SitePackManifest {
  // The manifest's integrity is over the OTHER files; manifest.json (which can't
  // hash itself) and SIGNATURE (which signs the manifest) are added to the pack
  // AFTER. Enforce the contract so a caller can't create a self-referential
  // integrity that every import would then fail to verify.
  if (input.entries.has("manifest.json") || input.entries.has("SIGNATURE")) {
    throw new Error("buildManifest: entries must NOT include manifest.json or SIGNATURE");
  }
  const files = fileHashes(input.entries);
  const root = merkleRoot(files);
  let uncompressedBytes = 0;
  for (const bytes of input.entries.values()) uncompressedBytes += bytes.byteLength;

  const manifest = {
    schema: SITEPACK_SCHEMA,
    containerSchemaVersion: CONTAINER_SCHEMA_VERSION,
    contentSchemaVersion: input.contentSchemaVersion ?? CONTENT_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    exporter: {
      engine: "cartwright" as const,
      version: input.exporter.version,
      channel: input.exporter.channel,
      commit: input.exporter.commit ?? "",
      gitRef: input.exporter.gitRef ?? "",
    },
    compat: {
      // In the additive-forward-compat model a vN pack restores on any engine
      // ≥ N; minEngineContentSchema is the separate floor for the rare "needs a
      // specific newer engine" case. At v1 it equals the cursor.
      minEngineContentSchema: input.minEngineContentSchema ?? CONTENT_SCHEMA_VERSION,
      sectionSpecVersions: { ...SECTION_SPEC_VERSIONS },
    },
    mode: input.mode,
    defaultLocale: input.defaultLocale,
    locales: input.locales,
    designRef: {
      slug: input.designRef.slug,
      kind: input.designRef.kind,
      version: input.designRef.version ?? "0.0.0",
    },
    pluginsRequired: input.pluginsRequired ?? [],
    featuresRequested: input.featuresRequested ?? [],
    featuresRequired: input.featuresRequired ?? [],
    containsCode: input.containsCode ?? false,
    counts: input.counts,
    uncompressedBytes,
    integrity: { algo: "sha256" as const, files, merkleRoot: root },
    license: input.license ?? "proprietary",
    author: { handle: input.author?.handle ?? "admin", keyId: input.author?.keyId ?? "" },
  };

  // Fail closed: a manifest that won't re-parse must never ship.
  return SitePackManifestSchema.parse(manifest);
}

// Recursively sort object keys so JSON.stringify is byte-stable at EVERY level
// (a replacer-array would wrongly filter nested keys, not just reorder them).
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON for `manifest.json` (stable key order at every level) — the
 *  bytes the P1 signature signs and the importer re-hashes. */
export function canonicalManifestJson(manifest: SitePackManifest): Buffer {
  return Buffer.from(JSON.stringify(canonicalize(manifest)), "utf8");
}
