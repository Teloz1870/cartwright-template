import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MODULES, PROFILES } from "@/modules/registry";
import {
  ENGINE_ONLY,
  ENGINE_ONLY_CLI_RELEASE,
  ENGINE_ONLY_PENDING_PROFILES,
  SHIPS_EVERYWHERE,
} from "@/scaffold/engine-only";
import { REPO_ROOT, WALK_IGNORE, isClaimedBy, isEngineCheckout, walkFiles } from "../helpers/claims";

/**
 * The inversion: instead of asking "does every claim point at a real file?"
 * (scaffold-manifest.test.ts already does), ask "does every real file have an
 * owner?".
 *
 * That question had no answer before this ledger, and the absence is what
 * shipped Cartwright's own marketing site to a customer. A module claim is an
 * EXCLUSION list — "delete this when the profile does not include me" — so a
 * file nobody claims is not neutral, it is shipped everywhere by default. Seven
 * of our own pages were in that state, and on a real
 * `create-cartwright@2.9.4 --profile site` scaffold four of them answered 200
 * on the customer's domain (owner CW-23; our W19/W38).
 *
 * A path directly under `app/[locale]` is covered iff:
 *   (a) a module claims it or an ancestor (the manifest's prefix rule), or
 *   (b) it is a directory whose EVERY route file is claimed per file — how the
 *       blog / reviews / three-scenes plugins own their routes, or
 *   (c) it is in `ENGINE_ONLY` (ours; the CLI deletes it), or
 *   (d) it is in `SHIPS_EVERYWHERE` (the customer's, unclaimed on purpose).
 *
 * A directory with no route files at all fails: it would ship as an empty
 * shell — files a customer carries forever that serve nothing.
 *
 * The same four rules run over the NON-locale half of `app/` (the root layout,
 * the error boundaries, the icon and OG renderers, `robots.ts`, `sitemap.ts`,
 * `app/manifest`), over the repo-root `*.md` files and over everything under
 * `.github/`, with a fifth way out: mirror-excluded, i.e. the file never
 * reaches the public template in the first place. Under `app/` itself the
 * empty-shell rule is relaxed — `app/actions` and `app/lib` are code, not
 * routes — so a route-less directory there is covered when every FILE in it is
 * claimed, and otherwise needs a ledger entry by name.
 *
 * ENGINE-ONLY BY CONSTRUCTION. The whole test reasons about the engine's file
 * set, so it skips in a scaffold — probed through `.github/sync-excludes.txt`,
 * the mirror's own exclude list, which is itself mirror-excluded and therefore
 * exists in exactly one repository. `tests/unit` ships to light/full scaffolds,
 * and a suite that goes red there while every engine gate is green is the
 * defect class of #550/#551/#572.
 */

const ROUTE_FILE = /^(page|route|layout|default|template|error|loading|not-found)\.(tsx?|jsx?)$/;

const claims = MODULES.flatMap((m) => m.files.map((f) => f.path));
const engineOnlyPaths = ENGINE_ONLY.map((e) => e.path);
const shipsEverywherePaths = SHIPS_EVERYWHERE.map((e) => e.path);

