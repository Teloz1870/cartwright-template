/**
 * B3 site-profile import audit — the mechanical falsifier for "a no-DB `site`
 * materialization compiles".
 *
 * Simulates the B3 materializer's file set WITHOUT materializing:
 *
 *   included = repo files − (files claimed by modules OUTSIDE the profile set)
 *   seam targets read their `.static` sibling's content (the copy the
 *   materializer performs), and every OTHER excluded-module file is gone.
 *
 * Then BFS-walks the import graph from every Next.js entry file in the
 * included set and reports each import that resolves INTO an excluded path —
 * exactly the set of `tsc` errors a materialized scaffold would hit.
 *
 * Usage:
 *   pnpm exec tsx scripts/site-profile-audit.ts            # site profile
 *   pnpm exec tsx scripts/site-profile-audit.ts commerce   # any profile name
 *   pnpm exec tsx scripts/site-profile-audit.ts site --with contact-form
 *
 * Exit code 1 when violations exist — tests/unit/site-profile-imports.test.ts
 * wraps the same walker; this CLI form is for interactive triage.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// Registry import — pure data (client-safe), so tsx can load it directly.
import { MODULES, getProfile } from "../modules/registry";

type Violation = {
  importer: string;
  specifier: string;
  resolved: string;
  owner: string;
};

export type AuditResult = {
  profile: string;
  includedModules: string[];
  violations: Violation[];
  walked: number;
};

/**
 * All repo-relative source files. Prefers `git ls-files` (respects
 * .gitignore); falls back to a filesystem walk when the tree isn't a git
 * repo — a `create-cartwright --no-git` scaffold runs this test in CI
 * (the release scaffold-gate) without any .git directory.
 */
const WALK_IGNORE = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  ".turbo",
  "coverage",
  ".mail-previews",
  // Generated artifacts a scaffold accumulates before tests run
  // (postinstall `prisma generate` emits app/generated/prisma).
  "generated",
]);

function walkFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir || "."), { withFileTypes: true })) {
    if (WALK_IGNORE.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function listRepoFiles(): string[] {
  try {
    const out = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    const files = out.split("\n").filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // No git (e.g. a --no-git scaffold) — walk the tree instead.
  }
  return walkFiles("");
}

const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Is `file` inside the claimed path `claim` (claim = file or directory root)? */
function isUnder(file: string, claim: string): boolean {
  return file === claim || file.startsWith(claim.endsWith("/") ? claim : claim + "/");
}

/** Next.js special entry files — the compile roots of a materialized scaffold. */
const ENTRY_RE =
  /(^|\/)(page|layout|route|template|default|not-found|error|global-error|loading|sitemap|robots|manifest|opengraph-image|icon|apple-icon)\.(ts|tsx)$/;

// import/export-from + dynamic import + require specifiers.
const IMPORT_RE =
  /(?:import|export)\s+[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[^.\w])require\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

/**
 * Bare specifiers the site materializer PRUNES from package.json — an
 * included file importing one of these (even type-only) is a tsc break in
 * the materialized scaffold. Keep in sync with SITE_PRUNED_DEPENDENCIES in
 * cartwright-app apps/cli/src/materializer.ts (B4 unifies via module deps).
 */
const SITE_FORBIDDEN_BARE = [
  "prisma",
  "@prisma/",
  "@libsql/",
  "next-auth",
  "@auth/",
  "bcryptjs",
  "stripe",
  "@stripe/",
  "ai",
  "@ai-sdk/",
  "@google/genai",
  "resend",
  "@vercel/blob",
  "@upstash/",
  "three",
  "@playwright/",
];

function isForbiddenBare(spec: string): boolean {
  return SITE_FORBIDDEN_BARE.some(
    (f) =>
      spec === f ||
      (f.endsWith("/") ? spec.startsWith(f) : spec.startsWith(`${f}/`)),
  );
}

/** Sentinel for a local specifier that resolves to NO file (broken import). */
export const UNRESOLVED = "!unresolved";

function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.join(path.dirname(fromFile), spec);
  else return null; // bare = node_modules — pruned deps are checked separately
  base = path.normalize(base).replace(/\\/g, "/");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c;
  }
  // A local import that matches nothing on disk is itself a break (codex
  // #385 fold-in: silently skipping these let a seam variant import a
  // non-existent module and still pass the "compiles" falsifier).
  return UNRESOLVED;
}

