import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The `tests/guards/` zone — the only tests that run INSIDE a customer's
 * materialized scaffold.
 *
 * WHY A SEPARATE ZONE. Every defect measured on the way here was invisible in
 * the engine and visible in a scaffold: dead nav links (#572), a `TS2367` that
 * only a single-locale tree can produce (#550/#551), Cartwright's own marketing
 * routes answering 200 on a customer's domain (owner CW-23), five `package.json`
 * scripts pointing at deleted files (owner CW-27), `fetch("/api/gallery")`
 * against a route the profile removed (owner CW-29). The engine suite cannot see
 * any of them, because the engine is the one tree where nothing is missing.
 *
 * `tests/unit/` does not travel: `create-cartwright --profile site` deletes it
 * wholesale (`SITE_PRUNED_ZONES`) and `--profile light` deletes twelve named
 * entries out of it — nine files and three directories, seventeen files on
 * disk (`LIGHT_EXCLUDED_PATHS`, counted in the CLI at create-cartwright 2.9.5).
 * This directory is named in neither list. The mirror's exclude file strips a
 * good deal more than tests (a config, a script, a private briefing, three
 * workflows, the engine's internal notes) but from `tests/` it strips exactly
 * `tests/e2e/` and `tests/engine/` — not this zone. `vitest.config.ts` already
 * includes `tests/**`, so these tests reach every profile and every fork, and
 * the site profile's `vitest run --passWithNoTests` stops being a no-op.
 *
 * THE RULES A GUARD OBEYS (pinned by `guards-are-portable.test.ts`):
 *
 *   1. No `@/…` imports. The alias resolves to files a profile may have pruned,
 *      and a guard that cannot load is a guard that cannot fail.
 *   2. No git. A scaffold is created with `--no-git`; `git ls-files` returns
 *      nothing and a walk that trusts it silently checks zero files.
 *   3. Node builtins, `vitest`, disk and HTTP — nothing else. Every other
 *      dependency is prunable.
 *   4. "Am I the engine?" is `.github/sync-excludes.txt` on disk. It is the one
 *      file that exists here and, by its own content, in no scaffold.
 *   5. The profile comes from `.cartwright/profile.json`. A `full` scaffold has
 *      none today — treat absent as `full` and SAY SO (writing it is 0.2's job).
 *
 * Two kinds of guard: STATIC ones read the disk and always run; LIVE ones talk
 * HTTP to `GUARD_BASE_URL` and skip loudly without it.
 *
 * NO GATE RUNS THE LIVE HALF YET, AND THIS FILE WILL NOT PRETEND OTHERWISE.
 * Nothing in this repository sets `GUARD_BASE_URL` — not a workflow, not a
 * script — so today the live guards are run by a human following the recipe in
 * `README.md`, and they report PENDING everywhere else. The skip is therefore
 * built to stay legible to a machine that does not exist yet: it is a vitest
 * `skipIf`, so the JSON reporter counts it as pending rather than passed, and
 * the INTENDED gate step (boot the built app, export the origin, assert
 * `numPendingTests` for the two live files is 0) can be added without touching
 * a guard. Until that step exists, "the live guards passed" is a claim nobody
 * has measured in CI.
 */

/** Repo root, from this file's own location — never from `cwd`. */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const WALK_IGNORE = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  ".turbo",
  "coverage",
  ".mail-previews",
  "generated",
]);

export const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const abs = (rel: string): string => path.join(REPO_ROOT, rel);
export const onDisk = (rel: string): boolean => existsSync(abs(rel));
export const read = (rel: string): string => readFileSync(abs(rel), "utf8");

/**
 * Is this the engine checkout rather than a customer's scaffold?
 *
 * `.github/sync-excludes.txt` is the mirror's own exclude list, and it excludes
 * itself (`.github/sync-excludes.txt` is a line in it), so it reaches neither
 * the public template nor any scaffold cut from it.
 */
export const isEngineCheckout = (): boolean => onDisk(".github/sync-excludes.txt");

export type ProfileMarker = {
  /** `site` | `light` | `full` (`full` is INFERRED when the marker is absent). */
  profile: string;
  /** False when the marker file was missing and `full` was assumed. */
  declared: boolean;
  /**
   * The marker file EXISTS but could not be read as a profile — invalid JSON,
   * or JSON without a string `profile`.
   *
   * This is a third state and it must never be folded into the other two.
   * Absent means "nobody scaffolded this, or it is a `full` scaffold"; present
   * means "the CLI said what this is". Present-but-broken means the CLI's own
   * output is corrupt, and returning it as `{ profile: "full", declared:
   * false }` — which is what this function used to do — made it byte-identical
   * to absent. Measured on a real `site` scaffold before the fix: overwriting
   * the marker with `{ this is not json` produced `1 passed | 5 skipped` and no
   * failure, on a tree still shipping all ten of Cartwright's own paths. The
   * guard whose whole stated purpose is catching an unparsable marker read it
   * as a missing one and printed a warning naming the wrong defect.
   */
  malformed: boolean;
  raw: Record<string, unknown> | null;
};

/**
 * The profile this tree was cut as.
 *
 * `create-cartwright` writes `.cartwright/profile.json` for `site`
 * (`schemaVersion: 2`) and for `light` (v1, no `schemaVersion`) — and for
 * `full` it writes nothing at all, because `full` never routes through either
 * pruner. So "absent" is ambiguous between "a full scaffold" and "a tree nobody
 * scaffolded", and the engine probe is what separates them. Guards that must
 * not run in the engine ask `isEngineCheckout()` FIRST.
 */
export function readProfileMarker(): ProfileMarker {
  const rel = ".cartwright/profile.json";
  if (!onDisk(rel)) {
    return { profile: "full", declared: false, malformed: false, raw: null };
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(read(rel)) as Record<string, unknown>;
  } catch {
    return { profile: "full", declared: false, malformed: true, raw: null };
  }
  if (typeof raw?.profile !== "string") {
    return { profile: "full", declared: false, malformed: true, raw: raw ?? null };
  }
  return { profile: raw.profile, declared: true, malformed: false, raw };
}

/** Every code file at or under `rel`, depth-first. A missing path yields nothing. */
export function walkCode(rel: string): string[] {
  const target = abs(rel);
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return CODE_EXT.test(rel) ? [rel] : [];
  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (WALK_IGNORE.has(entry.name)) continue;
    out.push(...walkCode(`${rel}/${entry.name}`));
  }
  return out;
}

/** Immediate subdirectory names of `rel` (empty when it does not exist). */
export function subdirs(rel: string): string[] {
  const target = abs(rel);
  if (!existsSync(target) || !statSync(target).isDirectory()) return [];
  return readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !WALK_IGNORE.has(e.name))
    .map((e) => e.name);
}

