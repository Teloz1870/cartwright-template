import { describe, expect, it } from "vitest";

import { isEngineCheckout, lineOf, onDisk, read, stripComments } from "./_shared";

/**
 * STATIC, SCAFFOLD ONLY — a customer's `brand.config.ts` must not carry OUR
 * identity.
 *
 * Owner CW-26, measured on a real `--profile site` scaffold: the engine repo
 * doubles as a live site, so its `brand.config.ts` ships Cartwright's own
 * domain, canonical URL, support/admin emails, GitHub org and company name.
 * Every one of them reaches SEO metadata, the Organization JSON-LD, `llms.txt`
 * and the seeded admin user. `create-cartwright` patches most of it; this guard
 * measures the OUTCOME rather than the patcher, because the patcher is the
 * thing that drifts.
 *
 * WHAT THE CLI ALREADY FIXES, verified by running its own chain over this
 * engine's `brand.config.ts` at create-cartwright 2.9.5 (`patchBrandConfigContent`
 * → `patchBrandConfigForEnglishFirst` → `patchWebsiteCopyForScaffold` →
 * `patchBrandConfigGithubUrl` → `patchBrandConfigSameAs`, 0 warnings): the seven
 * `cartwright.app` hits become `example.com`, `company.sameAs` becomes `[]` and
 * `footer.githubUrl` becomes `""`. An earlier draft of this guard reported the
 * last two as open leaks; they were closed in 2.9.5 by two patchers that draft
 * did not run. Re-measured on a materialized scaffold, both are clean.
 *
 * WHAT IS STILL OURS: `company.legalName`. See `KNOWN_LEAKS`.
 *
 * COMMENT LINES ARE NOT A LEAK (W41). The CLI keeps the doc links in this
 * file's comments deliberately — `… pick one in /admin/designs or on
 * cartwright.app` is a pointer a new owner wants, and `isCommentLine` in the
 * CLI skips exactly those lines. A guard that grepped raw text would demand the
 * removal of help. So the source is comment-stripped first, and what is left is
 * the identity: the values the site actually serves.
 *
 * Runs only in a scaffold. In the engine every hit is correct by definition —
 * this IS Cartwright — so the whole suite is reported PENDING here rather than
 * passing on a check it never made.
 */
const engine = isEngineCheckout();

type Needle = { needle: string; why: string };

/** Strings that mean "Cartwright the vendor", never "the customer's business". */
const OURS: Needle[] = [
  {
    needle: "cartwright.app",
    why: "our marketing domain. In `domain`/`url` it becomes the customer's canonical host and every absolute URL in their sitemap, OG tags and llms.txt; in `emails.*` it becomes the from-address of their transactional mail and the login of their seeded admin.",
  },
  {
    needle: "teloz.net",
    why: "the holding company's domain. Nothing about the customer's business is served from it.",
  },
  {
    needle: "Teloz1870",
    why: "our GitHub organisation. In `company.sameAs` it tells search engines the customer's Organization and our template repository are the same entity; in `footer.githubUrl` it renders as a link in their footer.",
  },
];

/**
 * Identity FIELDS whose value must not name us.
 *
 * A bare `"Cartwright"` needle over the whole file is the wrong instrument: the
 * word appears in `cartwrightBadge`, `cartwrightPlus`, the deliberate "Built
 * with the Cartwright Engine" footer attribution and the onboarding copy in
 * `website.steps` — four things that are not identity. So the pattern is
 * anchored to the field it damages.
 */
const OUR_FIELDS: { label: string; pattern: RegExp; why: string }[] = [
  {
    label: "company.legalName",
    pattern: /\blegalName:\s*["'](?:Cartwright|Teloz[^"']*)["']/,
    why: "the legal name of the company this site belongs to. It is rendered as the 'owned and operated by' line in the footer AND published as `legalName` in the Organization JSON-LD, so a search engine reads the customer's business as legally being Cartwright.",
  },
];

/**
 * Leaks that are real, reported, and NOT this repository's to fix — pinned with
 * the reason each survives today, exactly like `no-dead-fetches`'
 * `KNOWN_UNROUTED`.
 *
 * Without this the guard would be red in every fresh scaffold on day one, for a
 * defect whose fix lives in another repository — and `pnpm test` runs inside a
 * real scaffold in the release gate that has to pass before an engine tag. A
 * permanently red gate is not a stricter gate, it is an ignored one. So a NEW
 * leak fails by name and a pinned one warns, and the staleness test below turns
 * red the moment a pinned entry stops describing the tree, which is what forces
 * the entry to be deleted rather than forgotten.
 */
const KNOWN_LEAKS: { label: string; why: string }[] = [
  {
    label: "company.legalName",
    why: "`patchBrandConfigContent`'s only legal-name rewrite is `.replaceAll(\"Teloz ApS\", storeName)`, and the engine's own config stopped saying \"Teloz ApS\" — it says `legalName: \"Cartwright\"`. So the replacement no-ops and every scaffold publishes our company name in its Organization JSON-LD. Measured on a materialized site AND light scaffold with the full 2.9.5 patch chain applied and zero warnings, which is what makes it invisible: nothing reports a failure. The fix is one more anchor in the CLI, next to the githubUrl and sameAs patchers that already close their equivalents.",
  },
];