export function auditProfile(
  profileName: string,
  opts: { withModules?: readonly string[] } = {},
): AuditResult {
  const profile = getProfile(profileName);
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);
  // The materializer always seeds core. Optional `--with` modules are passed
  // explicitly — the test suite audits site BOTH bare and with contact-form
  // (codex #385 fold-in: always including the form hid core imports that
  // only the optional module satisfies).
  const included = new Set(["core", ...(opts.withModules ?? []), ...profile.modules]);

  // Claims of every EXCLUDED module → the paths the materializer deletes.
  const ownerByClaim = new Map<string, string>();
  for (const m of MODULES) {
    if (included.has(m.slug)) continue;
    for (const f of m.files) ownerByClaim.set(f.path, m.slug);
  }

  // Seam substitution: for every seam DECLARED by an included module whose
  // providing module is EXCLUDED, the materializer copies the sibling
  // `.static` variant over the target — so the target file survives in the
  // scaffold (with the static content) even when an excluded module owns the
  // on-disk (db) version. Model both halves: (a) reading <target> yields the
  // static variant's content, (b) the target is NOT an excluded path.
  const seamContent = new Map<string, string>(); // target -> substitute file
  for (const m of MODULES) {
    if (!included.has(m.slug)) continue;
    for (const seam of m.seams) {
      const providers = MODULES.filter(
        (x) => x.slug !== m.slug && x.replaces.some((r) => r.target === seam),
      );
      const providerIncluded = providers.some((p) => included.has(p.slug));
      if (providerIncluded) continue; // on-disk content stays
      const staticVariant = seam.replace(/(\.[a-z]+)$/i, ".static$1");
      seamContent.set(seam, staticVariant);
      ownerByClaim.delete(seam); // materializer keeps the target file
    }
  }

  const repoFiles = listRepoFiles();
  const excludedOwner = (file: string): string | undefined => {
    // Seam targets survive materialization (static copy) even when the
    // provider's DIRECTORY claim contains them (e.g. the info page inside
    // pages-db's app/[locale]/info claim).
    if (seamContent.has(file)) return undefined;
    for (const [claim, owner] of ownerByClaim) if (isUnder(file, claim)) return owner;
    return undefined;
  };

  // Registry-codemod targets: the materializer rewrites these files with the
  // CLI's proven entry-removal codemods (profile-light.ts) instead of seam
  // variants — imports from them into excluded design packs / plugin
  // manifests are stripped by the codemod, so the walker ignores them.
  const CODEMOD_TARGETS = new Set([
    "designs/index.ts",
    "designs/options.ts",
    "plugins/registry.ts",
    "components/svg-items/design-motifs.ts",
  ]);

  // Materializer-deleted zones (mirror of the CLI's SITE_PRUNED_ZONES +
  // SITE_PRUNED_SCRIPTS in cartwright-app apps/cli/src/materializer.ts):
  // the engine test-suite and db-coupled scripts assume the full tree —
  // module-travelling tests are a B4 fill-in. tests/setup + tests/shims stay
  // (pure env stubs the kept vitest config loads).
  const MATERIALIZER_DELETED = [
    "tests/unit/",
    "tests/e2e/",
    "playwright.config.ts",
    "prisma.config.ts",
    "scripts/capture-gallery.mjs",
    "scripts/dev-screenshot.mjs",
    "scripts/admin-reset.ts",
    "scripts/backfill-embeddings.ts",
    "scripts/backfill-media-assets.ts",
    "scripts/backup-turso.ts",
    "scripts/db-setup.ts",
    "scripts/design-import.ts",
    "scripts/gen-marketplace-manifests.ts",
    "scripts/migrate-turso.ts",
    "scripts/p2k-scan.ts",
    "scripts/pgvector-setup.ts",
    "scripts/publish-agent-card.ts",
    "scripts/restore-turso.ts",
    "scripts/build-registry-source.ts",
  ];
  const isMaterializerDeleted = (f: string) =>
    MATERIALIZER_DELETED.some((z) => (z.endsWith("/") ? f.startsWith(z) : f === z));

  const includedFiles = repoFiles.filter(
    (f) => !isMaterializerDeleted(f) && !excludedOwner(f),
  );
  const entries = includedFiles.filter(
    (f) =>
      (f.startsWith("app/") && ENTRY_RE.test(f)) ||
      f === "proxy.ts" ||
      f === "i18n/request.ts",
  );

  // `tsc`/`next build` typecheck EVERY file in the materialized tree, not
  // just what routes reach — so the audit scans ALL included code files.
  // The BFS-from-entries set is still computed so unreachable offenders can
  // be triaged separately (dead-in-profile code wants a claim, not a variant).
  const violations: Violation[] = [];
  const includedSet = new Set(includedFiles);

  const importsOf = (file: string): { spec: string; resolved: string | null }[] => {
    const readFrom = seamContent.get(file) ?? file;
    const abs = path.join(ROOT, readFrom);
    if (!existsSync(abs)) {
      return [{ spec: `(missing seam variant ${readFrom})`, resolved: readFrom }];
    }
    // Strip comments so doc examples (e.g. `import … from "@/lib/three/types"`
    // in a JSDoc block) never register as imports. Block comments + full-line
    // `//` comments only — inline `//` is left alone to keep URL strings safe.
    const src = readFileSync(abs, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const out: { spec: string; resolved: string | null }[] = [];
    // NOTE: specifiers in a seam's static variant resolve relative to the
    // TARGET location — the materializer copies the content over the target.
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (!spec || spec === "server-only" || spec === "client-only") continue;
      out.push({ spec, resolved: resolveSpecifier(file, spec) });
    }
    return out;
  };

  // Reachability (for triage labelling only).
  const reachable = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (reachable.has(file) || !CODE_EXT.test(file)) continue;
    reachable.add(file);
    for (const { resolved } of importsOf(file)) {
      if (!resolved || !CODE_EXT.test(resolved)) continue;
      if (excludedOwner(resolved)) continue; // don't walk into excluded files
      if (!reachable.has(resolved)) queue.push(resolved);
    }
  }

  for (const file of includedFiles) {
    if (!CODE_EXT.test(file)) continue;
    const codemodded = CODEMOD_TARGETS.has(file);
    for (const { spec, resolved } of importsOf(file)) {
      // Bare specifiers: flag imports of dependencies the site materializer
      // prunes — tsc in the scaffold fails on them even when type-only.
      if (!resolved && profileName === "site" && !codemodded && isForbiddenBare(spec)) {
        violations.push({
          importer: file,
          specifier: spec,
          resolved: spec,
          owner: "(pruned-dependency)",
        });
        continue;
      }
      if (!resolved) continue;
      // A local specifier that resolves to nothing is a break in ANY profile.
      if (resolved === UNRESOLVED) {
        violations.push({ importer: file, specifier: spec, resolved, owner: "(unresolved)" });
        continue;
      }
      if (!CODE_EXT.test(resolved)) continue;
      // Codemod targets: ONLY their design-pack/plugin entries are rewritten
      // by the materializer — every other import they carry is checked like
      // any other file (codex #385 fold-in: the old wholesale exemption let
      // an unrelated broken import in designs/index.ts pass).
      if (codemodded && (resolved.startsWith("designs/") || resolved.startsWith("plugins/"))) {
        continue;
      }
      const owner = excludedOwner(resolved);
      const gone =
        owner ??
        (isMaterializerDeleted(resolved) && !includedSet.has(resolved)
          ? "(materializer-deleted)"
          : undefined);
      if (gone) {
        violations.push({
          importer: reachable.has(file) ? file : `${file} [unreachable]`,
          specifier: spec,
          resolved,
          owner: gone,
        });
      }
    }
  }

  return {
    profile: profileName,
    includedModules: [...included].sort(),
    violations,
    walked: includedFiles.filter((f) => CODE_EXT.test(f)).length,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const profileName = args[0] ?? "site";
  const withIndex = args.indexOf("--with");
  // Keep the original positional second argument as a compatibility fallback.
  const withArg = withIndex >= 0 ? args[withIndex + 1] : args[1];
  const withModules = withArg ? withArg.split(",").filter(Boolean) : [];
  const result = auditProfile(profileName, { withModules });
  const byOwner = new Map<string, Violation[]>();
  for (const v of result.violations) {
    byOwner.set(v.owner, [...(byOwner.get(v.owner) ?? []), v]);
  }
  console.log(
    `\nProfile "${result.profile}" — modules: ${result.includedModules.join(", ")}`,
  );
  console.log(`Walked ${result.walked} files.\n`);
  if (!result.violations.length) {
    console.log("✅ No cross-module import leaks — the profile set is closed.");
  } else {
    for (const [owner, vs] of [...byOwner.entries()].sort()) {
      console.log(`── leaks into excluded module "${owner}" (${vs.length}) ──`);
      for (const v of vs) console.log(`  ${v.importer}\n    → ${v.specifier}  (${v.resolved})`);
      console.log("");
    }
    console.log(`❌ ${result.violations.length} import leak(s).`);
    process.exitCode = 1;
  }
}
