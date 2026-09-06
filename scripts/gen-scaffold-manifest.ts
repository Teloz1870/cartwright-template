/**
 * Generate scaffold/manifest.json — the machine-readable module/profile
 * manifest the create-cartwright materializer consumes (B3, site-profile
 * program).
 *
 * The CLI downloads the template snapshot (giget) and reads THIS file to
 * resolve a profile → module set → file exclusions + seam copies, replacing
 * the hardcoded prune-lists. Emitted from modules/registry.ts (client-safe,
 * pure data) so the registry stays the single source of truth; the committed
 * JSON is what ships in the template mirror.
 *
 * Deterministic (no timestamps) so scaffold-manifest.test.ts can fail CI when
 * the committed file drifts from the registry.
 *
 *   pnpm gen:scaffold-manifest   # writes ./scaffold/manifest.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MODULES, PROFILES } from "@/modules/registry";
import { SITE_PRUNED_SCRIPTS } from "@/scaffold/site-pruned-scripts";

export function buildScaffoldManifest() {
  return {
    schema: "cartwright-scaffold-manifest-v1",
    // The four registry-codemod targets: files that statically import every
    // design pack / plugin manifest. The materializer rewrites these with the
    // CLI's entry-removal codemods (NOT seam copies) for each excluded
    // design/plugin.
    codemodTargets: [
      "designs/index.ts",
      "designs/options.ts",
      "plugins/registry.ts",
      "components/svg-items/design-motifs.ts",
    ],
    // Dev-only scripts a `site` materialization deletes. They are engine
    // tooling that imports dependencies the site profile prunes (Playwright,
    // Prisma, Turso), so a site scaffold that kept them would ship scripts it
    // cannot run.
    //
    // Published HERE because it was previously written out by hand in TWO
    // repos — this engine's site-profile audit and the CLI's
    // SITE_PRUNED_SCRIPTS — with nothing checking that the two agreed. That is
    // the same drift class that shipped a red release twice (a value asserted
    // in one place and set in another). One list, one owner: the engine
    // declares what it prunes, the CLI reads it.
    sitePrunedScripts: SITE_PRUNED_SCRIPTS,
    modules: MODULES.map((m) => ({
      slug: m.slug,
      kind: m.kind,
      dependsOn: m.dependsOn,
      files: m.files.map((f) => f.path),
      seams: m.seams,
      replaces: m.replaces,
      deps: m.deps,
      devDeps: m.devDeps,
      env: m.env,
      tests: m.tests,
      docs: m.docs,
      ...(m.flag ? { flag: m.flag } : {}),
      ...(m.knownDeviations?.length ? { knownDeviations: m.knownDeviations } : {}),
    })),
    profiles: PROFILES.map((p) => ({
      name: p.name,
      description: p.description,
      modules: p.modules,
      aliases: p.aliases,
    })),
  };
}

if (require.main === module) {
  const manifest = buildScaffoldManifest();
  const out = path.resolve(__dirname, "..", "scaffold", "manifest.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `scaffold/manifest.json written — ${manifest.modules.length} modules, ${manifest.profiles.length} profiles.`,
  );
}