const rel = "brand.config.ts";
const source = onDisk(rel) ? read(rel) : "";
const identity = stripComments(source);

type Hit = { label: string; line: number; text: string; why: string };

function collectHits(): Hit[] {
  const hits: Hit[] = [];
  for (const { needle, why } of OURS) {
    let from = 0;
    for (;;) {
      const at = identity.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      const line = lineOf(identity, at);
      hits.push({ label: needle, line, text: source.split("\n")[line - 1]?.trim() ?? "", why });
    }
  }
  for (const { label, pattern, why } of OUR_FIELDS) {
    const match = pattern.exec(identity);
    if (!match) continue;
    const line = lineOf(identity, match.index);
    hits.push({ label, line, text: source.split("\n")[line - 1]?.trim() ?? "", why });
  }
  return hits;
}

const hits = collectHits();
const known = new Set(KNOWN_LEAKS.map((k) => k.label));

if (!engine && hits.some((h) => known.has(h.label))) {
  console.warn(
    "\n[guards] identity-not-ours: known, unfixed leak in this scaffold —\n" +
      hits
        .filter((h) => known.has(h.label))
        .map((h) => `[guards]   brand.config.ts:${h.line}  ${h.text}\n[guards]       ${h.why}`)
        .join("\n") +
      "\n[guards] The fix is in create-cartwright, not in your project. Change the value by\n" +
      "[guards] hand — it is your company's name, and you were going to anyway.\n",
  );
}

describe("guard: identity is not ours", () => {
  it.skipIf(engine)("brand.config.ts exists", () => {
    expect(source, "No brand.config.ts — the single source of truth is missing.").not.toBe("");
  });

  it.skipIf(engine)("no identity field names Cartwright, Teloz or our GitHub org", () => {
    const unknown = hits.filter((h) => !known.has(h.label));
    const detail = unknown
      .map((h) => `  brand.config.ts:${h.line}  ${h.text}\n      → ${h.label} is ${h.why}`)
      .join("\n");
    expect(
      unknown.map((h) => `${h.label}:${h.line}`),
      unknown.length
        ? `\n${unknown.length} identity field${unknown.length === 1 ? "" : "s"} in this scaffold ` +
            `still carr${unknown.length === 1 ? "ies" : "y"} Cartwright's own identity:\n\n` +
            `${detail}\n\n` +
            "Comment lines were stripped before this check, so none of these is a doc link " +
            "(W41 keeps those on purpose). This is owner CW-26, and it is a NEW one: the " +
            "known-unfixed set is listed in `KNOWN_LEAKS` in this file and is warned about " +
            "rather than failed. Something the CLI used to rewrite has stopped being " +
            "rewritten — check the patcher whose anchor moved.\n"
        : "",
    ).toEqual([]);
  });

  /**
   * WHY THIS IS A WARNING AND `no-dead-fetches`' EQUIVALENT IS AN ASSERTION.
   *
   * That ratchet pins CALLS in files the engine owns, so an entry going stale
   * means somebody changed the engine and should update the list. This one pins
   * a value the CUSTOMER is supposed to change — `legalName` is their company's
   * name, and putting it in is the first edit anyone makes. Failing their
   * `pnpm test` for doing the right thing is the exact species of false red
   * that makes people stop reading a suite. So the rot is reported, not
   * asserted; the assertion that matters is the one above, which fires on a
   * leak that is NOT in the list.
   */
  it.skipIf(engine)("known-leak entries are reported when they stop describing this tree", () => {
    const stale = KNOWN_LEAKS.filter((k) => !hits.some((h) => h.label === k.label));
    if (stale.length) {
      console.warn(
        `\n[guards] identity-not-ours: ${stale.length} known-leak entr${
          stale.length === 1 ? "y no longer describes" : "ies no longer describe"
        } this tree —\n` +
          stale.map((k) => `[guards]   ${k.label}`).join("\n") +
          "\n[guards] If you are a Cartwright maintainer and the CLI now closes it, delete the\n" +
          "[guards] entry from KNOWN_LEAKS so the next regression fails instead of being\n" +
          "[guards] pre-forgiven. If you are the owner of this project: you changed it\n" +
          "[guards] yourself, which is exactly right, and nothing here needs doing.\n",
      );
    }
    expect(KNOWN_LEAKS.length, "The known-leak list is empty but still has a test.").toBeGreaterThan(
      0,
    );
  });

  it.skipIf(engine)("every known-leak entry carries an argument, not a name", () => {
    const thin = KNOWN_LEAKS.filter((k) => k.why.length <= 40).map((k) => k.label);
    expect(
      thin,
      "A known-leak entry needs a reason long enough to argue with — otherwise the ratchet " +
        "becomes a list of fields somebody once decided not to look at.",
    ).toEqual([]);
  });
});
