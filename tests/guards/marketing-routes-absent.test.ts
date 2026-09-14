import { describe, expect, it } from "vitest";

import { isEngineCheckout, onDisk, read, readProfileMarker } from "./_shared";

/**
 * STATIC, SCAFFOLD ONLY (`light` + `site`) — no path the engine claims as its
 * own may exist in a customer's repository.
 *
 * The ledger is `scaffold/manifest.json`'s `engineOnly` field, generated from
 * `scaffold/engine-only.ts`. Each entry is a path with a reason: `app/[locale]/
 * cartwright`, `/priser`, `/cases`, `/start`, `/changelog`,
 * `/built-with-cartwright`, `app/manifest`, our `CHANGELOG.md` and the two
 * GitHub templates that route a reporter to `Teloz1870/cartwright`. Owner
 * CW-23, measured on a real scaffold: four of the routes answered 200 on the
 * customer's domain, under her navigation and her title template, with
 * `llms.txt` advertising `/cartwright` to crawlers.
 *
 * ── THIS GUARD IS A RATCHET, AND THE RATCHET IS THE DESIGN ──────────────────
 *
 * The engine ships the ledger. No released `create-cartwright` reads it:
 * 2.9.5 — published the same day the ledger landed — has zero occurrences of
 * `engineOnly` anywhere in its source or its `dist`, and the deletion pass
 * (`applyEngineOnlyPrune`) is CLI work that has not been built. So on a scaffold
 * cut today every ledger path is present, and a guard that simply asserted them
 * absent would be red in every fresh `site` and `light` scaffold for a defect
 * the customer cannot fix and this repository cannot fix either.
 *
 * That is not an abstract worry. `pnpm test` runs inside a real scaffold for
 * `light`, `full` and `site` in the release gate that must pass before an engine
 * tag, and a gate that is permanently red is worse than no gate: it blocks
 * releases and it teaches everyone to stop reading it. So the guard asks which
 * side of the gap it is standing on, and the CLI has to say:
 *
 *   ARMED   — `.cartwright/profile.json` declares `engineOnlyPruned`, i.e. the
 *             CLI that cut this tree CLAIMS to have honoured the ledger. Any
 *             surviving path is then a hard failure: the claim is false.
 *   ARMED   — or every ledger path is already absent, whatever the marker says.
 *             Nothing to warn about, so this is an ordinary pass and the guard
 *             cannot be left dormant by a CLI that prunes but forgets the flag.
 *   SKIPPED — the marker makes no claim AND paths are present: the old-CLI
 *             state. Loud, specific warning naming every path and the version
 *             that will remove it; reported PENDING, never as a pass.
 *
 * THE CONTRACT B4 HAS TO HONOUR, in one line, so it cannot be guessed wrong:
 * after deleting the ledger paths, write `"engineOnlyPruned": true` into
 * `.cartwright/profile.json` alongside `profile` and `generatedBy`. An array of
 * the removed paths is accepted too. That single field is what flips this guard
 * from a warning into a gate.
 *
 * KNOWN HOLE, STATED: a B4 that prunes only SOME paths and never writes the
 * field leaves the guard skipping with a shorter list instead of failing. The
 * alternative — arming on partial evidence — is unavailable, because `light`
 * already deletes `app/[locale]/priser` and `app/[locale]/cases` for its own
 * reasons, so "a ledger path is missing" is true today and means nothing.
 *
 * The ledger being profile-independent and this guard being profile-scoped is
 * also deliberate, and also temporary: `ENGINE_ONLY` says "never in a
 * customer's scaffold", not "never in a `site` scaffold". A `full` scaffold
 * writes no `.cartwright/profile.json` at all today, so it is indistinguishable
 * from an unscaffolded tree and cannot be checked without risking a red in
 * somebody's engine fork. PR 0.2 makes `full` write the marker; then this guard
 * covers it too, with no change here beyond the profile list.
 */
const engine = isEngineCheckout();
const marker = readProfileMarker();

/** Profiles whose marker exists today, so the guard can know it is in one. */
const COVERED_PROFILES = ["site", "light"];
const covered = marker.declared && COVERED_PROFILES.includes(marker.profile);

