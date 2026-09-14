/**
 * cartwright-module-v1 — the profile-materialization contract.
 *
 * A MODULE is anything the scaffold materializer can include or omit when it
 * cuts a profile — the four profiles nest, `site` ⊂ `managed-site` ⊂
 * `commerce` ⊂ `agentic` (owner-approved 2026-07-15), and are declared in
 * `modules/registry.ts`. The contract EXTENDS cartwright-plugin-v1:
 * every field a plugin manifest carries keeps its exact meaning here, and
 * the 9 shipped plugins register as modules with `kind: "plugin"`
 * unchanged. What v1 adds is the graph — which modules need which — plus
 * the generation inputs (deps/env/prisma fragments) the materializer
 * assembles a scaffold from ADDITIVELY, replacing the subtractive
 * prune-lists in the CLI.
 *
 * Same invariants as the plugin spec (safe repo paths, semver, loose parsing
 * for forward compatibility). CLIENT-SAFE — pure data + zod, no server-only.
 *
 * Fase-1 honesty: nothing at engine runtime reads this yet. The registry +
 * graph tests land first (byte-identical), the CLI materializer consumes it
 * in Fase 3 (cartwright-app). Do not wire runtime behavior to module kinds.
 */
import { z } from "zod";
import {
  safeRepoPath,
  PluginDepSchema,
  PluginFileSchema,
  RouteMountSchema,
  AdminNavEntrySchema,
} from "@/lib/plugins/spec";

export const MODULE_SCHEMA_ID = "cartwright-module-v1" as const;

/** Strict `major.minor.patch` — mirrored from the plugin spec (not exported there). */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

/**
 * `core`   — present in EVERY profile (app shell, design system, i18n routing).
 * `module` — an includable subsystem (db, auth, admin, webshop, mcp, acp, …).
 * `plugin` — one of the shipped cartwright-plugin-v1 plugins, wrapped as-is;
 *            install/uninstall semantics stay exactly the plugin system's.
 */
export const ModuleKindSchema = z.enum(["core", "module", "plugin"]);
export type ModuleKind = z.infer<typeof ModuleKindSchema>;

/** An env var the module needs — `.env.example` + `cartwright doctor` derive from these. */
export const ModuleEnvSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, { message: "env names are SCREAMING_SNAKE_CASE" }),
  required: z.boolean(),
  /** Example value for `.env.example` (never a real secret). */
  example: z.string().optional(),
  /** One line of guidance shown by doctor/docs. */
  docs: z.string().optional(),
});

/**
 * A seam replacement: this module swaps a declared-core seam file for its own
 * variant (the mechanism that makes a no-DB `site` profile possible — core
 * ships a static `lib/brand` seam, the `db` module replaces it with today's
 * DB-merged implementation, byte-identical for every profile that includes db).
 * `target` MUST be one of the seams the core module declares in `seams` —
 * the graph test enforces it.
 */
export const SeamReplacementSchema = z.object({
  target: safeRepoPath,
  with: safeRepoPath,
});

/**
 * Forward-compatible (`looseObject`) like the plugin spec: a v1 engine reads
 * manifests authored against later contract minors without exploding.
 */
export const ModuleManifestSchema = z.looseObject({
  schema: z.literal(MODULE_SCHEMA_ID),
  /** Graph id — kebab-case, unique across modules AND plugins. */
  slug: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, {
    message: "slug must be kebab-case",
  }),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(SEMVER_RE, { message: "must be a valid semver version" }),
  kind: ModuleKindSchema,
  /**
   * Graph edges: slugs of modules this one cannot function without. The
   * materializer resolves transitively; cycles are a validation error.
   * `core` never depends on anything (the root); plugins may depend on
   * modules (e.g. every current plugin needs `db` + `admin`).
   */
  dependsOn: z.array(z.string().min(1)).default([]),
  /**
   * Every file the module owns (repo-relative). The union of the resolved
   * module set's `files` IS the scaffold. Fase-1/2 manifests point at
   * EXISTING paths — no file moves are part of this contract.
   */
  files: z.array(PluginFileSchema).default([]),
  /** npm deps the module carries beyond the core baseline. */
  deps: z.array(PluginDepSchema).default([]),
  devDeps: z.array(PluginDepSchema).default([]),
  /** Env contract — drives generated .env.example + doctor checks. */
  env: z.array(ModuleEnvSchema).default([]),
  /**
   * Prisma schema fragment the module contributes. Unlike plugin-v1 (which
   * only surfaces it as a note), the materializer ASSEMBLES prisma/schema.prisma
   * from base + included fragments — only when the `db` module is in the set.
   */
  prismaFragment: z.string().min(1).optional(),
  routeMounts: z.array(RouteMountSchema).optional(),
  adminNav: z.array(AdminNavEntrySchema).optional(),
  /**
   * Seam files this module DECLARES as replaceable (core-only in practice:
   * the small set of files that have per-profile variants, e.g. the brand
   * identity resolver). Non-core modules leave this empty and use `replaces`.
   */
  seams: z.array(safeRepoPath).default([]),
  /** Seam replacements this module performs (targets must be declared seams). */
  replaces: z.array(SeamReplacementSchema).default([]),
  /** Test files that travel with the module — profile CI runs exactly these. */
  tests: z.array(safeRepoPath).default([]),
  /** Docs that travel with the module (kills docs-describe-pruned-features drift). */
  docs: z.array(safeRepoPath).default([]),
  /**
   * For kind:"plugin": the brand.features flag that gates it at runtime
   * (verbatim from the plugin manifest). Modules are compile-time set members,
   * not runtime flags, so this stays optional.
   */
  flag: z.string().min(1).optional(),
  /**
   * Honesty ledger (Fase-2/B2): places where the module's inventory does NOT
   * yet match the decided architecture on disk — cross-module static imports,
   * coupled subpages, etc. Each entry names the deviation and the phase that
   * resolves it. The materializer treats these as blockers-to-verify, never
   * as silent permissions.
   */
  knownDeviations: z.array(z.string().min(1)).optional(),
});

