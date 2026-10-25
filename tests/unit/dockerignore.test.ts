import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { STANDALONE_TRACE_EXCLUDES } from "@/lib/build-output";

import { isEngineCheckout } from "../guards/_shared";

/**
 * HOST2-1 (R1 must-fix): `.dockerignore` keeps local data and secrets out of
 * the image, at ANY depth.
 *
 * The first version listed `*.db`. Docker anchors that to the context root, so
 * it matched `dev.db` but not `prisma/dev.db` or DEPLOY.md's
 * `file:./data/prod.db` — and `COPY . .` plus whole-tree file tracing would
 * have carried a nested customer database into the runtime image. A test that
 * only checked the literal entry `*.db` was present passed on exactly that bug.
 *
 * So these assertions run the file through Docker's own matching rules (a port
 * of moby/patternmatcher, the matcher BuildKit uses for the build context) and
 * ask about concrete paths, never about pattern text. The port is checked
 * first against the examples in Docker's documentation, so a broken matcher
 * cannot make the real assertions pass.
 *
 * THIS FILE SHIPS TO CUSTOMERS (tests/unit lands in every scaffold, often with
 * no git). The data/secret assertions read only `.dockerignore`, which ships
 * unchanged. The two that read `.gitignore` or `git ls-files` are engine-only:
 * a customer's own `.gitignore` lines are theirs to decide on.
 */
const ROOT = path.resolve(__dirname, "..", "..");

type DockerPattern = { re: RegExp; exclusion: boolean };