/** Non-comment patterns from the mirror's exclude list. */
function mirrorPatterns(): string[] {
  const file = path.join(REPO_ROOT, ".github", "sync-excludes.txt");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

const MIRROR = mirrorPatterns();

/**
 * rsync-ish: leading `/` anchors at the root, a trailing `/` is a directory, a
 * bare name matches a basename, and `*` matches within one path segment.
 *
 * The glob leg is not decoration. `.github/sync-excludes.txt` uses `*` in
 * several patterns (`.env.*.local` among them), and a literal-only matcher
 * reads each of those as a file that does not exist — so it reports a
 * mirror-excluded document as unowned. That is how three redundant
 * `ENGINE_ONLY` entries came to exist for engine build-night reports the mirror
 * already dropped. One list per fact only works if the reader of the list
 * understands its syntax.
 */
function isMirrorExcluded(rel: string): boolean {
  return MIRROR.some((raw) => {
    const anchored = raw.startsWith("/");
    const pat = raw.replace(/^\//, "").replace(/\/$/, "");
    if (pat.includes("*")) {
      const rx = new RegExp(
        `^${pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}(?:/|$)`,
      );
      if (rx.test(rel)) return true;
      return !anchored && !pat.includes("/") && rx.test(path.basename(rel));
    }
    if (rel === pat) return true;
    if (rel.startsWith(`${pat}/`)) return true;
    if (!anchored && !pat.includes("/") && path.basename(rel) === pat) return true;
    return false;
  });
}

/** Every route file under `rel`, repo-relative. */
function routeFiles(rel: string): string[] {
  return walkFiles(rel).filter((f) => ROUTE_FILE.test(path.basename(f)));
}

type Verdict = { covered: boolean; why: string };

type Options = {
  allowMirror: boolean;
  /**
   * `true` under `app/[locale]`, where every directory IS a route and one with
   * no route file would ship as an empty shell. `false` under `app/` itself,
   * which legitimately holds non-route code directories (`app/actions`,
   * `app/lib`) — there the per-file rule covers every file, not only routes.
   */
  routesExpected?: boolean;
};

function verdict(rel: string, { allowMirror, routesExpected = true }: Options): Verdict {
  if (isClaimedBy(rel, claims)) return { covered: true, why: "claimed by a module" };
  if (isClaimedBy(rel, engineOnlyPaths)) return { covered: true, why: "ENGINE_ONLY" };
  if (isClaimedBy(rel, shipsEverywherePaths)) return { covered: true, why: "SHIPS_EVERYWHERE" };
  if (allowMirror && isMirrorExcluded(rel)) return { covered: true, why: "mirror-excluded" };

  const abs = path.join(REPO_ROOT, rel);
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    const routes = routeFiles(rel);
    if (routes.length === 0) {
      if (routesExpected) {
        return {
          covered: false,
          why: "a directory with no route files — it would ship as an empty shell",
        };
      }
      const files = walkFiles(rel);
      const loose = files.filter((f) => !isClaimedBy(f, claims));
      if (files.length > 0 && loose.length === 0) {
        return { covered: true, why: "every file claimed per file" };
      }
      return {
        covered: false,
        why: files.length === 0 ? "nothing owns it" : `files nobody claims: ${loose.join(", ")}`,
      };
    }
    const orphans = routes.filter((f) => !isClaimedBy(f, claims));
    if (orphans.length === 0) return { covered: true, why: "every route file claimed per file" };
    return {
      covered: false,
      why: `route files nobody claims: ${orphans.join(", ")}`,
    };
  }
  return { covered: false, why: "nothing owns it" };
}

const HOWTO =
  "Give it an owner: claim it in modules/registry.ts, or add it to ENGINE_ONLY " +
  "(ours — the CLI deletes it from a customer's scaffold) or SHIPS_EVERYWHERE " +
  "(the customer's, unclaimed on purpose) in scaffold/engine-only.ts.";

describe.skipIf(!isEngineCheckout)("scaffold ownership — nothing ships by accident", () => {
  it("every entry under app/[locale] has an owner", () => {
    const dir = "app/[locale]";
    const uncovered = readdirSync(path.join(REPO_ROOT, dir))
      .map((name) => `${dir}/${name}`)
      .map((rel) => ({ rel, ...verdict(rel, { allowMirror: false }) }))
      .filter((v) => !v.covered)
      .map((v) => `${v.rel} — ${v.why}`);
    expect(uncovered, `unowned routes:\n${uncovered.join("\n")}\n\n${HOWTO}`).toEqual([]);
  });

  it("every entry directly under app/ has an owner", () => {
    // The locale tree has its own sweep above; this one is the non-locale half
    // — `app/manifest`, `app/robots.ts`, `app/sitemap.ts`, the root layout, the
    // icon and OG renderers. It was missing in the first version of this file,
    // and a reviewer was right that it mattered: `app/manifest` reached
    // ENGINE_ONLY by hand, and a future `app/foo/page.tsx` would have shipped
    // unowned with no test to say so.
    const dir = "app";
    const uncovered = readdirSync(path.join(REPO_ROOT, dir))
      .filter((name) => name !== "[locale]" && !WALK_IGNORE.has(name))
      .map((name) => `${dir}/${name}`)
      .map((rel) => ({ rel, ...verdict(rel, { allowMirror: true, routesExpected: false }) }))
      .filter((v) => !v.covered)
      .map((v) => `${v.rel} — ${v.why}`);
    expect(uncovered, `unowned app/ entries:\n${uncovered.join("\n")}\n\n${HOWTO}`).toEqual([]);
  });

  it("every repo-root *.md has an owner", () => {
    const uncovered = readdirSync(REPO_ROOT)
      .filter((f) => f.endsWith(".md") && statSync(path.join(REPO_ROOT, f)).isFile())
      .map((rel) => ({ rel, ...verdict(rel, { allowMirror: true }) }))
      .filter((v) => !v.covered)
      .map((v) => `${v.rel} — ${v.why}`);
    expect(uncovered, `unowned root docs:\n${uncovered.join("\n")}\n\n${HOWTO}`).toEqual([]);
  });

  it("every file under .github has an owner", () => {
    const uncovered = walkFiles(".github")
      .map((rel) => ({ rel, ...verdict(rel, { allowMirror: true }) }))
      .filter((v) => !v.covered)
      .map((v) => `${v.rel} — ${v.why}`);
    expect(uncovered, `unowned .github files:\n${uncovered.join("\n")}\n\n${HOWTO}`).toEqual([]);
  });

  it("the coverage rules can actually fail — an unowned route is reported by name", () => {
    // Without this, the three sweeps above would pass just as happily if
    // `verdict()` returned `covered: true` for everything.
    // A name no directory will ever have, so this stays a check of the RULE
    // even while someone is mutation-testing the sweep with a real route.
    const fake = verdict("app/[locale]/no-such-route-exists", { allowMirror: false });
    expect(fake.covered).toBe(false);
    expect(fake.why).toMatch(/nothing owns it/);
    // And the empty-shell rule is distinct from "nothing owns it": a real,
    // unclaimed, route-less directory (mirror-excluded, so the sweeps that
    // allow that escape never see it) reports the empty-shell reason.
    expect(verdict("internal-docs", { allowMirror: false })).toMatchObject({
      covered: false,
      why: expect.stringContaining("empty shell"),
    });
    // A directory claimed only per route file still passes (blog/reviews shape).
    expect(verdict("app/[locale]/blog", { allowMirror: false })).toMatchObject({
      covered: true,
      why: "every route file claimed per file",
    });
  });
});

describe.skipIf(!isEngineCheckout)("the ledger's own hygiene", () => {
  it("every listed path exists on disk", () => {
    for (const e of [...ENGINE_ONLY, ...SHIPS_EVERYWHERE]) {
      expect(existsSync(path.join(REPO_ROOT, e.path)), `missing ${e.path}`).toBe(true);
    }
  });

  it("every reason says something — over 40 characters", () => {
    for (const e of [...ENGINE_ONLY, ...SHIPS_EVERYWHERE]) {
      expect(e.reason.length, `${e.path}: reason too short to be a reason`).toBeGreaterThan(40);
    }
  });

  it("no path is in both lists, and no path is listed twice", () => {
    const engine = new Set(engineOnlyPaths);
    const both = shipsEverywherePaths.filter((p) => engine.has(p));
    expect(both, `a path cannot be both ours and the customer's: ${both.join(", ")}`).toEqual([]);
    for (const list of [engineOnlyPaths, shipsEverywherePaths]) {
      expect(new Set(list).size, `duplicate path in the ledger`).toBe(list.length);
    }
  });

  it("no ENGINE_ONLY path is claimed by a module — two owners is no owner", () => {
    // A module claim means "a profile may keep this"; ENGINE_ONLY means "no
    // customer ever gets it". Both at once is a contradiction the CLI would
    // resolve by accident (whichever deletion ran first).
    const conflicts = engineOnlyPaths
      .map((p) => ({
        p,
        owner: MODULES.find((m) => m.files.some((f) => f.path === p || p.startsWith(`${f.path}/`)))
          ?.slug,
      }))
      .filter((x) => x.owner)
      .map((x) => `${x.p} → claimed by "${x.owner}"`);
    expect(conflicts, `engine-only paths with a module owner:\n${conflicts.join("\n")}`).toEqual([]);
  });

  it("both lists are pinned to their exact length", () => {
    // One visible diff line per change: adding or removing an entry has to be
    // a deliberate edit to this number, not a silent side effect.
    expect(ENGINE_ONLY.length).toBe(10);
    expect(SHIPS_EVERYWHERE.length).toBe(24);
  });
});

/**
 * The gap this PR SHIPS, stated so it cannot change shape in silence.
 *
 * `ENGINE_ONLY` promises "never in a customer's scaffold" for every profile.
 * The interlock that makes deleting those routes safe —
 * `profileCapabilities.engineMarketing` — reaches a scaffold through a seam the
 * `mcp` module provides, so only a profile WITHOUT `mcp` gets the false twin.
 * Today that is `site` alone, and `light` (an alias of `managed-site`, and the
 * CLI's default) is on the wrong side of it.
 *
 * Nothing here can test the CLI. What it can do is stop the set from drifting
 * while B4 is pending: the pinned list has to equal the set derived from the
 * manifest, so a new profile, `site` gaining `mcp`, or the seam's provider
 * moving all fail by name instead of widening the gap unnoticed.
 */
describe.skipIf(!isEngineCheckout)("the engineMarketing interlock is narrower than the ledger", () => {
  const SEAM = "lib/profile-capabilities.ts";

  /** Profiles whose resolved module set PROVIDES the seam → all-true file. */
  function profilesKeepingTheEngineFile(): string[] {
    const bySlug = new Map(MODULES.map((m) => [m.slug, m]));
    const providers = new Set(
      MODULES.filter((m) => m.replaces.some((r) => r.target === SEAM)).map((m) => m.slug),
    );
    expect(providers.size, `nothing provides ${SEAM} — the seam model changed`).toBeGreaterThan(0);
    return PROFILES.filter((p) => {
      const included = new Set<string>();
      const queue = ["core", ...p.modules];
      while (queue.length) {
        const slug = queue.pop()!;
        if (included.has(slug)) continue;
        const m = bySlug.get(slug);
        expect(m, `profile "${p.name}" names unknown module "${slug}"`).toBeDefined();
        included.add(slug);
        queue.push(...m!.dependsOn);
      }
      return [...providers].some((s) => included.has(s));
    })
      .map((p) => p.name)
      .sort();
  }

  it("the pending-profile list is exactly the set that keeps the all-true file", () => {
    expect(
      profilesKeepingTheEngineFile(),
      "ENGINE_ONLY_PENDING_PROFILES is stale. Either a profile changed, or B4 landed — " +
        "in which case shrink the list rather than editing it to match.",
    ).toEqual([...ENGINE_ONLY_PENDING_PROFILES].sort());
  });

  it("`site` is the only profile the interlock reaches today", () => {
    // The other half of the same fact, stated positively so that a future
    // profile inheriting the twin shows up as a shrinking list above and a
    // growing one here — never as silence.
    const covered = PROFILES.map((p) => p.name).filter(
      (n) => !profilesKeepingTheEngineFile().includes(n),
    );
    expect(covered).toEqual(["site"]);
  });

  /**
   * The other unbuilt half, and the one a CUSTOMER pays for. `ENGINE_ONLY` says
   * the CLI deletes these; no released `create-cartwright` reads the ledger at
   * all. A document that ships into the customer's repository and asserts the
   * deletion in the present tense is a promise their tree does not keep — and
   * `docs/simple-site.md` went one worse, telling a reader who found
   * `/cartwright` in their project that their ENGINE was too old.
   *
   * `.claude/` IS SCANNED. The first version swept the repo-root `*.md` files
   * and `docs/` only, which left the two agent briefings disagreeing about the
   * same fact: the engine-private root `CLAUDE.md` had been updated while
   * `.claude/CLAUDE.md` — the one that actually ships to light and full
   * scaffolds, and the one a customer's agent loads every session — still
   * described `cartwrightBadge` as a footer badge a customer flips off. An
   * agent briefing is the highest-leverage place for a stale sentence: it is
   * read by the thing that then writes code.
   */
  it("every shipped doc that names the ledger also names the release that makes it true", () => {
    const naming = [
      ...readdirSync(REPO_ROOT).filter(
        (f) => f.endsWith(".md") && statSync(path.join(REPO_ROOT, f)).isFile(),
      ),
      ...walkFiles("docs").filter((f) => f.endsWith(".md")),
      ...walkFiles(".claude").filter((f) => f.endsWith(".md")),
      // `tests/guards/` ships into the customer's repository and RUNS there, so
      // a promise made in its README reaches exactly the reader this rule is
      // about — and further than `docs/` does, since `--profile site` keeps the
      // guard zone. It was outside the walk until it had a document to police.
      ...walkFiles("tests/guards").filter((f) => f.endsWith(".md")),
    ]
      .filter((f) => !isMirrorExcluded(f) && !isClaimedBy(f, engineOnlyPaths))
      .filter((f) =>
        /engineOnly|scaffold\/engine-only/.test(readFileSync(path.join(REPO_ROOT, f), "utf8")),
      );

    // Not vacuous: if the walk or the filter broke, every assertion below would
    // pass over an empty list. The engine-private root CLAUDE.md names the
    // ledger too and is deliberately absent — it is mirror-excluded, so it
    // reaches no customer and carries no promise to one.
    expect(naming.sort(), "the documents that carry this claim to customers").toEqual([
      ".claude/CLAUDE.md",
      "FORK_GUIDE.md",
      "README.md",
      "docs/simple-site.md",
      "tests/guards/README.md",
    ]);

    if (ENGINE_ONLY_CLI_RELEASE === null) return; // B4 shipped — obligation lifted.

    // PER SECTION, NOT PER FILE — the same lesson as the per-link rule in
    // pruned-route-hrefs.test.ts. A file-level "does it say 2.10 anywhere"
    // check passes on `docs/simple-site.md` purely because an unrelated
    // contact-form bullet names the release two headings above: a mutation that
    // deleted the caveat from the engine-only section left this green. So the
    // caveat has to sit under the same markdown heading as the claim.
    for (const f of naming) {
      const lines = readFileSync(path.join(REPO_ROOT, f), "utf8").split("\n");
      const sections: string[][] = [[]];
      for (const line of lines) {
        if (/^#{1,6}\s/.test(line)) sections.push([]);
        sections[sections.length - 1].push(line);
      }
      const claiming = sections.filter((s) =>
        /engineOnly|scaffold\/engine-only/.test(s.join("\n")),
      );
      expect(claiming.length, `${f}: the ledger mention vanished — update this test`).toBeGreaterThan(
        0,
      );
      for (const section of claiming) {
        expect(
          section.join("\n"),
          `${f} → section "${(section[0] || "(top)").trim()}" promises the engine-only deletion ` +
            `to a customer without saying when it starts being true. Name create-cartwright ` +
            `${ENGINE_ONLY_CLI_RELEASE} in THIS section, or set ENGINE_ONLY_CLI_RELEASE to null ` +
            `once the CLI actually does it.`,
        ).toContain(ENGINE_ONLY_CLI_RELEASE);
      }
    }
  });

  /**
   * The doc-obligation test above pins the RELEASE STRING; this one pins the
   * PATHS. `docs/simple-site.md` hands the customer an `rm -rf` line while the
   * CLI half is unbuilt, and that line was ten paths typed out by hand with
   * nothing tying it to the ledger it claims to implement. An eleventh entry —
   * exactly the edit the ledger is designed to make cheap — would leave the
   * customer's remediation silently one path short, and the file that told them
   * to run it still passing every gate.
   *
   * So the command is derived-checked in both directions: every `ENGINE_ONLY`
   * path must appear in it, and it must contain nothing else.
   */
  it("the doc's rm -rf remediation is exactly the ledger, in both directions", () => {
    const doc = "docs/simple-site.md";
    const src = readFileSync(path.join(REPO_ROOT, doc), "utf8");

    const fence = src.match(/```bash\n(rm -rf[\s\S]*?)```/);
    expect(
      fence,
      `${doc} no longer contains the \`rm -rf\` block this test pins. If the remediation moved ` +
        `or the CLI now does the deletion, update this test deliberately.`,
    ).not.toBeNull();

    // Shell-ish, and honest about it: join the backslash continuations, drop
    // the command word, then read quoted strings and bare words as tokens.
    const command = fence![1].replace(/\\\n/g, " ").replace(/^rm\s+-rf\s+/, "");
    const paths = [...command.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
      (m) => m[1] ?? m[2] ?? m[3],
    );

    expect(paths.length, "the tokenizer found nothing — the block's shape changed").toBeGreaterThan(
      0,
    );
    expect(
      [...paths].sort(),
      `${doc}'s rm -rf line and ENGINE_ONLY have drifted. A path in the ledger but not the ` +
        `command leaves a customer's remediation incomplete; one in the command but not the ` +
        `ledger tells them to delete something we did not claim.`,
    ).toEqual([...engineOnlyPaths].sort());
  });

  it("the false twin really is false, and the engine tree really is true", () => {
    // Without this the two lists above could agree perfectly about a seam whose
    // variants had stopped disagreeing — a pin around nothing.
    const read = (f: string) =>
      readFileSync(path.join(REPO_ROOT, f), "utf8").match(/engineMarketing:\s*(true|false)/)?.[1];
    expect(read("lib/profile-capabilities.ts")).toBe("true");
    expect(read("lib/profile-capabilities.static.ts")).toBe("false");
  });
});
