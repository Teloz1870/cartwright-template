import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Path guard: nothing outside designs/ may statically deep-import a design
 * pack (`@/designs/<slug>/…`) — design packs are reached through the registry
 * (designs/index.ts → getDesign) ONLY.
 *
 * Why this is load-bearing: scaffold profiles (create-cartwright light) prune
 * design packs by deleting designs/<slug>/ and codemodding
 * designs/{index,options}.ts. Any parallel static import list elsewhere
 * (the chrome-registry had one until it 500'd every page of a light scaffold
 * with "Module not found") survives the codemod and breaks the build. This
 * test makes that class of regression impossible to reintroduce.
 *
 * Allowlist: `designs/studio/` — the shared section library consumed by
 * lib/builder/section-registry.tsx; the light profile force-keeps studio for
 * exactly this reason.
 */

const SCAN_ROOTS = ["app", "lib", "components", "scripts"];
const ALLOWED_DEEP_SLUGS = new Set(["studio"]);
const DEEP_IMPORT = /from\s+["']@\/designs\/([a-z0-9-]+)\//g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(path, out);
    } else if (/\.(ts|tsx|mts|mjs)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe("design deep-import guard (scaffold-prune safety)", () => {
  it("no file outside designs/ deep-imports a design pack (except the studio section library)", () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf-8");
        for (const match of source.matchAll(DEEP_IMPORT)) {
          const slug = match[1];
          if (!ALLOWED_DEEP_SLUGS.has(slug)) {
            violations.push(`${file} → @/designs/${slug}/…`);
          }
        }
      }
    }
    expect(
      violations,
      `Deep design-pack imports outside designs/ break pruned (light) scaffolds — ` +
        `resolve packs via getDesign() from @/designs instead:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
