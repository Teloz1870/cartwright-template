import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repo-level invariants that no application test can see. The first two were
 * found in production by a downstream fork.
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
 * 3. **No dead pointers.** A short list of paths is deliberately held back from
 *    the public template: engine-internal notes, the canary smoke script, our
 *    own CI gates. A shipped docblock that says "see <one of those>" turns into
 *    a dead pointer the moment the file lands in someone else's project — it
 *    sends the reader after a document that does not exist, and it leaks the
 *    shape of our process for nothing in return. Dozens of them had piled up
 *    across the tree by the time this was written.
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

  it("vercel.static.json is exactly vercel.json minus crons (the no-db seam twin)", () => {
    // A `--profile site` materialization ships the twin instead of the real
    // file, because every cron targets a route that only exists with a
    // database. Anything else in vercel.json (headers, regions, rewrites…)
    // must reach a site scaffold too — so the twin may differ ONLY by `crons`.
    const twin = JSON.parse(readFileSync(join(ROOT, "vercel.static.json"), "utf8"));
    const { crons, ...rest } = config;
    expect(Array.isArray(crons) && crons.length > 0).toBe(true);
    expect(twin).toEqual(rest);
    expect(twin).not.toHaveProperty("crons");
  });

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

/**
 * Each entry pairs an engine-internal path with the line in
 * `.github/sync-excludes.txt` that keeps it out of the mirror, so the list
 * cannot outlive the exclusions that make it true (asserted below).
 *
 * Only NAVIGATIONAL names belong here — paths a comment would send a reader to.
 * The mirror machinery's own filenames are deliberately absent: shipped text
 * sometimes has to EXPLAIN the mirror, and this docblock is an example.
 */
const INTERNAL_PATHS: ReadonlyArray<{ needle: string; excludedBy: string }> = [
  // KNOWN LIMIT, stated rather than hidden: the repo-root `CLAUDE.md` is also
  // excluded, but it shares its basename with `.claude/CLAUDE.md`, which SHIPS
  // and is referenced legitimately all over the tree. No substring can tell
  // them apart, so a pointer at the root file is the one form of this mistake
  // the sweep cannot catch. (There are none today — the last one lived in
  // industry-templates/sunglasses/seed-data.ts and was rewritten.)
  // The whole folder is excluded, so everything under it — the engine's notes,
  // its backlog, its run log — is unreachable downstream.
  { needle: "internal-docs/", excludedBy: "internal-docs/" },
  { needle: "STATE.md", excludedBy: "internal-docs/" },
  // The release gate: it hardcodes three canary URLs and asserts their
  // production databases. `scripts/verify-deploy.sh` is the shipped equivalent.
  // Matched WITHOUT the extension: two test docblocks said "smoke-canaries n/a",
  // which is just as meaningless downstream as the full path would be.
  { needle: "smoke-canaries", excludedBy: "scripts/smoke-canaries.sh" },
  // Cartwright-side CI (the mirror token cannot create workflow files anyway).
  { needle: "canary-watch.yml", excludedBy: ".github/workflows/canary-watch.yml" },
  {
    needle: "canary-lighthouse-gate.yml",
    excludedBy: ".github/workflows/canary-lighthouse-gate.yml",
  },
];

/** Where shipped, human-read text lives. What is not listed is not swept. */
const SHIPPED_ROOTS = [
  ".cartwright",
  "app",
  "components",
  "designs",
  "docs",
  "eslint-rules",
  "i18n",
  "industry-templates",
  "lib",
  "modules",
  "plugins",
  "prisma",
  "scaffold",
  "scripts",
  "tests/unit",
  "themes",
  "types",
  "verticals",
  join(".claude", "skills"),
  join(".cursor", "rules"),
];

/**
 * Text a human reads. JSON (`messages/*.json`, `scaffold/manifest.json`) and
 * `public/` assets are out of scope on purpose: JSON has no comments, so a
 * pointer there would have to be inside a value a reader is never sent to.
 */
const SWEPT_EXTENSIONS = [".ts", ".tsx", ".mjs", ".css", ".sh", ".md", ".mdc"];

/**
 * Shipped files the roots above cannot reach: the per-tool agent-rules files.
 * `.claude/` is not a root because it also holds local-only working state, and
 * `.windsurfrules` has no extension. All four are customer-facing by design
 * (AGENTS.md → "Agent rules files"), so a pointer in one ships just as far as a
 * pointer in a docblock.
 */
const EXTRA_SWEPT_FILES = [
  join(".claude", "CLAUDE.md"),
  join(".github", "copilot-instructions.md"),
  join(".github", "PULL_REQUEST_TEMPLATE.md"),
  ".windsurfrules",
];

/**
 * Skipped with a reason each, not to hide a finding. Note what is NOT here:
 * the overnight reports ARE swept, which is why this change had to edit one of
 * them rather than exempt it.
 *  - this file must contain every pattern it searches for;
 *  - `scripts/smoke-canaries.sh`, `playwright.config.ts` and root `CLAUDE.md`
 *    are themselves mirror-excluded, so they may name their siblings freely;
 *  - `CHANGELOG.md` is a historical record, where naming a file that no longer
 *    ships is the substance of the entry (`:90` announces exactly that);
 *  - `.gitignore` must name the paths it ignores — a rule, not a pointer a
 *    reader is meant to follow.
 */
