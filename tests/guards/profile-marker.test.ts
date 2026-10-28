import { describe, expect, it } from "vitest";

import { isEngineCheckout, onDisk, read, readProfileMarker } from "./_shared";

/**
 * STATIC — the marker every other guard reads.
 *
 * `.cartwright/profile.json` is how a scaffold knows what it is. Two guards in
 * this zone change behaviour based on it (`marketing-routes-absent` and
 * `identity-not-ours`), so a marker that is missing, unparsable or naming a
 * profile that does not exist turns them into no-ops without anybody noticing.
 *
 * THE THREE STATES, AND WHY THE THIRD IS NOT THE FIRST. Absent, declared, and
 * present-but-unreadable are different facts, and this guard used to have only
 * two names for them: `readProfileMarker` caught the JSON parse error and
 * returned the same `{ profile: "full", declared: false }` it returns when the
 * file is not there. So a corrupt marker printed a warning saying the file was
 * MISSING, asserted `marker.profile === "full"` against a value the reader had
 * just hardcoded, and passed — while `marketing-routes-absent` read the same
 * `declared: false` and skipped both of its tests. Measured on a materialized
 * `site` scaffold: `printf '{ this is not json' > .cartwright/profile.json`,
 * then this file plus `marketing-routes-absent` → `1 passed | 5 skipped`, zero
 * failures, on a tree still shipping all ten engine-only paths. The one defect
 * named in this docblock was the one it could not see. `malformed` is now its
 * own state and it is a hard failure.
 *
 * TODAY'S GAP, STATED RATHER THAN PAPERED OVER: `create-cartwright` writes the
 * marker for `site` (`schemaVersion: 2`, from the materializer) and for `light`
 * (v1, no `schemaVersion`, from `applyLightProfile`) — and writes NOTHING for
 * `full`, which routes through neither pruner. So a `full` scaffold is
 * indistinguishable from a tree nobody scaffolded, and this guard says so out
 * loud instead of asserting a file that cannot be there yet. Writing the `full`
 * marker is PR 0.2 in the CLI; when it lands, the warning below stops firing
 * and `marketing-routes-absent` starts covering `full` too.
 *
 * A skipped test here is reported as PENDING, never as a pass. Nothing in CI
 * reads those numbers yet — see `_shared.ts` — so the distinction is currently
 * for the human reading the run.
 */
const engine = isEngineCheckout();
const marker = readProfileMarker();

describe("guard: profile marker", () => {
  it.skipIf(!engine)("the engine checkout is not a scaffold and carries no profile marker", () => {
    expect(
      onDisk(".cartwright/profile.json"),
      "This tree has `.github/sync-excludes.txt`, so it is the engine — but it also has " +
        "`.cartwright/profile.json`, which only `create-cartwright` writes. One of the two " +
        "probes is now lying, and every scaffold-only guard in this zone reads them.",
    ).toBe(false);
  });

  it.skipIf(engine)("a marker that exists can be read", () => {
    expect(
      marker.malformed,
      "`.cartwright/profile.json` is on disk but is not readable as a profile — either it " +
        "is not valid JSON, or it has no string `profile` field. This is worse than having " +
        "no marker at all: every guard that switches on the profile falls back to `full` " +
        "and quietly stops checking, so a `site` scaffold with a corrupt marker reports the " +
        "same numbers as a clean one. Re-scaffold, or restore the file from " +
        "`create-cartwright`'s output.",
    ).toBe(false);
  });

  it.skipIf(engine)("a scaffold's marker names a profile the engine knows", () => {
    if (!marker.declared) {
      console.warn(
        "\n[guards] profile-marker: no `.cartwright/profile.json` — assuming `full`.\n" +
          "[guards] That is correct for a `--profile full` scaffold today (the CLI writes\n" +
          "[guards] the marker for `site` and `light` only) and wrong for anything else.\n" +
          "[guards] PR 0.2 makes `full` write it; until then this guard cannot tell the\n" +
          "[guards] two apart, and `marketing-routes-absent` does not run here.\n",
      );
      // Assert the DISK, not the value this file's own reader just defaulted.
      // `expect(marker.profile).toBe("full")` was `"full" === "full"` — a
      // branch that could not go red no matter what the tree looked like.
      expect(
        onDisk(".cartwright/profile.json"),
        "The marker reports itself undeclared, but `.cartwright/profile.json` IS on disk. " +
          "`readProfileMarker` has drifted from the file it reads, so every profile-scoped " +
          "guard in this zone is switching on a value nothing measured.",
      ).toBe(false);
      return;
    }
    expect(
      ["site", "light", "full"],
      `\`.cartwright/profile.json\` names profile "${marker.profile}". The engine knows ` +
        "site, light and full; a fourth name means a guard that switches on the profile " +
        "silently takes the wrong branch.",
    ).toContain(marker.profile);
  });

  it.skipIf(engine || !marker.declared)("a declared marker is self-consistent", () => {
    const raw = marker.raw ?? {};
    expect(raw.generatedBy, "The marker exists but does not say who wrote it.").toBe(
      "create-cartwright",
    );
    // v2 (the materializer's) carries the resolved module graph; v1 (light's)
    // carries kept designs. Either shape is fine — an EMPTY one is not, because
    // a marker with nothing in it cannot support `cartwright add` later.
    const hasBody =
      Array.isArray(raw.modules) ||
      Array.isArray(raw.keptDesigns) ||
      Array.isArray(raw.excludedPaths) ||
      Array.isArray(raw.removedPaths);
    expect(
      hasBody,
      "The marker names a profile but records nothing about the cut — no `modules`, " +
        "`keptDesigns`, `excludedPaths` or `removedPaths`. Additive upgrades anchor on this.",
    ).toBe(true);
  });

  it.skipIf(!engine)(
    "the guard zone travels: it is in neither the mirror's excludes nor the vitest blind spot",
    () => {
      const excludes = read(".github/sync-excludes.txt");
      expect(
        excludes,
        "`tests/guards/` has been added to the mirror excludes. Every scaffold is cut from " +
          "the mirror, so that deletes this entire zone from every customer's repository — " +
          "which is the one place these tests exist to run.",
      ).not.toMatch(/^\s*tests\/guards/m);

      const vitestConfig = read("vitest.config.ts");
      expect(
        vitestConfig,
        "`vitest.config.ts` no longer includes `tests/**`, so `pnpm test` in a scaffold " +
          "runs none of these guards.",
      ).toMatch(/tests\/\*\*/);
    },
  );
});
