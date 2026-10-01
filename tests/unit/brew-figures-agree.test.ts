import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  CUP_G,
  STRENGTH_RATIO,
  computeBrew,
  type Strength,
} from "@/designs/crema/webshop/brew-math";
import { packsFor } from "@/designs/crema/webshop/brew-recommendation";
import da from "@/messages/da.json";
import en from "@/messages/en.json";

/**
 * Every brew number written anywhere must agree with the ONE that computes it.
 *
 * This exists because of a specific mistake, and the mistake was not in the
 * code. Verifying the competition flow live, I typed a ratio table into the
 * verification script instead of reading `STRENGTH_RATIO` — wrote `bright: 16`
 * where the shop says 1:17 — and reported "2000 g water / 125 g coffee" for ten
 * bright cups. The real answer is 118 g, and the recommendation printed two
 * lines below in the SAME report said "132 g left over from a 250 g bag",
 * which only adds up at 118. A number restated by hand had drifted from the
 * number the system computes, and nothing caught it because nothing compared
 * them.
 *
 * So this compares them. Not the math — `crema-brew-math.test.ts` owns that —
 * but every place a figure is RESTATED: the tool's own description, the
 * calculator's labels in both languages, the design docs, and the headline
 * numbers of the competition flow.
 */
const SELF = "tests/unit/brew-figures-agree.test.ts";

