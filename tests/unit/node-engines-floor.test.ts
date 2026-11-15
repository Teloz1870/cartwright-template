import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../helpers/claims";

/**
 * TREND62: `@tailwindcss/node` 4.3.4+ is CommonJS and calls `require("magic-string")`
 * at load, and magic-string 1.x ships only an ES module. `require()` of an ES module
 * is unflagged from Node 22.12.0. Measured 2026-11-15 with this lockfile: loading
 * `@tailwindcss/postcss` on Node 22.11.0 throws ERR_REQUIRE_ESM, on 22.12.0 it loads,
 * so `pnpm build` cannot run below 22.12 while `engines` used to promise ">=22".
 *
 * Runs in scaffolds too: their package.json and docs are the engine's.
 */
const FLOOR: readonly [number, number] = [22, 12];

function lowerBound(clause: string): [number, number] | null {
  const m = clause.match(/^\s*>=\s*v?(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}

function atLeastFloor([major, minor]: [number, number]): boolean {
  return major > FLOOR[0] || (major === FLOOR[0] && minor >= FLOOR[1]);
}

describe("Node version floor", () => {
  it("package.json engines starts at Node 22.12, where require(esm) is unflagged", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      engines?: { node?: string };
    };
    const range = pkg.engines?.node ?? "";
    // Every "||" alternative must start at the floor, not only the first one.
    for (const clause of range.split("||")) {
      const bound = lowerBound(clause);
      expect(bound, `engines.node "${range}" has no ">=" lower bound`).not.toBeNull();
      expect(atLeastFloor(bound!), `engines.node "${range}" allows Node below 22.12`).toBe(true);
    }
  });

  // "Node 22", "Node.js 22+", "Node 22.x", "Node v22" and "Node 22.11" promise a 22.x
  // below the floor; "Node 22.12", "Node 22.12.0" and "Node 22.20" do not.
  const bare = /\bNode(?:\.js)?\s+v?22(?!(?:\.(?:1[2-9]|[2-9]\d|\d{3,})\b|\d))/i;

  it("the bare-Node-22 pattern catches every sub-floor spelling", () => {
    for (const s of ["Requires Node 22.", "Node 22,", "Node.js 22+", "Node 22.x", "Node 22.0+", "Node.js 22.11", "Node v22", "Node\n22"]) {
      expect(bare.test(s), s).toBe(true);
    }
    for (const s of ["Node 22.12", "Node 22.12+", "Node.js 22.12.0", "Node 22.20", "Node 24", "Node 220"]) {
      expect(bare.test(s), s).toBe(false);
    }
  });

  it("no doc states a bare Node 22 requirement", () => {
    const dir = path.join(REPO_ROOT, "docs");
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
    const offenders = files.filter((f) => bare.test(readFileSync(path.join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
