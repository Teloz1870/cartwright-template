import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, isEngineCheckout } from "../helpers/claims";

/**
 * INST1-a: `npx create-cartwright` picks npm on a machine without pnpm, and the
 * engine's scripts are the scaffold's scripts. One `pnpm` inside `build` made
 * `npm run build` stop with "pnpm: command not found" (measured 2026-10-30, on
 * Node 24 and 26). Engine only: a shop's own scripts may call what they like.
 * Calling npm instead would only move the problem: pnpm can be installed without it.
 */
describe.skipIf(!isEngineCheckout)("package.json scripts run under any package manager", () => {
  it("no script calls a package manager", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const offenders = Object.entries(scripts)
      .filter(([, command]) => /(^|[\s;&|("'])(pnpm|pnpx|npm|npx|yarn|bun|bunx)\s/.test(command))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
    expect(Object.keys(scripts).length).toBeGreaterThan(10); // the read is not vacuous
    // `build` repeats these two commands rather than calling a package manager.
    expect(scripts.build).toContain(scripts["build:registry"]);
    expect(scripts.build).toContain(scripts["gen:manifest"]);
  });
});
