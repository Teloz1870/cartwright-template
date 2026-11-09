import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT, lineOf, read, stripComments } from "./_shared";

/**
 * META — the rule that keeps every other guard able to run.
 *
 * A guard is only worth writing if it survives the trip into a customer's
 * repository, and the ways to break that are all quiet. `import "@/lib/brand"`
 * resolves fine here and crashes the file in a profile that pruned the module —
 * and a crashed test file is not a red test, it is an ERROR that a
 * `--passWithNoTests` run can wave through. `execSync("git ls-files")` returns
 * an empty string in a `--no-git` scaffold, so a walk built on it checks zero
 * files and passes. `import { chromium } from "playwright"` cannot even install
 * in a site scaffold. None of these announce themselves; they just make the
 * zone stop meaning anything.
 *
 * So the rules are pinned mechanically, against the files as they are on disk:
 *
 *   1. no `@/…` specifier
 *   2. no git, no child process
 *   3. bare imports are `vitest` or `node:*` — nothing else
 *   4. the engine probe is `.github/sync-excludes.txt`, never a package name,
 *      never `process.env.CI` — and it lives in `_shared.ts`, not copied
 *   5. a live guard reaches `GUARD_BASE_URL` through `guardBaseUrl()`, warns
 *      when it is unset, and gates EVERY one of its tests with
 *      `it.skipIf(!base)` — one gated test in a file of five leaves four
 *      running against a stopped server and reporting green
 *
 * The zone is also checked for being non-empty: a `tests/guards/` that
 * accidentally ships with nothing in it is exactly the shape of a green run
 * that proves nothing, which is what `vitest run --passWithNoTests` does in a
 * site scaffold today.
 */

const ZONE = "tests/guards";
const files = readdirSync(path.join(REPO_ROOT, ZONE))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .sort();

const sourceOf = (file: string) => read(`${ZONE}/${file}`);

/** Every `from "x"` / `import "x"` / `require("x")` specifier in a file. */
const SPECIFIER_RE =
  /(?:import|export)\s+[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[^.\w])require\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

function specifiers(src: string): { spec: string; line: number }[] {
  const out: { spec: string; line: number }[] = [];
  for (const match of stripComments(src).matchAll(SPECIFIER_RE)) {
    const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (spec) out.push({ spec, line: lineOf(src, match.index ?? 0) });
  }
  return out;
}

const ALLOWED_BARE = new Set(["vitest"]);

/**
 * Source with every string, template and regex literal blanked (length and
 * newlines preserved).
 *
 * This file is the one place in the zone where the forbidden constructs appear
 * on purpose — as the patterns it searches for. Scanning raw text would make it
 * report itself, which is not rigour, it is a broken guard. Blanking literals
 * leaves only executable code, so `execSync(…)` is found and
 * `/\bexecSync\b/`is not. Comments are already gone when this runs, so a `/`
 * here is either a regex literal or division.
 */
