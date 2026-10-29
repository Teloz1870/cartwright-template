import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * scripts/fonts/fetch.mjs is all or nothing (FONT1-b review): a re-run that
 * fails halfway must leave the font directory exactly as it was. It used to
 * delete the installed files before downloading their replacements, so one
 * failed download left faces.css and fonts.json naming files that were gone,
 * and the next build broke.
 *
 * The script runs for real, offline, under Next's own mock switch
 * (NEXT_FONT_GOOGLE_MOCKED_RESPONSES): the Google CSS and the licence come from
 * a mock module, and a font `src` that is an absolute path is read from disk —
 * so a path that does not exist is a failed download.
 *
 * Engine-only (the repo-hygiene probe): the script is an engine maintenance tool.
 */
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/fonts/fetch.mjs");
const isEngineCheckout = existsSync(path.join(ROOT, ".github", "sync-excludes.txt"));

let tmp = "";
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = "";
});

/** A font directory as a previous run left it, plus a file of the caller's own (font.ts). */
function installed(): string {
  tmp = mkdtempSync(path.join(os.tmpdir(), "fonts-fetch-"));
  const dir = path.join(tmp, "fonts", "space-mono");
  mkdirSync(dir, { recursive: true });
  const old: Record<string, string> = {
    "space-mono-latin-normal-400.woff2": "OLD latin",
    "space-mono-latin-ext-normal-400.woff2": "OLD latin-ext",
    "space-mono-greek-normal-400.woff2": "OLD greek, a subset Google no longer serves",
    "faces.css": "/* old faces */",
    "fonts.json": "{}",
    "LICENSE.txt": "old licence",
    "font.ts": "// the caller's own module",
  };
  for (const [name, body] of Object.entries(old)) writeFileSync(path.join(dir, name), body);
  return dir;
}

const snapshot = (dir: string) => Object.fromEntries(readdirSync(dir).sort().map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));

/** Runs the script for Space Mono 400 with Google answering one face per subset. */
function run(dir: string, subsets: { subset: string; src: string }[]) {
  const css = subsets
    .map(({ subset, src }) => `/* ${subset} */\n@font-face {\n  font-family: 'Space Mono';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url(${src}) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n`)
    .join("");
  const mock = path.join(tmp, "mock.cjs");
  writeFileSync(mock, `module.exports = new Proxy({}, { get: (_, url) => String(url).includes("githubusercontent") ? "SIL Open Font License (mock)" : ${JSON.stringify(css)} });\n`);
  const options = JSON.stringify({ subsets: ["latin"], weight: ["400"], display: "swap" });
  return spawnSync(process.execPath, [SCRIPT, "Space_Mono", options, dir], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mock },
  });
}

/** A downloadable font file (the mock reads absolute paths from disk). */
function served(name: string, body: string): string {
  const file = path.join(tmp, "served", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  return file;
}

const leftovers = (dir: string) => readdirSync(path.dirname(dir)).filter((f) => f.startsWith("."));

describe.skipIf(!isEngineCheckout)("scripts/fonts/fetch.mjs replaces a font directory all or nothing", () => {
  it("a failed download leaves every installed file as it was", () => {
    const dir = installed();
    const before = snapshot(dir);
    const res = run(dir, [
      { subset: "latin", src: served("latin.woff2", "NEW latin") },
      { subset: "latin-ext", src: path.join(tmp, "served", "missing.woff2") },
    ]);
    expect(res.status, res.stdout + res.stderr).not.toBe(0);
    expect(res.stderr).toMatch(/missing\.woff2/);
    expect(snapshot(dir)).toEqual(before);
    expect(leftovers(dir), "the staging directory must be removed").toEqual([]);
  }, 30_000);

  it("a complete run replaces the files, drops the ones nothing names, and keeps the caller's own", () => {
    const dir = installed();
    const res = run(dir, [
      { subset: "latin", src: served("latin.woff2", "NEW latin") },
      { subset: "latin-ext", src: served("latin-ext.woff2", "NEW latin-ext") },
    ]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    const after = snapshot(dir);
    expect(Object.keys(after)).toEqual([
      "LICENSE.txt",
      "faces.css",
      "font.ts",
      "fonts.json",
      "space-mono-latin-ext-normal-400.woff2",
      "space-mono-latin-normal-400.woff2",
    ]);
    expect(after["space-mono-latin-normal-400.woff2"]).toBe("NEW latin");
    expect(after["font.ts"]).toBe("// the caller's own module");
    expect(after["LICENSE.txt"]).toBe("SIL Open Font License (mock)");
    expect(after["faces.css"]).toContain('url("./space-mono-latin-ext-normal-400.woff2") format("woff2")');
    const record = JSON.parse(after["fonts.json"]) as { files: { file: string; sha256: string }[] };
    for (const f of record.files) expect(f.sha256).toBe(createHash("sha256").update(after[f.file]).digest("hex"));
    expect(leftovers(dir), "the staging directory must be removed").toEqual([]);
  }, 30_000);
});
