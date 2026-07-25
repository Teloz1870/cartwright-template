import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two repo-level invariants that no application test can see, both found in
 * production by a downstream fork.
 *
 * 1. **Credential ignore.** `.gitignore` listed the bare name
 *    `.admin-credentials`, which matches that file and nothing else — a sibling
 *    like `.admin-credentials.prod` (what a production-admin bootstrap would
 *    write) was fully commit-eligible.
 *
 * 2. **Vercel framework preset.** A project created through the CLI defaults to
 *    preset "Other", which serves `public/` as static files: every route 404s
 *    and the build finishes in 0 ms, with nothing that *looks* wrong. Pinning
 *    `"framework": "nextjs"` in `vercel.json` puts it under version control
 *    instead of in dashboard state nobody reviews.
 *
 * The ignore assertions shell out to `git check-ignore` rather than pattern-
 * matching `.gitignore` as text: git's matching rules (negations, precedence,
 * directory semantics) are the actual contract, and a string test would happily
 * pass on a pattern git does not honour.
 *
 * THIS FILE SHIPS TO CUSTOMERS. `.github/sync-excludes.txt` excludes only
 * `tests/e2e/`, so `tests/unit/` lands in every scaffold — and the release
 * scaffold-gate runs `pnpm test` inside a `--no-git` scaffold, where there is no
 * repository at all. The git-dependent assertions therefore SKIP when git or the
 * repo is absent rather than failing the gate. `isIgnored` distinguishes "not
 * ignored" (exit 1) from "git unavailable" (exit 128 / ENOENT) and throws on the
 * latter, so a skip can never be mistaken for a pass.
 */

const ROOT = join(__dirname, "..", "..");

/** True only when a real git repo is queryable from ROOT. */
const hasGitRepo = (() => {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * `git check-ignore` exits 0 = ignored, 1 = not ignored, 128 = not a repo.
 * Anything other than a clean 0/1 throws, so an environment problem can never
 * masquerade as "not ignored".
 */
function isIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return false;
    throw new Error(`git check-ignore failed for ${path} (exit ${status ?? "n/a"})`);
  }
}

/** Every URL the App Router serves a route handler for, with `(groups)` stripped. */
const routeUrls: ReadonlySet<string> = (() => {
  const urls = new Set<string>();
  const appDir = ["app", join("src", "app")].map((d) => join(ROOT, d)).find((d) => existsSync(d));
  if (!appDir) return urls;

  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Route groups `(name)` and parallel routes `@slot` are not URL segments.
        const segment = /^\(.*\)$/.test(entry) || entry.startsWith("@") ? "" : `/${entry}`;
        walk(full, url + segment);
      } else if (/^route\.(ts|tsx|js|mjs)$/.test(entry)) {
        urls.add(url || "/");
      }
    }
  };
  walk(appDir, "");
  return urls;
})();

describe.skipIf(!hasGitRepo)(".gitignore — credential files", () => {
  it("ignores .admin-credentials and its production sibling", () => {
    expect(isIgnored(".admin-credentials")).toBe(true);
    expect(isIgnored(".admin-credentials.prod")).toBe(true);
  });

  it("does NOT ignore the committed .example stub", () => {
    // The repo's hard rule: a credential-shaped file ships a committed
    // `.example`. A bare glob would silently swallow it — same negation the
    // `.env*` block two rules above already uses.
    expect(isIgnored(".admin-credentials.example")).toBe(false);
  });

  it("the check can actually fail (a normal source file is NOT ignored)", () => {
    // Without this, a broken `isIgnored` returning true would make the whole
    // block vacuous.
    expect(isIgnored("brand.config.ts")).toBe(false);
  });

  it("no credential file is currently tracked", () => {
    const tracked = execFileSync("git", ["ls-files", "--", ".admin-credentials*"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("");
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

  it("pins the Next.js framework preset", () => {
    expect(config.framework).toBe("nextjs");
  });

  it("every scheduled cron points at a route that exists", () => {
    // Derivation, not a hardcoded list: a cron that outlives its route fails
    // silently in production (Vercel just gets a 404 on schedule).
    //
    // Resolve URL → file the way the App Router does rather than assuming a
    // literal 1:1 mapping: route groups `(name)` do not appear in the URL, the
    // handler may be .ts/.tsx/.js/.mjs, and Vercel permits a query string on a
    // cron path. A naive join("app", path, "route.ts") false-fails on all three.
    const missing = (config.crons ?? [])
      .map((c: { path: string }) => c.path.split("?")[0].replace(/\/+$/, ""))
      .filter((p: string) => !routeUrls.has(p));

    expect(missing).toEqual([]);
  });

  it("has crons to check (guards the assertion above against an empty list)", () => {
    expect((config.crons ?? []).length).toBeGreaterThan(5);
  });

  it("the derived route index is non-empty and contains a known cron route", () => {
    // If the walker broke, routeUrls would be empty and the assertion above
    // would report every cron as missing — or a future refactor could make it
    // silently vacuous.
    expect(routeUrls.size).toBeGreaterThan(10);
    expect(routeUrls.has("/api/cron/backup")).toBe(true);
  });
});
