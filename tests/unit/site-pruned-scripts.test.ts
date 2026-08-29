import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SITE_PRUNED_SCRIPTS } from "@/scaffold/site-pruned-scripts";

/**
 * The list of dev-only scripts a `site` materialization deletes used to be
 * typed out by hand in TWO repositories — this engine's site-profile audit and
 * the CLI's `SITE_PRUNED_SCRIPTS` — with nothing checking they agreed. That is
 * the drift class that shipped two red releases: a value asserted in one place
 * and set in another.
 *
 * There is now one list, and the CLI reads it out of `scaffold/manifest.json`.
 * These tests pin the two ways it can silently rot: an entry naming a file that
 * no longer exists, and a manifest that has fallen behind the source.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("the site-pruned script list", () => {
  it("is not empty", () => {
    // A list that silently became empty would prune nothing and assert nothing.
    expect(SITE_PRUNED_SCRIPTS.length).toBeGreaterThan(10);
  });

  it("names only scripts that exist", () => {
    for (const file of SITE_PRUNED_SCRIPTS) {
      expect(
        existsSync(`${repoRoot}${file}`),
        `${file} is listed as pruned but does not exist — a stale entry prunes ` +
          "nothing and hides the next real one",
      ).toBe(true);
    }
  });

  it("is published to the manifest the CLI reads", () => {
    // If these drift, the CLI keeps pruning yesterday's list while the audit
    // asserts today's — which is exactly the failure this file exists for.
    const manifest = JSON.parse(
      readFileSync(`${repoRoot}scaffold/manifest.json`, "utf8"),
    );
    expect(
      manifest.sitePrunedScripts,
      "scaffold/manifest.json is stale — run pnpm gen:scaffold-manifest",
    ).toEqual([...SITE_PRUNED_SCRIPTS]);
  });

  it("covers every script that imports a site-pruned dependency", () => {
    // The reason the list exists, asserted directly rather than trusted: a
    // script reaching for Playwright, Prisma or the Turso client cannot run in
    // a site scaffold, so it must be on the list. Measured from the source,
    // not from memory — this is what caught `capture-locales.mjs` in CI.
    const PRUNED_DEPS = /@playwright\/test|@prisma\/client|@libsql\/client|from "\.\.\/lib\/db"|from "@\/lib\/db"/;
    const listed = new Set(SITE_PRUNED_SCRIPTS);
    const missing: string[] = [];
    for (const file of globScripts()) {
      if (listed.has(file)) continue;
      const src = readFileSync(`${repoRoot}${file}`, "utf8");
      if (PRUNED_DEPS.test(src)) missing.push(file);
    }
    expect(
      missing,
      "these scripts import a dependency the site profile prunes but are not " +
        "listed in scaffold/site-pruned-scripts.ts",
    ).toEqual([]);
  });
});

function globScripts(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { globSync } = require("node:fs") as typeof import("node:fs");
  return globSync("scripts/*.{ts,mjs}", { cwd: repoRoot });
}
