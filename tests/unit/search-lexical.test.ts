import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  dbSearchTokens,
  matchesAllTokens,
  normaliseForSearch,
  productHaystack,
  searchTokens,
} from "@/lib/search/lexical";

/**
 * The real product, copied from industry-templates/coffee/seed-data.ts. Every
 * case below is a query measured against the LIVE demo before this module
 * existed, so the test is a record of observed behaviour rather than a guess.
 */
const ETHIOPIA = {
  name: "Ethiopia Yirgacheffe",
  slug: "ethiopia-yirgacheffe",
  description:
    "Bright, floral single-origin from the Yirgacheffe region. Notes of bergamot, jasmine, and lemon. Best brewed as pour-over or AeroPress.",
  attributes: {
    origin: "Ethiopia",
    process: "Washed",
    roast: 2,
    notes: ["bergamot", "jasmine", "lemon"],
    weightG: 250,
  },
};

const HARIO = {
  name: "Hario V60 Dripper (02)",
  slug: "hario-v60-dripper-02",
  description: "The pour-over classic. Ceramic 02 dripper for 1–4 cups.",
  attributes: { origin: "Japan", material: "Ceramic" },
};

describe("normaliseForSearch", () => {
  it("reduces every separator to a single space", () => {
    expect(normaliseForSearch("Bright, floral single-origin")).toBe(
      "bright floral single origin",
    );
    expect(normaliseForSearch("1–4 cups")).toBe("1 4 cups");
    expect(normaliseForSearch("Hario V60 Dripper (02)")).toBe("hario v60 dripper 02");
  });

  it("folds diacritics and Danish letters", () => {
    // A keyboard without æøå must still find the product.
    expect(normaliseForSearch("Café")).toBe(normaliseForSearch("cafe"));
    expect(normaliseForSearch("søde bønner")).toBe("sode bonner");
    expect(normaliseForSearch("Håndplukket")).toBe("handplukket");
  });
});

describe("the queries that used to return nothing", () => {
  const hay = productHaystack(ETHIOPIA);

  it.each([
    "bright single-origin",
    "bright floral",
    "single origin bright",
    "floral bright ethiopia",
    "pour over",
    "washed",
    "bergamot",
    "BRIGHT SINGLE ORIGIN",
  ])("finds Ethiopia for %j", (query) => {
    expect(matchesAllTokens(hay, query)).toBe(true);
  });

  it("still finds it for the queries that already worked", () => {
    for (const q of ["bright", "single-origin", "bright, floral single-origin"]) {
      expect(matchesAllTokens(hay, q)).toBe(true);
    }
  });

  it("is order-insensitive", () => {
    // "Dripper Hario" returned nothing live; word order is not meaning.
    expect(matchesAllTokens(productHaystack(HARIO), "Dripper Hario")).toBe(true);
    expect(matchesAllTokens(productHaystack(HARIO), "hario dripper")).toBe(true);
  });

  it("searches attribute VALUES, which were invisible before", () => {
    // `process: "Washed"` is not in Ethiopia's description; live, a search for
    // "washed" returned only Colombia, whose description happens to say it.
    expect(matchesAllTokens(productHaystack(ETHIOPIA), "washed")).toBe(true);
    expect(matchesAllTokens(productHaystack(ETHIOPIA), "washed ethiopia")).toBe(true);
    expect(matchesAllTokens(productHaystack(HARIO), "ceramic")).toBe(true);
  });
});