export type CartwrightModuleManifest = z.infer<typeof ModuleManifestSchema>;

export function parseModuleManifest(input: unknown): CartwrightModuleManifest {
  const result = ModuleManifestSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Invalid cartwright-module-v1 manifest${where}: ${first?.message}`);
  }
  return result.data;
}

/** A named profile = core + these module slugs (additive supersets by design). */
export const ProfileDefinitionSchema = z.looseObject({
  schema: z.literal("cartwright-profile-v1"),
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().min(1),
  modules: z.array(z.string().min(1)),
  /** Older names that must keep working forever (owner decision 2026-07-15). */
  aliases: z.array(z.string().min(1)).default([]),
});
export type ProfileDefinition = z.infer<typeof ProfileDefinitionSchema>;

/**
 * Resolve a module set transitively from requested slugs. Throws on unknown
 * slugs; cycle-safety comes from the registry test (validateModuleGraph),
 * so resolution here can be a simple worklist.
 *
 * `core` is ALWAYS seeded (codex review fold-in): the profile contract is
 * "core + these module slugs", so a materializer unioning the resolved set's
 * files must never be able to omit the app shell — `site` resolves to
 * exactly {core}, never the empty set.
 */
export function resolveModuleSet(
  requested: readonly string[],
  all: ReadonlyMap<string, CartwrightModuleManifest>,
): Set<string> {
  const out = new Set<string>();
  const queue = ["core", ...requested];
  while (queue.length) {
    const slug = queue.pop()!;
    if (out.has(slug)) continue;
    const m = all.get(slug);
    if (!m) throw new Error(`Unknown module in profile: ${slug}`);
    out.add(slug);
    queue.push(...m.dependsOn);
  }
  return out;
}

/** Pure graph validation — the registry test calls this; the CLI will too. */
export function validateModuleGraph(
  modules: readonly CartwrightModuleManifest[],
): string[] {
  const errors: string[] = [];
  const bySlug = new Map(modules.map((m) => [m.slug, m]));
  if (bySlug.size !== modules.length) {
    const seen = new Set<string>();
    for (const m of modules) {
      if (seen.has(m.slug)) errors.push(`duplicate module slug: ${m.slug}`);
      seen.add(m.slug);
    }
  }

  // Unknown dependsOn targets.
  for (const m of modules) {
    for (const dep of m.dependsOn) {
      if (!bySlug.has(dep)) errors.push(`${m.slug}: dependsOn unknown module "${dep}"`);
    }
  }

  // Cycle detection (iterative DFS, three-color).
  const color = new Map<string, 0 | 1 | 2>();
  const visit = (slug: string, stack: string[]): void => {
    const c = color.get(slug) ?? 0;
    if (c === 1) {
      errors.push(`dependency cycle: ${[...stack, slug].join(" → ")}`);
      return;
    }
    if (c === 2) return;
    color.set(slug, 1);
    for (const dep of bySlug.get(slug)?.dependsOn ?? []) {
      if (bySlug.has(dep)) visit(dep, [...stack, slug]);
    }
    color.set(slug, 2);
  };
  for (const m of modules) visit(m.slug, []);

  // Every `replaces.target` must be a seam DECLARED by some module in the set.
  const declaredSeams = new Set(modules.flatMap((m) => m.seams));
  for (const m of modules) {
    for (const r of m.replaces) {
      if (!declaredSeams.has(r.target)) {
        errors.push(`${m.slug}: replaces undeclared seam "${r.target}"`);
      }
    }
  }

  // core is the root: exactly one, no dependencies.
  const cores = modules.filter((m) => m.kind === "core");
  if (cores.length !== 1) errors.push(`expected exactly 1 core module, got ${cores.length}`);
  if (cores[0] && cores[0].dependsOn.length > 0) {
    errors.push(`core module must not depend on anything`);
  }

  return errors;
}
