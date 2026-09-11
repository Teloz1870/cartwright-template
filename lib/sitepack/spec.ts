import { z } from "zod";

/**
 * SitePack — the format contract (P0 foundation).
 *
 * A SitePack (`.cartpack`) is a complete, portable snapshot of a built Cartwright
 * site — design + content + media + config — that can be restored onto a NEWER
 * engine version. This module is the pure contract: version axes + the manifest
 * Zod. No I/O, no DB, no server-only — safe to import anywhere and fully
 * unit-testable.
 *
 * Two independent version axes:
 *  - CONTAINER_SCHEMA_VERSION — the envelope/format. Bumps almost never.
 *  - CONTENT_SCHEMA_VERSION — the MONOTONIC migration cursor. The import runs the
 *    ladder `pack.contentSchemaVersion+1 … engine.CONTENT_SCHEMA_VERSION`. Compared
 *    as INTEGERS, never as version strings — so `release.json`'s "0.0.0-source"
 *    never enters a compatibility decision.
 */

export const SITEPACK_SCHEMA = "cartwright-sitepack-v1" as const;

/** Envelope format version. */
export const CONTAINER_SCHEMA_VERSION = 1;

/** The engine's current content-migration cursor. Bump + add a migrator when an
 *  exported shape changes (enforced by the golden-corpus CI gate, ultraplan §6.4). */
export const CONTENT_SCHEMA_VERSION = 1;

/** Per-section spec versions — each governed surface evolves independently. */
export const SECTION_SPEC_VERSIONS = {
  pageLayout: 1,
  product: 1,
  category: 1,
  media: 1,
  branding: 1,
  genome: 1,
  translations: 1,
} as const;

export type SectionKey = keyof typeof SECTION_SPEC_VERSIONS;

// The count keys the exporter populates and the importer reconciles (the
// declared-vs-actual gate, §5 step 3). Shared so the two can't drift on which
// collections to count. `counts` stays a free-form record in the schema for
// forward-compat, but these are the canonical keys.
export const KNOWN_COUNT_KEYS = ["pages", "categories", "products", "services", "posts", "mediaAssets", "variants", "productMedia"] as const;
export type CountKey = (typeof KNOWN_COUNT_KEYS)[number];

// The three operating modes a pack can carry. mode is HARD-GATED on import — a
// webshop pack cannot be restored onto a website-mode engine without an explicit
// override (prevents the "Teloz renders as a webshop" identity regression).
export const SITEPACK_MODES = ["website", "webshop", "agent-marketplace"] as const;

/** Exporter provenance — informational only; the machine never trusts `version`
 *  for migration (that's the integer cursor's job). `gitRef` is the fallback
 *  identity when a source checkout reports `0.0.0-source`. */
export const ExporterSchema = z.object({
  engine: z.literal("cartwright"),
  version: z.string(), // may be "0.0.0-source"
  channel: z.enum(["stable", "next", "source"]),
  commit: z.string().default(""),
  gitRef: z.string().default(""),
});

export const CompatSchema = z.object({
  // Oldest engine content-schema cursor that can restore this pack.
  minEngineContentSchema: z.number().int().min(1),
  sectionSpecVersions: z.record(z.string(), z.number().int().min(1)),
});

export const IntegritySchema = z.object({
  algo: z.literal("sha256"),
  files: z.record(z.string(), z.string()),
  merkleRoot: z.string(),
});

/** `manifest.json` — read FIRST, alone, before any trust/compat/unpack decision.
 *  Small, fully validated, signed. The AI's compatibility map AND the security
 *  gate (declared bytes/counts checked against the actual stream on unpack). */
export const SitePackManifestSchema = z.object({
  schema: z.literal(SITEPACK_SCHEMA),
  containerSchemaVersion: z.number().int().min(1),
  contentSchemaVersion: z.number().int().min(1),
  id: z.string().min(1), // ULID, stable across re-exports
  name: z.string().min(1).max(120),
  createdAt: z.string(), // ISO 8601 (stamped by the caller — no Date.now in pure code)

  exporter: ExporterSchema,
  compat: CompatSchema,

  mode: z.enum(SITEPACK_MODES),
  defaultLocale: z.string().min(2).max(10),
  locales: z.array(z.string().min(2).max(10)).min(1),

  designRef: z.object({
    slug: z.string().min(1),
    kind: z.enum(["data", "code"]),
    version: z.string().default("0.0.0"),
  }),
  pluginsRequired: z.array(z.string()).default([]),
  featuresRequested: z.array(z.string()).default([]),
  featuresRequired: z.array(z.string()).default([]),
  // Read FIRST, before unpacking — the trust signal a registry uses to gate a
  // download ("this pack carries bespoke TSX you must review"). Lives in the
  // manifest, never discovered after extracting design/source/ (ultraplan §9).
  containsCode: z.boolean().default(false),

  counts: z.record(z.string(), z.number().int().min(0)),
  uncompressedBytes: z.number().int().min(0),
  integrity: IntegritySchema,

  license: z.string().default("proprietary"),
  author: z
    .object({ handle: z.string().default("admin"), keyId: z.string().default("") })
    .default({ handle: "admin", keyId: "" }),
})
  // An internally-inconsistent manifest must fail the gate, not parse.
  .refine((m) => m.locales.includes(m.defaultLocale), {
    message: "defaultLocale must be one of locales",
    path: ["defaultLocale"],
  })
  // Every known section MUST have a spec version (extras allowed for forward-
  // compat); a truncated map would leave the migrator with an undefined cursor.
  .refine((m) => Object.keys(SECTION_SPEC_VERSIONS).every((k) => k in m.compat.sectionSpecVersions), {
    message: "compat.sectionSpecVersions is missing a known section key",
    path: ["compat", "sectionSpecVersions"],
  });

export type SitePackManifest = z.infer<typeof SitePackManifestSchema>;

// NOTE: the 6-token brand palette schema is NOT redefined here — when the
// fallbackPalette lands (export PR) it reuses `paletteSchema` from
// lib/compositions/spec.ts (the embedded `look` already owns the palette), so
// the two can't drift.