describe("narrowing still narrows", () => {
  it("requires EVERY token — an extra word must not widen the result", () => {
    // The failure mode of a naive OR: one common word matches everything, so
    // "bright single-origin" would return the whole catalogue.
    const hay = productHaystack(ETHIOPIA);
    expect(matchesAllTokens(hay, "bright colombia")).toBe(false);
    expect(matchesAllTokens(hay, "espresso")).toBe(false);
    expect(matchesAllTokens(hay, "bright espresso blend")).toBe(false);
  });

  it("matches a token as a SUBSTRING — the same rule the database applies", () => {
    const hay = productHaystack(ETHIOPIA);
    // A shopper types less than the product says.
    expect(matchesAllTokens(hay, "brew")).toBe(true); // "brewed"
    expect(matchesAllTokens(hay, "flor")).toBe(true); // "floral"
    // And the middle of a word too. This started as a word-PREFIX rule, which
    // read tidier and was wrong: Prisma's `contains` is a substring test, so
    // the two doors disagreed on the most ordinary query in this vertical.
    // Measured against the live catalogue, "press" returned three products on
    // the storefront (AeroPress, two espressos) and ZERO through the agent
    // API. Neither result is defensible while they differ.
    expect(matchesAllTokens(hay, "gamot")).toBe(true); // "bergamot"
  });

  it("agrees with the Prisma rule on the query that exposed the split", () => {
    // Pinned as its own case because this is the regression, not a nicety:
    // "french press" is the single most natural thing a coffee shopper types.
    const aeropress = productHaystack({
      name: "AeroPress Go",
      description: "Portable press brewer for travel.",
      slug: "aeropress-go",
    });
    expect(matchesAllTokens(aeropress, "press")).toBe(true);
    expect(matchesAllTokens(productHaystack(ETHIOPIA), "cheffe")).toBe(true); // Yirgacheffe
  });

  it("an empty query matches everything rather than nothing", () => {
    // The catalogue listing depends on this: no query means no filter.
    expect(matchesAllTokens(productHaystack(ETHIOPIA), "")).toBe(true);
    expect(matchesAllTokens(productHaystack(ETHIOPIA), "   ")).toBe(true);
    expect(searchTokens("  ,  ")).toEqual([]);
  });

  it("a query with nothing matchable in it returns NOTHING, not everything", () => {
    // The hole this closes was severe and silent. `normaliseForSearch` used to
    // strip to /[a-z0-9]/, so any non-Latin query normalised to "" — and an
    // empty token list was treated as "no filter". Measured against the live
    // catalogue: "кофе" returned 0 before the shared matcher and 3 after,
    // presented to an agent as matches for a word no product contains. On a
    // Cyrillic, Greek, CJK or Arabic shop the haystack collapsed too, so EVERY
    // query returned the whole catalogue.
    const hay = productHaystack(ETHIOPIA);
    expect(matchesAllTokens(hay, "☕")).toBe(false);
    expect(matchesAllTokens(hay, "!!!")).toBe(false);
  });

  it("tokenises non-Latin scripts instead of erasing them", () => {
    // The other half: a Cyrillic shop's own words must survive normalisation,
    // or its shoppers cannot search their own catalogue at all.
    expect(searchTokens("кофе")).toEqual(["кофе"]);
    expect(searchTokens("コーヒー 豆")).toEqual(["コーヒー", "豆"]);
    expect(matchesAllTokens(normaliseForSearch("Свежий кофе"), "кофе")).toBe(true);
    expect(matchesAllTokens(normaliseForSearch("Свежий кофе"), "чай")).toBe(false);
  });
});

/**
 * The DB path is a DIFFERENT tokenizer, and the difference is the whole point.
 *
 * `searchTokens` folds æøå and lowercases, which is right when both sides pass
 * through `normaliseForSearch`. Prisma's `contains` does not: it compares
 * against the raw column. Handing it folded tokens would have made this
 * NARROWER than the single whole-phrase filter it replaced — a Danish shopper
 * searching "søde bønner" would have been asked to match "sode bonner", and on
 * Postgres (where `contains` is case-sensitive) "Ethiopia" would have stopped
 * matching a stored name it matched before the change.
 */
describe("dbSearchTokens keeps the shopper's own spelling", () => {
  it("preserves æøå — the DB column is not folded, so the token must not be", () => {
    expect(dbSearchTokens("søde bønner")).toEqual(["søde", "bønner"]);
  });

  it("preserves case — Postgres `contains` is case-sensitive", () => {
    expect(dbSearchTokens("Ethiopia Yirgacheffe")).toEqual(["Ethiopia", "Yirgacheffe"]);
  });

  it("preserves other diacritics too", () => {
    expect(dbSearchTokens("Café Crème")).toEqual(["Café", "Crème"]);
  });

  it("still splits on punctuation, which is what it is FOR", () => {
    // The defect that started all this: "bright, floral" was one contiguous
    // substring, so dropping the comma found nothing.
    expect(dbSearchTokens("bright, floral single-origin")).toEqual([
      "bright",
      "floral",
      "single",
      "origin",
    ]);
  });

  it("differs from searchTokens exactly where it must", () => {
    // Pinning the DIVERGENCE, so nobody later "tidies up" the two into one.
    expect(searchTokens("søde Bønner")).toEqual(["sode", "bonner"]);
    expect(dbSearchTokens("søde Bønner")).toEqual(["søde", "Bønner"]);
  });

  it("drops nothing but separators", () => {
    expect(dbSearchTokens("  a   b  ")).toEqual(["a", "b"]);
    expect(dbSearchTokens("")).toEqual([]);
  });
});

/**
 * Which tokenizer each call site uses is the WHOLE of the fix above, and it is
 * a one-word edit to get wrong. So it is asserted at the source, not left to
 * a reviewer noticing.
 */
