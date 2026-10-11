import { describe, expect, it } from "vitest";

import { lineOf, onDisk, read } from "./_shared";

/**
 * STATIC — every `scripts/…` file a `package.json` script runs must exist.
 *
 * Owner CW-27, measured on a real `create-cartwright@2.9.4 --profile site`
 * scaffold: five shipped scripts pointed at files the profile had deleted —
 * `admin:create`, `capture:gallery`, `dev:screenshot`, `capture:locales` and
 * `verify:design`, the last of which `DESIGN.md` tells the owner to run. Each
 * answered "Cannot find module". The CLI closed it in 2.9.5 by DERIVING the
 * dead set from the materialized tree (`pruneDeadScriptReferences`) instead of
 * maintaining a fifth hand-kept list.
 *
 * THIS GUARD IS THE MIRROR OF THAT PRUNER, AND IT IS DELIBERATELY STRICTER.
 * The pruner drops a script only when EVERY path it names is missing AND the
 * command has no shell operator — it must never delete `vitest run && node
 * scripts/x.mjs` and take the test run with it. That caution is right for a
 * deletion and wrong for an assertion: `a && node scripts/gone.mjs` still fails
 * the moment somebody runs it. So the guard asks the simpler question — does
 * every referenced file exist? — and a pruner that grows a new blind spot is
 * caught here rather than by a customer.
 *
 * Extension-less references are skipped for the same reason the pruner skips
 * them: Node resolves `node scripts/foo` at runtime and `existsSync` cannot.
 */

type Pkg = { scripts?: Record<string, string> };

const raw = onDisk("package.json") ? read("package.json") : "";
const pkg: Pkg = raw ? (JSON.parse(raw) as Pkg) : {};
const scripts = pkg.scripts ?? {};

/**
 * The paths a command actually runs. Same shape as the CLI's matcher: the
 * engine's own `scripts/` directory, optionally written `./scripts/…`, never a
 * path inside `node_modules`, and only with a file extension.
 */
export function referencedScriptPaths(command: string): string[] {
  // A shell comment can name a path the command never runs.
  const effective = command.split(/\s#\s/)[0];
  return (effective.match(/(?<![\w-])\.?\/?scripts\/[\w.\-/]+/g) ?? [])
    .map((rawRef) => rawRef.replace(/^\.\//, ""))
    .filter((rel) => /\.[a-z]+$/i.test(rel))
    .filter((rel) => !rel.includes("node_modules/"));
}

/**
 * The line a script key sits on, searched from the `"scripts"` block rather
 * than from byte 0.
 *
 * `raw.indexOf('"test"')` finds the FIRST `"test"` in package.json, and a
 * dependency, a field name or a `"files"` entry with that text earlier in the
 * file would send the reader to the wrong line. No key in this tree collides
 * today — checked, all 30 of them — so this is a correctness fix for the
 * message, not for a live defect; the point is that a guard's own error output
 * is the thing a stranger trusts, and a wrong line number in it is a small lie
 * that costs somebody an afternoon.
 */
export function scriptKeyLine(pkgSource: string, key: string): number {
  const block = pkgSource.indexOf('"scripts"');
  const at = pkgSource.indexOf(`"${key}"`, block === -1 ? 0 : block);
  return lineOf(pkgSource, at === -1 ? 0 : at);
}

describe("guard: no dead scripts", () => {
  it("package.json exists and declares scripts", () => {
    expect(raw, "No package.json — this guard cannot check anything.").not.toBe("");
    expect(
      Object.keys(scripts).length,
      "package.json declares no scripts at all. Even a site scaffold keeps `dev`, " +
        "`build`, `start` and `test`; an empty table means the rewrite ate them.",
    ).toBeGreaterThan(0);
  });

  it("every `scripts/…` file a package.json script runs is on disk", () => {
    const dead: string[] = [];
    for (const [key, command] of Object.entries(scripts)) {
      for (const rel of referencedScriptPaths(command)) {
        if (!onDisk(rel)) {
          dead.push(
            `  package.json:${scriptKeyLine(raw, key)}  "${key}": "${command}"\n` +
              `      → ${rel} does not exist`,
          );
        }
      }
    }
    expect(
      dead,
      dead.length
        ? `\n${dead.length} package.json script${dead.length === 1 ? "" : "s"} run a file this ` +
            `tree does not have:\n\n${dead.join("\n")}\n\n` +
            "This is owner CW-27. In a scaffold it means the profile deleted the file and the " +
            "script survived — `pruneDeadScriptReferences` in create-cartwright's materializer " +
            "is supposed to derive that set from the tree; a hit here is a blind spot in it " +
            "(a shell operator in the command, or a prune that ran after the rewrite). In the " +
            "engine it means a script was deleted and its package.json entry was not.\n"
        : "",
    ).toEqual([]);
  });

  /**
   * NOT ASSERTED HERE, ON PURPOSE — W42 / owner CW-27's second half.
   *
   * `i18n:pull` runs the `i18nexus` BINARY, which reads `i18nexus.json`:
   * gitignored in the engine, mirror-excluded, never written by the CLI. So the
   * script is dead in every scaffold AND in this checkout, and a guard that
   * asserted it would be red in the engine on day one — a guard nobody can keep
   * green teaches people to ignore the zone. W42's fix is to declare the script
   * key and its devDependency engine-private in `scaffold/engine-only.ts` so B4
   * prunes them; the assertion belongs in the same PR as the fix.
   */
});