export function stripLiterals(src: string): string {
  let out = "";
  let i = 0;
  let prev = "\n";
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += src[i] ?? "";
      i++;
      prev = c;
      continue;
    }
    // A regex literal can only start where a value is expected.
    if (c === "/" && /[(,=:[!&|?+\-*%;{}\n]/.test(prev)) {
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "\n") break;
        if (src[j] === "/") {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        out += `/${" ".repeat(j - i - 1)}/`;
        i = j + 1;
        while (i < src.length && /[a-z]/.test(src[i])) {
          out += src[i];
          i++;
        }
        prev = "/";
        continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Executable code only: comments gone, literals blanked, line numbers intact. */
const codeOf = (file: string) => stripLiterals(stripComments(sourceOf(file)));

describe("guard: the guards are portable", () => {
  it("the zone is not empty", () => {
    expect(
      files.length,
      "`tests/guards/` has no TypeScript files. In a site scaffold `pnpm test` is " +
        "`vitest run --passWithNoTests`, so an empty zone is a green run that checked " +
        "nothing — the exact state this zone exists to end.",
    ).toBeGreaterThan(1);
    expect(
      files.filter((f) => f.endsWith(".test.ts")).length,
      "`tests/guards/` contains no *.test.ts files, so vitest picks up nothing here.",
    ).toBeGreaterThan(0);
  });

  it("no guard imports through the `@/` alias", () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const { spec, line } of specifiers(sourceOf(file))) {
        if (spec.startsWith("@/")) bad.push(`  ${ZONE}/${file}:${line}  import "${spec}"`);
      }
    }
    expect(
      bad,
      bad.length
        ? `\n${bad.length} guard import${bad.length === 1 ? "" : "s"} through the \`@/\` ` +
            `alias:\n\n${bad.join("\n")}\n\n` +
            "The alias points into the application, and a profile prunes application files. " +
            "When the target is gone the guard does not fail — it fails to LOAD, which vitest " +
            "reports as an unhandled error and a `--passWithNoTests` gate can swallow. Read " +
            "what you need off the disk instead (`onDisk`/`read` in `_shared.ts`).\n"
        : "",
    ).toEqual([]);
  });

  it("no guard depends on anything but node builtins and vitest", () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const { spec, line } of specifiers(sourceOf(file))) {
        if (spec.startsWith(".") || spec.startsWith("@/")) continue; // relative handled above
        if (spec.startsWith("node:") || ALLOWED_BARE.has(spec)) continue;
        bad.push(`  ${ZONE}/${file}:${line}  import "${spec}"`);
      }
    }
    expect(
      bad,
      bad.length
        ? `\nGuards may only import node builtins (\`node:*\`) and vitest:\n\n${bad.join("\n")}` +
            "\n\nEverything else is prunable. `@playwright/test`, `three`, `prisma`, `ai` and " +
            "`@prisma/client` are all removed from a site scaffold's package.json, and a " +
            "guard that needs one of them cannot run in the profile it was written for.\n"
        : "",
    ).toEqual([]);
  });

  it("no guard shells out — least of all to git", () => {
    const bad: string[] = [];
    for (const file of files) {
      // The import is the honest place to catch it: a guard that runs git has
      // to reach node:child_process, and `node:*` is otherwise allowed above.
      for (const { spec, line } of specifiers(sourceOf(file))) {
        if (/(^|:)child_process$/.test(spec)) {
          bad.push(
            `  ${ZONE}/${file}:${line}  import "${spec}" — \`create-cartwright\` scaffolds ` +
              "with `--no-git`, so `git ls-files` returns an empty list and a walk built on " +
              "it silently checks nothing. Walk the disk instead (`walkCode` in `_shared.ts`).",
          );
        }
      }
      const code = codeOf(file);
      const match = /\b(execFileSync|execSync|spawnSync|spawn|execFile|fork)\s*\(/.exec(code);
      if (match) {
        bad.push(
          `  ${ZONE}/${file}:${lineOf(code, match.index)}  ${match[1]}( — a child process. A ` +
            "scaffold is not guaranteed to carry the binary, and the failure of a subprocess " +
            "that was never there reads as a passing test.",
        );
      }
    }
    expect(bad, bad.length ? `\n${bad.join("\n")}\n` : "").toEqual([]);
  });

  it("the engine probe is the mirror exclude file, and only that", () => {
    // COMMENTS OFF, LITERALS ON — deliberately not `codeOf`. Every other check
    // here runs on `codeOf` so this file does not report its own patterns, but
    // the payload of THIS one is a string literal: `codeOf` would blank
    // `".github/sync-excludes.txt"` and the assertion could never pass. Raw
    // source was the other wrong answer — a rewritten `isEngineCheckout` whose
    // stale docblock still named the path within 200 characters kept the test
    // green. Stripped-of-comments source is the only text where the match means
    // what the message says it means.
    const shared = stripComments(sourceOf("_shared.ts"));
    expect(
      shared,
      "`isEngineCheckout()` no longer probes `.github/sync-excludes.txt` IN ITS CODE (the " +
        "docblock does not count). That file is the one thing that exists here and, by " +
        "excluding itself from the mirror, in no scaffold cut from it. A probe on a package " +
        "name, a directory or `process.env.CI` answers differently in a fork, in CI and on " +
        "a laptop.",
    ).toMatch(/isEngineCheckout[\s\S]{0,200}\.github\/sync-excludes\.txt/);

    const bad: string[] = [];
    for (const file of files) {
      if (file === "_shared.ts") continue;
      const src = stripComments(sourceOf(file));
      // Catch the RE-IMPLEMENTATION, not the absence of a name. The old test
      // asked `!/isEngineCheckout/.test(src)`, which any file that also imports
      // the helper satisfies — and every guard in the zone imports it, so the
      // check was dead for exactly the files it was aimed at. What is forbidden
      // is probing the path directly; `profile-marker.test.ts` legitimately
      // READS the same file to assert the zone is not excluded from the mirror,
      // so the needle is the probe call, not the path.
      if (/\b(onDisk|existsSync|statSync|accessSync)\s*\(\s*["'`][^"'`]*sync-excludes\.txt/.test(src)) {
        bad.push(
          `  ${ZONE}/${file} probes \`.github/sync-excludes.txt\` itself instead of calling ` +
            "`isEngineCheckout()`. One copy of the probe, in `_shared.ts`, or the next change " +
            "to it fixes some guards and not others.",
        );
      }
      if (/process\.env\.CI\b/.test(codeOf(file))) {
        bad.push(`  ${ZONE}/${file} branches on process.env.CI — the profile decides, not CI.`);
      }
    }
    expect(bad, bad.length ? `\n${bad.join("\n")}\n` : "").toEqual([]);
  });

  it("every live guard warns when GUARD_BASE_URL is unset", () => {
    const bad: string[] = [];
    for (const file of files) {
      if (file === "_shared.ts") continue;
      // EXECUTABLE CODE, NOT RAW SOURCE. This file names every helper it looks
      // for inside its own failure messages, so a raw-source scan classifies
      // the meta guard as a live guard and then fails it for having seven
      // ungated tests. Same reason the rest of the file uses `codeOf`.
      const code = codeOf(file);
      // A guard that reads the variable directly would not be seen by the
      // `guardBaseUrl(` check below, so it could skip in silence and never be
      // caught. `_shared.ts` is the one place allowed to touch `process.env`.
      if (/process\.env\.GUARD_BASE_URL/.test(code)) {
        bad.push(
          `  ${ZONE}/${file} reads process.env.GUARD_BASE_URL directly. Use ` +
            "`guardBaseUrl()` — it normalises the origin, and the rest of this check only " +
            "recognises live guards by that call.",
        );
        continue;
      }
      if (!/guardBaseUrl\(/.test(code)) continue;
      if (!/warnLiveSkipped\(/.test(code)) {
        bad.push(
          `  ${ZONE}/${file} reads GUARD_BASE_URL but never calls warnLiveSkipped(). A live ` +
            "guard that skips in silence is indistinguishable from one that passed.",
        );
      }
      // PER TEST, NOT PER FILE. `/skipIf\(!base\)/.test(src)` is satisfied by
      // ONE gated test in a file of five, and the other four then run against
      // no server and pass on whatever they happen to find. So count the
      // ungated ones instead: in a live file every `it(` must be `it.skipIf(`.
      const ungated = (code.match(/(?<![.\w])(?:it|test)\s*\(/g) ?? []).length;
      if (ungated > 0) {
        bad.push(
          `  ${ZONE}/${file} reads GUARD_BASE_URL but has ${ungated} test${
            ungated === 1 ? "" : "s"
          } that ${ungated === 1 ? "is" : "are"} not gated with \`it.skipIf(!base)\`. ` +
            "Skipped tests are reported as PENDING; a test that returns early is reported as " +
            "PASSED, and a reporter cannot tell the difference.",
        );
      }
      if (!/skipIf\(!base\)/.test(code)) {
        bad.push(
          `  ${ZONE}/${file} reads GUARD_BASE_URL but gates nothing with \`it.skipIf(!base)\`. ` +
            "A live guard with no gated test is one that runs against a stopped server.",
        );
      }
    }
    expect(bad, bad.length ? `\n${bad.join("\n")}\n` : "").toEqual([]);
  });

  it("no guard hardcodes a base URL", () => {
    const bad: string[] = [];
    for (const file of files) {
      const src = stripComments(sourceOf(file));
      const match = /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.exec(src);
      // `_shared.ts` prints one in the skip message — that is instruction, not a default.
      if (match && file !== "_shared.ts") {
        bad.push(
          `  ${ZONE}/${file}:${lineOf(src, match.index)}  ${match[0]} — a guard that falls ` +
            "back to a default origin probes whatever happens to be running.",
        );
      }
    }
    expect(bad, bad.length ? `\n${bad.join("\n")}\n` : "").toEqual([]);
  });
});