describe("each search path uses the tokenizer built for it", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("the Prisma path uses the unfolded tokenizer", () => {
    const catalog = read("lib/catalog.ts");
    expect(catalog).toContain("dbSearchTokens");
    expect(catalog, "folded tokens against a raw column silently narrow the search")
      .not.toMatch(/\bsearchTokens\b(?!\s*—)/);
  });

  it("the in-memory paths use the folded tokenizer", () => {
    // Both sides are normalised there, so folding is what makes "cafe" find
    // "Café" — the opposite call from the Prisma path, on purpose.
    //
    // The negative matters more than the positive. `toContain` alone was
    // satisfied by the surviving IMPORT line, so reverting both filters to
    // `.includes(q.toLowerCase())` passed lint, tsc and the whole suite while
    // silently dropping order-insensitive and punctuation-tolerant matching:
    // against the real seed, "Dripper Hario" and "single origin bright" go
    // from one hit to none. (Lint would not have flagged the orphaned import
    // either — no-unused-vars is a warning here and the gate runs eslint bare.)
    for (const file of ["app/api/products/search/route.ts", "lib/tools/products.ts"]) {
      const source = read(file);
      expect(source).toContain("matchesAllTokens");
      // Comments stripped first: both files DESCRIBE the old `.includes(query)`
      // in prose explaining why it was wrong, and a guard that trips on its own
      // documentation teaches people to delete the documentation.
      expect(stripComments(source), `${file} filters with a raw substring test again`)
        .not.toMatch(/\.includes\(\s*(?:q|query|ql)\b/);
    }
  });
});

/**
 * Scripts whose marks live OUTSIDE the combining range this module strips.
 *
 * `normaliseForSearch` removes U+0300–U+036F. Devanagari's nukta (U+093C, the
 * dot in काग़ज़) and Thai's above-vowels (U+0E31 and friends) are not in that
 * range, so folding is a no-op for those scripts — which is exactly what makes
 * them worth pinning: the JS door folds and the DB door does not, and the two
 * agree here ONLY because neither has anything to fold. A future tidy-up that
 * widened the strip to \p{M} would silently split them apart, and no existing
 * case would notice.
 *
 * (Found by a review probe that seeded a Hindi and Thai catalogue against both
 * doors; the coverage here had stopped at Cyrillic and Japanese, neither of
 * which uses combining marks.)
 */
describe("both doors agree on scripts with marks outside the folded range", () => {
  const HI_TH = [
    { name: "कॉफ़ी बीन्स", slug: "coffee-beans-hi", description: "इथियोपिया से ताज़ी भुनी हुई कॉफ़ी बीन्स।" },
    { name: "फ़िल्टर काग़ज़", slug: "filter-paper-hi", description: "V60 ड्रिपर के लिए काग़ज़ के फ़िल्टर।" },
    { name: "चाय पत्ती", slug: "tea-leaves-hi", description: "असम की चाय पत्ती।" },
    { name: "กาแฟคั่วบด", slug: "coffee-th", description: "กาแฟคั่วบดสำหรับดริป" },
    { name: "กระดาษกรอง", slug: "filter-th", description: "กระดาษกรองสำหรับดริปเปอร์" },
  ];

  const throughJs = (query: string) =>
    HI_TH.filter((p) => matchesAllTokens(productHaystack(p), query)).map((p) => p.slug);

  // What Prisma would do: raw `contains` per unfolded token, ANDed.
  const throughDb = (query: string) =>
    HI_TH.filter((p) =>
      dbSearchTokens(query).every(
        (t) => p.name.includes(t) || p.description.includes(t) || p.slug.includes(t),
      ),
    ).map((p) => p.slug);

  for (const query of ["कॉफ़ी", "चाय", "काग़ज़", "กาแฟ", "กระดาษ"]) {
    it(`"${query}" finds the same products on both doors`, () => {
      expect(throughJs(query)).toEqual(throughDb(query));
    });
  }

  it("and finds SOMETHING — agreeing on nothing would be vacuous", () => {
    expect(throughJs("कॉफ़ी").length).toBeGreaterThan(0);
    expect(throughJs("กาแฟ")).toEqual(["coffee-th"]);
    expect(throughJs("चाय")).toEqual(["tea-leaves-hi"]);
  });

  it("still tells the scripts apart", () => {
    // A normalisation that erased these would make every query match
    // everything — the Cyrillic hole, one script over.
    expect(throughJs("กาแฟ")).not.toContain("tea-leaves-hi");
    expect(throughJs("चाय")).not.toContain("coffee-th");
  });
});
