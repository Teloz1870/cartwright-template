import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `pnpm admin:create` is the only way onto a production database that the seed
 * guard will not touch, so two properties have to hold: the command must exist,
 * and it must never modify an account that is already there.
 *
 * The behaviour itself was proven against a real SQLite database — creates on a
 * populated no-admin DB without deleting the content, refuses a second admin,
 * refuses to promote a customer holding the same address, and `admin:reset`
 * points back at it when no admin exists. What a source scan adds is the part
 * that rots silently: the package.json wiring, and the fact that the create
 * path stays a create.
 *
 * Comments are stripped before scanning. The seed guard's own review found a
 * source test that a commented-out line satisfied, and the same trick would work
 * here — the refusals live in string literals a scan happily finds inside a
 * block comment.
 */

const ROOT = join(__dirname, "..", "..");

/** Remove block and line comments so a disabled guard cannot satisfy a scan. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\n"'`]*\/\/.*$/gm, "");
}

const script = stripComments(
  readFileSync(join(ROOT, "scripts", "admin-reset.ts"), "utf8"),
);
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("the admin:create command is wired", () => {
  it("package.json exposes it and passes --create", () => {
    expect(pkg.scripts["admin:create"]).toBe(
      "tsx scripts/admin-reset.ts --create",
    );
  });

  it("the script branches on that exact flag", () => {
    expect(script).toContain('process.argv.includes("--create")');
  });

  it("admin:reset still exists and is a different mode", () => {
    expect(pkg.scripts["admin:reset"]).toBe("tsx scripts/admin-reset.ts");
    expect(pkg.scripts["admin:create"]).not.toBe(pkg.scripts["admin:reset"]);
  });
});

describe("creating never modifies an account that already exists", () => {
  // The whole value of this command on a production database is that it adds
  // one row. An update or upsert here would either reset a password nobody
  // asked about or promote an existing account.
  const createFn = script.slice(
    script.indexOf("async function createAdmin"),
    script.indexOf("async function main"),
  );

  it("the create path is non-empty (a broken slice would pass vacuously)", () => {
    expect(createFn.length).toBeGreaterThan(200);
  });

  it("writes with user.create and nothing else", () => {
    expect(createFn).toContain("prisma.user.create");
    expect(createFn).not.toMatch(/prisma\.user\.(update|upsert|delete)/);
  });

  it("refuses when an admin already exists, and names the other mode", () => {
    expect(createFn).toContain("An admin already exists");
    expect(createFn).toContain("pnpm admin:reset");
  });

  it("refuses to promote a non-admin holding the same address", () => {
    expect(createFn).toContain("already exists as a");
  });

  it("a generated password forces a change at first login", () => {
    // It has been printed to a terminal and written to a file — that makes it a
    // bootstrap credential, not the owner's password. Same rule as the seed.
    expect(createFn).toContain("mustChangePassword: !explicit");
  });
});

describe("the recovery path is documented where someone stuck will look", () => {
  const deploy = readFileSync(join(ROOT, "DEPLOY.md"), "utf8");
  const guide = readFileSync(join(ROOT, "docs", "dev-to-prod.md"), "utf8");

  it("DEPLOY.md names it next to the seed warning", () => {
    expect(deploy).toContain("admin:create");
    expect(deploy).toContain("docs/dev-to-prod.md");
  });

  it("the guide covers both the seed refusal and the way past it", () => {
    for (const needle of [
      "ALLOW_DESTRUCTIVE_SEED",
      "admin:create",
      "admin:reset",
      "db:deploy",
    ]) {
      expect(guide, `dev-to-prod.md should mention ${needle}`).toContain(needle);
    }
  });
});