/**
 * Source with comments blanked, line count preserved. Literals survive intact —
 * they are the payload every caller reads.
 *
 * Comments are not noise here, they are the point: `create-cartwright` keeps
 * the doc links in `brand.config.ts` comments on purpose (`isCommentLine` in
 * the CLI's `stripEngineDomains`), so a guard that greps raw text calls a
 * deliberate pointer a leak. Same reason `no-dead-fetches` reads stripped
 * source: a `fetch("/api/…")` inside a docblock is an example, not a call.
 *
 * WHY A SCANNER AND NOT TWO REGEXES. The regex form of this was
 * `.replace(/(^|[^:])\/\/.*$/gm, "$1")`, whose `[^:]` guard exists to spare
 * `https://`. It does not spare a `//` inside any other string, and the zone
 * contains one: `chrome-no-dead-links.test.ts` opens a line with
 * `href.startsWith("//")`. Measured on that exact line, the regex returned
 * `if (href.startsWith("` — an unterminated quote — and the meta guard, which
 * runs `stripLiterals` over this output, then read the rest of the file as one
 * long open string and scanned six lines of executable code as blank. A guard
 * that cannot see `execSync(` because a sibling line mentioned a
 * protocol-relative URL is not a guard.
 *
 * So: one pass, skipping over strings, templates and regex literals rather than
 * around them. Newlines inside a block comment are preserved so `lineOf` still
 * reports the source's own line numbers.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  /** Last significant code character — decides regex-literal vs. division. */
  let prev = "\n";
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue; // the newline itself is emitted by the next iteration
    }

    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      out += src[i] ?? "";
      i++;
      prev = c;
      continue;
    }

    // A regex literal can only open where a value is expected. `//` was already
    // consumed as a line comment above, which matches how JS itself parses it.
    if (c === "/" && /[(,=:[!&|?+\-*%;{}\n]/.test(prev)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        out += src.slice(i, j + 1);
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

/** 1-indexed line number of `index` within `src`. */
export const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

// ── LIVE guards ─────────────────────────────────────────────────────────────

/**
 * The origin a live guard probes, or null.
 *
 * Never guessed: a guard that quietly falls back to `localhost:3000` passes
 * against whatever happens to be running. Nothing in CI supplies this today
 * (see the file docblock) — a human does, following `README.md`.
 */
export function guardBaseUrl(): string | null {
  const raw = process.env.GUARD_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** The one-line reason a live guard is not running. Printed, never swallowed. */
export function warnLiveSkipped(guard: string): void {
  console.warn(
    `\n[guards] SKIPPED ${guard} — GUARD_BASE_URL is not set, so nothing was checked.\n` +
      `[guards] Start the built app and re-run:\n` +
      `[guards]   GUARD_BASE_URL=http://localhost:3000 pnpm exec vitest run tests/guards\n`,
  );
}

export type Probe = { url: string; status: number; error?: string };

/** GET a URL, following redirects, and report the status (0 = transport error). */
export async function probe(url: string, init?: RequestInit): Promise<Probe> {
  try {
    const res = await fetch(url, { redirect: "follow", ...init });
    return { url, status: res.status };
  } catch (err) {
    return { url, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** GET a URL and return status + body text (empty on transport error). */
export async function fetchText(url: string): Promise<{ status: number; body: string; url: string }> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { status: res.status, body: await res.text(), url: res.url || url };
  } catch (err) {
    return { status: 0, body: "", url: err instanceof Error ? err.message : String(err) };
  }
}
