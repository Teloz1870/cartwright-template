/**
 * Engine-side plugin install/uninstall — the minimal, honest v1 mechanics.
 *
 * v1 plugins are in-repo modules gated by a brand.features flag, so:
 *
 *  - "installed"  = every manifest-declared file exists on disk (a full-profile
 *    engine always has them; a pruned light scaffold may not).
 *  - "enabled"    = the flag resolves true (brand.config default merged with
 *    the DB override, via getBrand()).
 *  - install      = write any manifest files that carry inline `contents` and
 *    are absent (never overwrites), then flip the flag ON through the same
 *    audited, allowlisted path as /admin/features (applyFeatureOverride).
 *    Files that are missing AND have no inline contents cannot be
 *    materialised by the engine — that is the `npx cartwright add <slug>`
 *    CLI's job (cartwright-app follow-up); we say so instead of pretending.
 *  - uninstall    = flip the flag OFF. v1 deliberately does NOT delete code:
 *    the flag-off state is the well-tested "byte-identical storefront" path,
 *    and deletion belongs to scaffold-time pruning, not a live shop.
 *  - prismaFragment is surfaced as a "run pnpm db:push" note — the engine
 *    never mutates the schema at runtime.
 */
import "server-only";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getBrand } from "@/lib/brand";
import { applyFeatureOverride } from "@/lib/feature-flags/apply";
import type { AuditActor } from "@/lib/audit";
import { PLUGINS, getPluginManifest } from "@/plugins/registry";
import type { CartwrightPluginManifest } from "./spec";

export type PluginState = {
  slug: string;
  name: string;
  description: string;
  version: string;
  flag: string;
  /** Flag resolves true right now (config default + DB override). */
  enabled: boolean;
  /** Every manifest-declared file exists on disk. */
  installed: boolean;
  missingFiles: string[];
  hasPrismaFragment: boolean;
  adminNav: { href: string; label: string }[];
};

export type PluginActionResult =
  | { ok: true; slug: string; enabled: boolean; notes: string[] }
  | { ok: false; error: string };

const ROOT = process.cwd();

/** Resolve a manifest-safe repo-relative path, defensively re-checking escape. */
function resolveRepoPath(rel: string): string {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) {
    throw new Error(`Path escapes project root: ${rel}`);
  }
  return abs;
}

/**
 * File-presence checks only make sense when the source tree is on disk
 * (dev / a scaffold checkout). In a deployed serverless bundle the sources
 * aren't traced — but the registry import compiled in, which IS the proof
 * the plugin's code shipped. Probe for the registry file itself.
 */
function sourceTreePresent(): boolean {
  return existsSync(path.join(ROOT, "plugins", "registry.ts"));
}

export function missingPluginFiles(manifest: CartwrightPluginManifest): string[] {
  if (!sourceTreePresent()) return [];
  return manifest.files.filter((f) => !existsSync(resolveRepoPath(f.path))).map((f) => f.path);
}

/** Install state for every registered plugin (drives /api/admin/plugins GET). */
export async function getPluginStates(): Promise<PluginState[]> {
  const brand = await getBrand();
  return PLUGINS.map((m) => {
    const missing = missingPluginFiles(m);
    return {
      slug: m.slug,
      name: m.name,
      description: m.description,
      version: m.version,
      flag: m.flag,
      enabled: Boolean((brand.features as Record<string, boolean>)[m.flag]),
      installed: missing.length === 0,
      missingFiles: missing,
      hasPrismaFragment: Boolean(m.prismaFragment),
      adminNav: m.adminNav ?? [],
    };
  });
}

/**
 * Materialise manifest files that are absent. Only files with inline
 * `contents` can be written; existing files are NEVER touched. Returns the
 * paths written and the paths that remain missing (registry/CLI territory).
 */
export function applyPluginFiles(manifest: CartwrightPluginManifest): {
  written: string[];
  unresolvable: string[];
} {
  const written: string[] = [];
  const unresolvable: string[] = [];
  // Deployed bundle (no source tree): compiled-in code is the truth — nothing
  // to verify or write.
  if (!sourceTreePresent()) return { written, unresolvable };
  for (const file of manifest.files) {
    const abs = resolveRepoPath(file.path);
    if (existsSync(abs)) continue;
    if (file.contents === undefined) {
      unresolvable.push(file.path);
      continue;
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, file.contents, "utf-8");
    written.push(file.path);
  }
  return { written, unresolvable };
}

export async function installPlugin(slug: string, actor: AuditActor): Promise<PluginActionResult> {
  const manifest = getPluginManifest(slug);
  if (!manifest) return { ok: false, error: `Unknown plugin '${slug}'.` };

  const notes: string[] = [];
  const { written, unresolvable } = applyPluginFiles(manifest);
  if (written.length > 0) {
    notes.push(`Wrote ${written.length} file(s): ${written.join(", ")}`);
  }
  if (unresolvable.length > 0) {
    return {
      ok: false,
      error:
        `Plugin files are missing from this scaffold and the manifest carries no inline contents: ` +
        `${unresolvable.join(", ")}. Re-add them with \`npx cartwright add ${slug}\` (CLI) or from the engine repo.`,
    };
  }

  const result = await applyFeatureOverride(manifest.flag, true, actor);
  if (!result.ok) return { ok: false, error: result.error };

  if (manifest.prismaFragment) {
    notes.push(
      "This plugin declares a Prisma schema fragment — run `pnpm db:push` before relying on it.",
    );
  }
  return { ok: true, slug, enabled: true, notes };
}

/** v1 uninstall = disable the flag. Files stay (scaffold-time pruning owns deletion). */
export async function uninstallPlugin(
  slug: string,
  actor: AuditActor,
): Promise<PluginActionResult> {
  const manifest = getPluginManifest(slug);
  if (!manifest) return { ok: false, error: `Unknown plugin '${slug}'.` };

  const result = await applyFeatureOverride(manifest.flag, false, actor);
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    slug,
    enabled: false,
    notes: ["Flag disabled. v1 keeps the plugin's files in place (flag-off is byte-identical)."],
  };
}