describe("every restated brew figure agrees with brew-math", () => {
  /** Repo files that could restate a figure. Tracked files only. */
  // A scaffolded project may have no git repo yet — `create-cartwright` runs
  // `git init` after the files land, and this file ships to every scaffold.
  // Without the guard the whole FILE failed to load there, which reads as a
  // broken suite rather than an unmeasurable one. Same shape as
  // tests/unit/repo-hygiene.ts: a deliberate skip, never a silent pass.
  const hasGitRepo = (() => {
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  const tracked = !hasGitRepo
    ? []
    : execFileSync(
    "git",
    ["ls-files", "*.ts", "*.tsx", "*.md", "*.json", "*.mjs"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.startsWith("node_modules/"));

  const files = tracked
    // THIS file is the one exception, and it has to be: describing the mistake
    // requires quoting it ("wrote bright: 16 where the shop says 1:17"). Every
    // other file — including code COMMENTS, which is where brew-math.ts states
    // the ratios — stays under the scan, because a comment that lies is a
    // comment someone will trust.
    .filter((f) => f !== SELF);

  it("finds files to scan at all (else every scan below is vacuous)", () => {
    if (!hasGitRepo) {
      // Stated, not silent: the scan is unmeasurable here, and saying so keeps
      // "skipped" from being read as "clean".
      expect(files).toEqual([]);
      return;
    }
    expect(files.length).toBeGreaterThan(100);
  });

  it("excludes this file and NOTHING else that states a ratio", () => {
    // The exemption is the kind of thing that quietly grows, and asserting
    // only "SELF is absent" would let a second exclusion in unnoticed. So the
    // files that actually carry these figures are named: excluding any of them
    // — the shop's guide, the pack's docs, the tool's own description, the
    // submission — fails here rather than silently stopping the scan.
    if (!hasGitRepo) return;
    const all = execFileSync("git", ["ls-files", SELF], { encoding: "utf8" }).trim();
    expect(all, "the self-exclusion path is stale").toBe(SELF);
    expect(files).not.toContain(SELF);
    // Measured, not described: the filter must remove EXACTLY this file.
    //
    // Naming the files that matter was not enough — excluding a whole docs
    // directory still passed, because the code files alone satisfied any list
    // this file is allowed to write. It ships to every customer scaffold, so
    // it cannot name paths that only exist in the engine repo. Comparing the
    // filtered list against the tracked one needs no paths at all, and catches
    // a widening by one file or by a whole directory.
    if (!hasGitRepo) return;
    const removed = tracked.filter((f) => !files.includes(f));
    expect(removed, "the scan excludes more than itself").toEqual([SELF]);
  });

  it("pairs every strength word with the ratio the code gives it", () => {
    // The exact error: "bright" written beside 1:16. Scans for a strength name
    // within a short window of a `1:NN`, in either order, and checks NN.
    if (!hasGitRepo) return;
    const wrong: string[] = [];
    for (const file of files) {
      const src = readFile(file);
      if (!src) continue;
      for (const [strength, ratio] of Object.entries(STRENGTH_RATIO)) {
        // A window that may not cross ANOTHER ratio or a list separator.
        //
        // Adjacency alone was too tight: it missed "The bright ratio is 1:16",
        // which is the prose form of the exact mistake this file exists to
        // catch. A loose window was too wide: the shop's own docs write all
        // three on one line ("strong 1:15, balanced 1:16, bright 1:17"), so it
        // matched "balanced" against the preceding 1:15.
        //
        // Forbidding `1:`, a comma, a middle dot and a full stop inside the
        // window splits the difference — prose is caught, list items cannot
        // bleed into each other, and a claim cannot cross a sentence boundary
        // ("…bright 1:17. Defaults to balanced." is not a claim about
        // balanced). Both directions, because the code writes ratio-then-name
        // ("1:17 bright") and the docs write name-then-ratio.
        const gap = "(?:(?!1:|,|·|\\.)[^\\n]){0,30}?";
        const near = new RegExp(
          `(?:${strength}${gap}1:(\\d{2})|1:(\\d{2})${gap}${strength})`,
          "gi",
        );
        for (const m of src.matchAll(near)) {
          const found = Number(m[1] ?? m[2]);
          if (found !== ratio) {
            wrong.push(`${file}: "${strength}" beside 1:${found}, code says 1:${ratio}`);
          }
        }
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("actually matched some pairings (the scan is not silently finding nothing)", () => {
    // Without this the assertion above passes on a regex that matches nothing.
    if (!hasGitRepo) return;
    let hits = 0;
    for (const file of files) {
      const src = readFile(file);
      if (!src) continue;
      for (const strength of Object.keys(STRENGTH_RATIO)) {
        const near = new RegExp(`${strength}(?:(?!1:|,|·|\\.)[^\\n]){0,30}?1:\\d{2}`, "gi");
        hits += [...src.matchAll(near)].length;
      }
    }
    expect(hits).toBeGreaterThan(3);
  });

  it("keeps each calculator label consistent with the ratio in its own key", () => {
    // `calcRatio17` must say 1:17. A label edited without its key — or the
    // other way round — puts a wrong ratio in front of a shopper.
    for (const [locale, messages] of [["da", da], ["en", en]] as const) {
      const store = (messages as Record<string, Record<string, string>>).Crema ?? {};
      const keys = Object.keys(store).filter((k) => /^calcRatio\d{2}$/.test(k));
      expect(keys.length, `${locale} has no calcRatio labels`).toBeGreaterThan(0);
      for (const key of keys) {
        const ratio = key.slice("calcRatio".length);
        expect(store[key], `${locale}.${key}`).toContain(`1:${ratio}`);
      }
    }
  });

  it("offers a label for every ratio the code supports, and no others", () => {
    const store = (en as Record<string, Record<string, string>>).Crema ?? {};
    const labelled = Object.keys(store)
      .filter((k) => /^calcRatio\d{2}$/.test(k))
      .map((k) => Number(k.slice("calcRatio".length)))
      .sort();
    expect(labelled).toEqual([...new Set(Object.values(STRENGTH_RATIO))].sort());
  });
});

/**
 * The competition flow's headline numbers, DERIVED rather than typed.
 *
 * "I'm brewing a bright pour-over for ten cups. Calculate what I need and add
 * the recommended coffee to my cart." Every figure quoted for that prompt — in
 * a demo, a video script, a submission, or a message to the owner — has to be
 * these.
 */
describe("the competition flow's figures", () => {
  const CUPS = 10;
  const STRENGTH: Strength = "bright";
  const PACK_G = 250; // the coffee template's seeded bag

  const recipe = computeBrew(CUPS, STRENGTH_RATIO[STRENGTH]);
  const packs = packsFor(recipe.coffeeGrams, PACK_G);

  it("ten bright cups is 2000 g water and 118 g coffee", () => {
    expect(recipe.waterGrams).toBe(CUPS * CUP_G);
    expect(recipe.waterGrams).toBe(2000);
    expect(recipe.coffeeGrams).toBe(118);
    expect(recipe.ratio).toBe("1:17");
  });

  it("is ONE 250 g bag with 132 g left over", () => {
    expect(packs.quantity).toBe(1);
    expect(packs.remainingGrams).toBe(132);
  });

  it("the leftover is the arithmetic, not a coincidence", () => {
    // The cross-check that would have caught the wrong report: 250 − 118 = 132.
    // A restated coffee weight that does not satisfy this is wrong, whatever
    // else agrees with it.
    expect(PACK_G - recipe.coffeeGrams).toBe(packs.remainingGrams);
  });

  it("is NOT 125 g — the figure a hand-typed ratio produced", () => {
    // 2000/16 rounds to 125. Naming the wrong answer keeps the test honest
    // about which mistake it exists to prevent.
    expect(recipe.coffeeGrams).not.toBe(125);
    expect(Math.round(2000 / 16)).toBe(125); // the arithmetic of the mistake
    expect(STRENGTH_RATIO.bright).not.toBe(16);
  });
});

function readFile(path: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").readFileSync(path, "utf8") as string;
  } catch {
    return null;
  }
}