const NOT_SWEPT = new Set([
  join("tests", "unit", "repo-hygiene.test.ts"),
  join("scripts", "smoke-canaries.sh"),
  "playwright.config.ts",
  "CHANGELOG.md",
  "CLAUDE.md",
  ".gitignore",
]);

/**
 * Every shipped text file, resolved fresh so a pruned profile just has fewer.
 *
 * The repo root is swept at EVERY swept extension, not only `.md`: `proxy.ts`,
 * `proxy.static.ts`, `brand.config.ts` and the instrumentation/sentry configs
 * all live there, and a root-only-markdown sweep would have let a pointer in
 * any of them through.
 */
function sweptFiles(): string[] {
  const found: string[] = [];
  const swept = (entry: string) => SWEPT_EXTENSIONS.some((ext) => entry.endsWith(ext));

  for (const root of SHIPPED_ROOTS) {
    const abs = join(ROOT, root);
    if (!existsSync(abs)) continue; // a pruned profile legitimately lacks roots
    for (const entry of readdirSync(abs, { recursive: true }) as string[]) {
      const rel = join(root, entry);
      if (!swept(entry) || NOT_SWEPT.has(rel)) continue;
      // throwIfNoEntry: a dangling symlink in someone's tree is not a hygiene
      // failure, and this test ships.
      if (!statSync(join(ROOT, rel), { throwIfNoEntry: false })?.isFile()) continue;
      found.push(rel);
    }
  }
  for (const entry of readdirSync(ROOT) as string[]) {
    const stat = swept(entry) ? statSync(join(ROOT, entry), { throwIfNoEntry: false }) : null;
    if (stat?.isFile() && !NOT_SWEPT.has(entry)) {
      found.push(entry);
    }
  }
  for (const rel of EXTRA_SWEPT_FILES) {
    if (existsSync(join(ROOT, rel))) found.push(rel);
  }
  return found;
}

/** The excludes list only exists in the engine — it is excluded from itself. */
const EXCLUDES_FILE = join(ROOT, ".github", "sync-excludes.txt");
const isEngineCheckout = existsSync(EXCLUDES_FILE);

describe("shipped files never point at engine-internal paths", () => {
  it("no shipped file references one", () => {
    const hits: string[] = [];
    for (const rel of sweptFiles()) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      for (const { needle } of INTERNAL_PATHS) {
        if (text.includes(needle)) hits.push(`${rel} → ${needle}`);
      }
    }
    // In the engine the fix is never an exception: say the thing the pointer
    // stood in for, in the comment itself — the reader wanted the fact, not the
    // filename. In YOUR project this guard has no subject matter, so a hit on
    // your own writing means the entry should go, not your file.
    expect(
      hits,
      [
        "Shipped files point at paths the reader will not have:",
        ...hits.map((hit) => `  ${hit}`),
        "",
        "In the Cartwright engine: rewrite the comment to state the fact directly.",
        "In your own project: these needles are Cartwright's internal paths — if one",
        "matches a file of yours, delete that entry from INTERNAL_PATHS above.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("the sweep covers a real, non-trivial set of files", () => {
    // Without this, a broken walker would pass everything silently.
    const files = sweptFiles();

    // Anchors that survive every profile: a scaffold always has a readme, a
    // brand config (root .ts — so this also proves the root sweep runs) and
    // the brand module. Nothing here may assume a module a profile can prune,
    // or a customer's own `pnpm test` fails on OUR vacuity check.
    expect(files).toContain("README.md");
    expect(files).toContain("brand.config.ts");
    expect(files).toContain(join("lib", "brand.ts"));
    expect(files.length).toBeGreaterThan(50);
  });

  // Engine-only halves. Both are `skipIf` rather than an early `return`, so a
  // scaffold reports them as SKIPPED — this file's own rule is that a skip must
  // never be mistaken for a pass.
  it.skipIf(!isEngineCheckout)("sweeps every root the engine ships (full floor)", () => {
    const files = sweptFiles();
    expect(files.length).toBeGreaterThan(200);
    // One file per class the sweep gained after review: repo-root source, the
    // agent-rules files reachable only by explicit path, and a non-.md root.
    expect(files).toContain("proxy.static.ts");
    expect(files).toContain(join(".claude", "CLAUDE.md"));
    expect(files).toContain(join(".cursor", "rules", "cartwright.mdc"));
    expect(files).toContain(".windsurfrules");
  });

  it.skipIf(!isEngineCheckout)("every guarded path is still excluded from the mirror", () => {
    const lines = new Set(
      readFileSync(EXCLUDES_FILE, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    );
    // Guards the guard: a mis-parsed file would make every lookup below vacuous.
    expect(lines.has("internal-docs/")).toBe(true);

    for (const { needle, excludedBy } of INTERNAL_PATHS) {
      expect(
        lines.has(excludedBy),
        `${needle} is guarded as internal, but "${excludedBy}" is gone from sync-excludes.txt — either it ships now (drop the entry) or an exclusion was lost`,
      ).toBe(true);
    }
  });
});
