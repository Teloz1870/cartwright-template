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
import {
  ENGINE_ONLY,
  ENGINE_ONLY_PENDING_PROFILES,
  SHIPS_EVERYWHERE,
} from "@/scaffold/engine-only";
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
    // The ownership ledger (scaffold/engine-only.ts). `engineOnly` is ours —
    // the CLI deletes each path from a customer's scaffold; `shipsEverywhere`
    // is the customer's, unclaimed on purpose. Neither is a module: a module
    // is profile-selectable, and "always" and "never" are not choices.
    //
    // Published here for the same reason as sitePrunedScripts: the engine
    // declares what a customer's repository does and does not contain, and the
    // CLI reads it from the template snapshot instead of carrying its own copy.
    engineOnly: ENGINE_ONLY,
    // THE SAFETY CONDITION, PUBLISHED BESIDE THE HAZARD IT GUARDS.
    //
    // `engineOnly` on its own reads "delete these from every scaffold", and
    // each entry's `reason` explains why the path is OURS — none of them says
    // when deleting it is SAFE. It is safe only where the materialised
    // `lib/profile-capabilities.ts` reads `engineMarketing: false`, because
    // that key is what every shipped link to these routes asks first
    // (`tests/unit/pruned-route-hrefs.test.ts` derives that obligation rather
    // than listing it).
    //
    // Until this field existed, that condition lived in engine source and in
    // an engine unit test — entirely on OUR side of the repository boundary
    // the hazard crosses. `create-cartwright` reads this JSON out of the
    // template snapshot and nothing else, so a B4 author could satisfy every
    // engine gate and still cut a `light` scaffold — the DEFAULT profile —
    // whose footer, announcement bar, welcome canvas, sitemap, llms.txt and
    // MCP descriptor link routes the CLI had just deleted. The engine cannot
    // test the CLI; what it can do is refuse to publish the hazard without the
    // condition, so that reading `pendingProfiles` and declining — or deleting
    // this field on purpose — is a choice someone makes, instead of one they
    // are never offered.
    //
    // `pendingProfiles: []` is the receipt that the gate holds everywhere.
    engineOnlyGate: {
      capability: "engineMarketing",
      seam: "lib/profile-capabilities.ts",
      pendingProfiles: ENGINE_ONLY_PENDING_PROFILES,
      note:
        "Deleting an `engineOnly` path is safe only in a profile whose materialised " +
        "lib/profile-capabilities.ts reads engineMarketing: false. Every profile named in " +
        "pendingProfiles still reads true and keeps the links, so deleting those paths there " +
        "turns them into 404s in the customer's own chrome, sitemap and llms.txt. Gate the " +
        "deletion on this profile not being in that list.",
    },
    shipsEverywhere: SHIPS_EVERYWHERE,
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