/** moby/patternmatcher `Pattern.compile`, regexp branch (the other branches are shortcuts with the same result). */
function compileDockerPattern(pattern: string): RegExp {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") i++; // `**/` is treated as `**`
        // `**` at the end accepts everything; elsewhere any number of whole segments, even none.
        re += i + 1 >= pattern.length ? ".*" : "(.*/)?";
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (".+()|{}$".includes(ch)) {
      re += `\\${ch}`;
    } else if (ch === "\\" && i + 1 < pattern.length) {
      re += `\\${pattern[++i]}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`${re}$`);
}

/** BuildKit's dockerignore `ReadAll`: comments, trimming, `!`, filepath.Clean, leading `/` dropped. */
function parseDockerignore(text: string): DockerPattern[] {
  const patterns: DockerPattern[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("#")) continue;
    let pattern = raw.trim();
    if (!pattern) continue;
    const exclusion = pattern.startsWith("!");
    if (exclusion) pattern = pattern.slice(1).trim();
    pattern = path.posix.normalize(pattern).replace(/(.)\/+$/, "$1");
    if (pattern.length > 1 && pattern.startsWith("/")) pattern = pattern.slice(1);
    patterns.push({ re: compileDockerPattern(pattern), exclusion });
  }
  return patterns;
}

/** moby/patternmatcher `MatchesOrParentMatches`: the last matching line wins; a matched parent directory excludes its contents. */
function dockerIgnores(patterns: DockerPattern[], file: string): boolean {
  const parents = file.split("/").slice(0, -1);
  let matched = false;
  for (const { re, exclusion } of patterns) {
    if (exclusion !== matched) continue;
    let match = re.test(file);
    for (let i = 1; !match && i <= parents.length; i++) {
      match = re.test(parents.slice(0, i).join("/"));
    }
    if (match) matched = !exclusion;
  }
  return matched;
}

const ignores = (dockerignore: string, file: string) =>
  dockerIgnores(parseDockerignore(dockerignore), file);

const dockerignore = parseDockerignore(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"));
const excluded = (file: string) => dockerIgnores(dockerignore, file);

describe("the Docker matcher port behaves like Docker (its documented examples)", () => {
  it("anchors a plain pattern to the context root — the bug this file exists for", () => {
    expect(ignores("*.db", "dev.db")).toBe(true);
    expect(ignores("*.db", "prisma/dev.db")).toBe(false);
    expect(ignores("**/*.db", "dev.db")).toBe(true);
    expect(ignores("**/*.db", "data/prod.db")).toBe(true);
  });

  it("matches the examples in Docker's .dockerignore documentation", () => {
    expect(ignores("*/temp*", "somedir/temporary.txt")).toBe(true);
    expect(ignores("*/temp*", "somedir/temp")).toBe(true);
    expect(ignores("*/temp*", "temporary.txt")).toBe(false);
    expect(ignores("*/*/temp*", "somedir/subdir/temporary.txt")).toBe(true);
    expect(ignores("temp?", "tempa")).toBe(true);
    expect(ignores("temp?", "somedir/tempa")).toBe(false);
    expect(ignores("**/*.go", "a/b/c/main.go")).toBe(true);
    expect(ignores("*.md\n!README.md", "README.md")).toBe(false);
    expect(ignores("*.md\n!README.md", "CHANGES.md")).toBe(true);
  });

  it("excludes a directory's contents when the directory matches, and drops a trailing slash", () => {
    expect(ignores("backups/", "backups/2026-10-01.json")).toBe(true);
    expect(ignores("/backups", "backups/a/b.json")).toBe(true);
    expect(ignores("# backups", "backups/a.json")).toBe(false);
  });
});

/**
 * Data and secrets, at the root AND nested. Each nested path is one a real
 * project produces: DEPLOY.md documents `file:./data/prod.db`, `pnpm db:setup`
 * writes `prisma/dev.db` and `.admin-credentials`, `vercel env pull` writes
 * into `.vercel/`, the GDPR export writes `backups/`, and the dev mailer writes
 * `.mail-previews/` (magic links and customer email).
 */
const MUST_EXCLUDE = [
  "dev.db",
  "prisma/dev.db",
  "data/prod.db",
  "data/prod.db-wal",
  "data/prod.db-shm",
  "prisma/dev.db-journal",
  "tests/fixtures/replays/run-1/dev.db",
  "data/shop.sqlite",
  "data/shop.sqlite3",
  "data/shop.sqlite-wal",
  ".env",
  ".env.local",
  ".env.production",
  "data/.env",
  "apps/shop/.env.production.local",
  ".admin-credentials",
  ".admin-credentials.prod",
  "data/.admin-credentials",
  "server.pem",
  "certs/server.pem",
  "cookie.txt",
  "scripts/cookie.txt",
  ".vercel/project.json",
  "apps/shop/.vercel/.env.production.local",
  ".mcp.json",
  "apps/shop/.mcp.json",
  "i18nexus.json",
  "apps/shop/i18nexus.json",
  "backups/2026-10-01.json",
  "data/backups/orders.sql",
  ".mail-previews/1.html",
  "apps/shop/.mail-previews/1.html",
];

/** What the build needs. An over-broad pattern (`**`, `**\/*.ts`, `**\/prisma`) goes red here. */
const MUST_KEEP = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "next.config.ts",
  "brand.config.ts",
  "proxy.ts",
  "prisma/schema.prisma",
  "prisma.config.ts",
  "prisma/migrations/0001_baseline/migration.sql",
  "app/[locale]/page.tsx",
  "app/api/cron/backup/route.ts",
  "lib/db.ts",
  "lib/build-output.ts",
  "scripts/build-registry-source.ts",
  "public/cartwright.png",
  ".cartwright/release.json",
  ".env.example",
];

describe(".dockerignore — data and secrets stay out at any depth", () => {
  it.each(MUST_EXCLUDE)("excludes %s", (file) => {
    expect(excluded(file)).toBe(true);
  });

  it.each(MUST_KEEP)("keeps %s", (file) => {
    expect(excluded(file)).toBe(false);
  });
});

/**
 * The same data, kept out of a standalone build run straight from a checkout.
 * Whole-tree tracing copies whatever lies in the project into
 * `.next/standalone` (measured — see lib/build-output.ts), so the exclude list
 * must cover every data path above that the tracer can reach.
 *
 * These check the glob list against paths, not a build's output. Next copies
 * the root `.env` and `.env.production` into `.next/standalone` AFTER tracing,
 * so the `.env` cases here say nothing about them: `stripStandaloneEnvFiles`
 * removes those, and tests/unit/build-output.test.ts checks it (and that the
 * real next.config.ts sets these excludes only for a standalone build).
 */
describe("standalone trace excludes — exact", () => {
  // Next matches these with picomatch `{ dot: true }`, so `*` and `**` cross
  // dotfiles and dot-folders. The list only uses a leading `**/`, `*` and a
  // trailing `/**` (asserted below), which this converts exactly.
  const toRegExp = (glob: string) =>
    new RegExp(
      `^${glob
        .replace(/[.+()|{}$^]/g, "\\$&")
        .replace(/^\*\*\//, "\u0000")
        .replace(/\/\*\*$/, "\u0001")
        .replace(/\*/g, "[^/]*")
        .replace("\u0000", "(?:.*/)?")
        .replace("\u0001", "/.*")}$`,
    );
  const traced = (file: string) => STANDALONE_TRACE_EXCLUDES.some((g) => toRegExp(g).test(file));

  it("use only the glob forms the check above models", () => {
    for (const glob of STANDALONE_TRACE_EXCLUDES) {
      expect(glob, glob).toMatch(/^\*\*\/(?:[^*?[\]{}!]|\*(?!\*))*(\/\*\*)?$/);
    }
  });

  it.each(MUST_EXCLUDE)("drop %s from the trace", (file) => {
    expect(traced(file)).toBe(true);
  });

  it("do not drop Prisma's SQLite query compiler, the database driver or the app", () => {
    const prismaRuntime = "node_modules/.pnpm/@prisma+client@7/node_modules/@prisma/client/runtime";
    for (const file of [
      `${prismaRuntime}/query_compiler_fast_bg.sqlite.mjs`,
      `${prismaRuntime}/query_compiler_fast_bg.sqlite.wasm-base64.mjs`,
      "node_modules/@libsql/darwin-arm64/index.node",
      "prisma/schema.prisma",
      "app/api/cron/backup/route.ts",
      "lib/db.ts",
    ]) {
      expect(traced(file), file).toBe(false);
    }
  });
});

/** git's verdict for each path, in one call (`--no-index`: tracked or not). */
function gitIgnored(paths: string[]): Set<string> {
  try {
    const out = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: ROOT,
      input: paths.join("\n"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch (err) {
    if ((err as { status?: number }).status === 1) return new Set(); // none ignored
    throw err;
  }
}

const hasGitRepo = (() => {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!isEngineCheckout() || !hasGitRepo)(".dockerignore mirrors .gitignore (engine)", () => {
  /**
   * A .gitignore pattern with no slash but a trailing one applies at every
   * depth in git. Docker needs `**\/` for the same reach, so each such pattern
   * is turned into a concrete path (`*` → `x`, a directory gets a file inside)
   * and asked about at the root and two levels down. git must ignore the path
   * too — that proves the probe really stands for the pattern — and Docker
   * must exclude it. A new data pattern in .gitignore without its `**\/` twin
   * in .dockerignore goes red here.
   */
  const unanchored = readFileSync(path.join(ROOT, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .filter((line) => !line.replace(/\/$/, "").includes("/"));

  const probes = unanchored.flatMap((pattern) => {
    const name = pattern.replace(/\/$/, "").replace(/[*?]/g, "x");
    const probe = pattern.endsWith("/") ? `${name}/f` : name;
    return [probe, `deep/nested/${probe}`];
  });

  it("has unanchored patterns to check (guards against a parser that finds none)", () => {
    expect(unanchored).toEqual(expect.arrayContaining(["*.db", ".env*", "backups/", "*.pem"]));
  });

  it("every path git ignores at any depth, Docker excludes too", () => {
    const byGit = gitIgnored(probes);
    expect(probes.filter((p) => !byGit.has(p))).toEqual([]);
    expect(probes.filter((p) => !excluded(p))).toEqual([]);
  });

  it("the recursive patterns drop no tracked file beyond the agent folder and the Docker files", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
    const dropped = tracked.filter(excluded);
    expect(dropped.filter((f) => !/^(\.claude\/|Dockerfile$|\.dockerignore$)/.test(f))).toEqual([]);
    expect(dropped).toContain("Dockerfile"); // the walk is not vacuous
  });
});

/**
 * One Node major across the toolchain: `.nvmrc` (local dev, `nvm use`), the
 * PR gate's test job and the image. The image was on 24 while everything else
 * was on 22.
 */
describe.skipIf(!existsSync(path.join(ROOT, ".nvmrc")))("Dockerfile — Node version", () => {
  it("builds and runs on the Node major .nvmrc names", () => {
    const nvmrc = readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim().replace(/^v/, "");
    const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    expect(dockerfile.match(/^ARG NODE_VERSION=(\d+)/m)?.[1]).toBe(nvmrc.split(".")[0]);
  });
});
