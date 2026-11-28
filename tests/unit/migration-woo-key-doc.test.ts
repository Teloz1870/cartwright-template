import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The WooCommerce read key is documented where an owner looks for it: `.env.example` (commented
 * stubs, no value) and `docs/migration.md` (which checks need it, where it must be set). The
 * variable names are read from the code that reads them, so a rename or a second keyed check goes
 * red here instead of leaving the docs behind. Engine-only (a scaffold may prune the migration
 * code): same probe as repo-hygiene.test.ts. Walks the disk, needs no git.
 */
const ROOT = join(__dirname, "..", "..");
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CODE = /\.[cm]?[jt]sx?$/;
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return CODE.test(name) ? [rel] : [];
  });
}

// Every code file the engine ships, wherever it lives (lib, app incl. app/.well-known, components,
// plugins, modules, scripts, root files ...): not dependencies, build output, tests or local notes.
const SKIP_ROOTS = new Set(["node_modules", "tests", "internal-docs", "graphify-out", "coverage"]);
function codeFiles(): string[] {
  return readdirSync(ROOT)
    .filter((name) => !SKIP_ROOTS.has(name) && !name.startsWith("."))
    .flatMap((name) => (statSync(join(ROOT, name)).isDirectory() ? walk(name) : CODE.test(name) ? [name] : []))
    .sort();
}

// A read of either half of the key from an env object: `env.WOO_AUTH_USER`, `env?.WOO_AUTH_PASS`,
// `env["WOO_AUTH_USER"]`, or `const { WOO_AUTH_USER } = process.env`. Prose naming the variables
// (a detail string, a comment) does not match.
const READS_KEY = /\??\.WOO_AUTH_[A-Z]+\b|\[\s*["'`]WOO_AUTH_[A-Z]+["'`]\s*\]|\{[^{}]*\bWOO_AUTH_[A-Z]+\b[^{}]*\}\s*=/;

describe.skipIf(!isEngineCheckout)("the WooCommerce read key is documented", () => {
  const names = [...new Set([...read("lib/woo/run-import.ts").matchAll(/\benv\.(WOO_[A-Z_]+)/g)].map((m) => m[1]))];
  const envExample = read(".env.example");
  const guide = read("docs/migration.md");
  const tool = read("lib/tools/migration-woo.ts");

  it("reads the names from the code, and finds the two halves of the key", () => {
    expect(names).toEqual(["WOO_AUTH_USER", "WOO_AUTH_PASS"]);
  });

  it(".env.example carries each name as a commented stub without a value, never set", () => {
    for (const name of names) {
      expect(envExample).toMatch(new RegExp(`^# ${name}=""$`, "m"));
      expect(envExample).not.toMatch(new RegExp(`^\\s*${name}\\s*=`, "m"));
    }
    expect(envExample).toContain("See docs/migration.md.");
  });

  it("docs/migration.md names each variable and where the site must have it", () => {
    expect(guide).toContain("## The WooCommerce read key");
    for (const name of names) expect(guide).toContain(`\`${name}\``);
    expect(guide).toMatch(/\*\*For the board:\*\* where the site runs/);
    expect(guide).toMatch(/\*\*For `pnpm woo:import`:\*\*/);
  });

  it("data.stock is the only check that reads the key, as the guide says", () => {
    const files = codeFiles();
    // Only wooImportAuth reads the variables from an env; no other code file anywhere does.
    expect(files.filter((rel) => READS_KEY.test(read(rel)))).toEqual(["lib/woo/run-import.ts"]);
    // And only the board's check and the importer the guide names call it.
    const callers = files.filter((rel) => rel !== "lib/woo/run-import.ts" && /\bwooImportAuth\(/.test(read(rel)));
    expect(callers).toEqual(["lib/tools/migration-woo.ts", "scripts/woo-import.ts"]);
    // In that file the key is read once, inside measureStock, which only data.stock's runner calls.
    expect(tool.match(/\bwooImportAuth\(/g)).toHaveLength(1);
    const call = tool.indexOf("wooImportAuth(process.env)");
    expect(call).toBeGreaterThan(tool.indexOf("async function measureStock("));
    expect(call).toBeLessThan(tool.indexOf("export async function runWooDataStock("));
    const uses = [...tool.matchAll(/\bmeasureStock\(/g)].map((m) => m.index!);
    expect(uses).toHaveLength(2);
    expect(uses[1]).toBeGreaterThan(tool.indexOf("export async function runWooDataStock("));
    expect(guide).toMatch(/only \*\*`data\.stock`\*\*/);
  });

  it("what the guide says about a missing key is what the code does", () => {
    // The board's detail without a key names both variables.
    const noKey = /const NO_KEY = "([^"]+)"/.exec(tool)?.[1] ?? "";
    for (const name of names) expect(noKey).toContain(name);
    expect(guide).toMatch(/\*\*inconclusive\*\*, never a pass and never a fail/);
    // A required check, so an inconclusive run holds the DNS-switch counter back.
    expect(read("lib/migration/catalog.ts")).toMatch(/id: "data\.stock",[^\n]*required: true/);
    expect(guide).toContain("Because `data.stock` is a required check");
  });
});