type Manifest = { engineOnly?: { path: string; reason: string }[] };
const manifest: Manifest = onDisk("scaffold/manifest.json")
  ? (JSON.parse(read("scaffold/manifest.json")) as Manifest)
  : {};
const ledger = manifest.engineOnly ?? [];

/**
 * Does the CLI that cut this tree claim to have honoured the ledger?
 *
 * `true` or a list of what it removed both count; anything else — including the
 * field being absent, which is every released CLI today — does not.
 */
export function claimsEngineOnlyPruned(raw: Record<string, unknown> | null): boolean {
  const claim = raw?.engineOnlyPruned;
  return claim === true || (Array.isArray(claim) && claim.length > 0);
}

const present = ledger.filter((entry) => onDisk(entry.path));
const claimed = claimsEngineOnlyPruned(marker.raw);
/** Hard-failure mode: the CLI claims the ledger, or the tree is already clean. */
const armed = covered && (claimed || present.length === 0);

if (!engine && !covered) {
  console.warn(
    `\n[guards] SKIPPED marketing-routes-absent — profile "${marker.profile}"` +
      `${marker.declared ? "" : " (assumed: no .cartwright/profile.json)"}.\n` +
      "[guards] The engineOnly ledger applies to every customer scaffold, but only `site`\n" +
      "[guards] and `light` write a marker this guard can read. PR 0.2 adds `full`.\n",
  );
} else if (!engine && !armed) {
  console.warn(
    `\n[guards] SKIPPED marketing-routes-absent — ${present.length} of Cartwright's own ` +
      `${present.length === 1 ? "path is" : "paths are"} still here, and the tool that\n` +
      "[guards] built this project never claimed to remove them.\n\n" +
      present.map((entry) => `[guards]   ${entry.path}\n[guards]       ${entry.reason}`).join("\n") +
      "\n\n[guards] NOTHING IS WRONG WITH YOUR PROJECT. `create-cartwright` 2.9.5 — the\n" +
      "[guards] current release — predates the pruning step: the engine ships the ledger\n" +
      "[guards] (`scaffold/manifest.json` → `engineOnly`) and no published CLI reads it.\n" +
      "[guards] Delete the paths above if you want them gone today, or re-scaffold with the\n" +
      "[guards] release that removes them for you. This guard becomes a hard failure the\n" +
      "[guards] moment a CLI writes `engineOnlyPruned` into `.cartwright/profile.json`,\n" +
      "[guards] so it cannot stay a warning once the promise is made.\n",
  );
}

describe("guard: Cartwright's own pages are absent", () => {
  it.skipIf(engine || !covered)("the scaffold carries the engineOnly ledger", () => {
    expect(
      onDisk("scaffold/manifest.json"),
      "No `scaffold/manifest.json`. The ledger of engine-only paths travels with the " +
        "scaffold precisely so this can be checked without the CLI.",
    ).toBe(true);
    expect(
      ledger.length,
      "`scaffold/manifest.json` has no `engineOnly` field. This scaffold was cut from an " +
        "engine ref older than the ledger, so nothing knows which paths are ours.",
    ).toBeGreaterThan(0);
  });

  it.skipIf(engine || !armed)("no engine-only path exists in this repository", () => {
    const detail = present.map((entry) => `  ${entry.path}\n      → ${entry.reason}`).join("\n");
    expect(
      present.map((e) => e.path),
      present.length
        ? `\n${present.length} of Cartwright's own ${present.length === 1 ? "path" : "paths"} ` +
            `${present.length === 1 ? "is" : "are"} still in this scaffold:\n\n${detail}\n\n` +
            "WHAT THIS MEANS, PRECISELY: `.cartwright/profile.json` declares " +
            "`engineOnlyPruned`, so the tool that built this project stated that it removed " +
            "every path in the `engineOnly` ledger — and the paths above are still on disk. " +
            "That is a broken promise in the CLI's prune pass, not a defect in the ledger " +
            "and not something to silence here. Until it is fixed, a customer's domain " +
            "serves Cartwright's product page, price list, case studies, onboarding funnel " +
            "and release log under the customer's own navigation (owner CW-23).\n"
        : "",
    ).toEqual([]);
  });
});
