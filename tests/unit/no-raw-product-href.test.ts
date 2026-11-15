import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT, stripComments, walkCode } from "../helpers/claims";

/**
 * Every product and category link is built by `lib/urls.ts` (URL0-b for the
 * engine, URL0-c for the design packs).
 *
 * The URL options (`brand.urls`: permalinks, trailing slash, locale prefix)
 * only mean something if no link spells the shape out by hand. One template
 * literal left behind is one link that keeps `/da/product/x` after the shop
 * has moved to `/hegn/x/` — a 404 the shop's own pages point at, and nothing
 * else in the suite would notice, because with the options off the two
 * spellings are the same string.
 *
 * So this walks the code a customer keeps (disk, not git: a scaffold has no
 * history) and fails on a hand-built `/product/${…}` or `/category/${…}`. The
 * exceptions are counted per file, each with the reason it cannot go through
 * the helper yet. A new hand-built link in an excepted file still fails —
 * the count goes up.
 */

const ROOTS = ["app", "components", "lib", "plugins", "designs"];

/** `/product/${`, `/category/${`, `"/category/" +` — a link assembled from a slug. */
const HAND_BUILT = /\/(?:product|category)\/(?:\$\{|["'`]\s*\+)/g;

/**
 * A helper call whose first argument is not an object literal with exactly two
 * keys, `slug` then `permalink`. Since URL5-a every call names the permalink
 * (or `null`, visibly, where the data has none yet): a call that passed the
 * slug alone would link a migrated product at `/product/<slug>` while its
 * canonical, sitemap entry and breadcrumbs name the permalink — two addresses
 * for one page. A bare entity or a spread is refused too: it hides which
 * fields reach the helper.
 */
const CALL =
  /\b(?:productHref|categoryHref)\((?!\s*\{\s*slug\s*(?::[^,{}]*)?,\s*permalink\s*(?::[^,{}]*)?,?\s*\}\s*,)/g;

/**
 * The two values must come from the same entity: `{ slug: p.slug, permalink:
 * q.permalink }` would link one product at another's address. Checked where the
 * slug names its entity (`x.slug`, `encodeURIComponent(x.slug)`); a slug held in
 * a local (`slug`, `encodedSlug`) is checked by reading the call site.
 */
const PAIR =
  /\b(?:productHref|categoryHref)\(\s*\{\s*slug\s*:\s*(?:encodeURIComponent\()?([\w.]+)\.slug\)?\s*,\s*permalink\s*:\s*([^,{}]*?)\s*,?\s*\}/g;

/** Call sites whose data has no permalink yet, so they pass `null` — counted, like EXCEPTIONS. */
const NO_PERMALINK_YET: Record<string, { count: number; why: string }> = {
  "components/AIStylistPanel.tsx": {
    count: 3,
    why: "the assistant's tool output (lib/tools/ui.ts, products.ts) carries no permalink yet — backlog URL5-a2",
  },
};

function mismatchedPairs(src: string): string[] {
  return [...src.matchAll(PAIR)]
    .filter(([, owner, permalink]) => permalink !== `${owner}.permalink`)
    .map(([call]) => call);
}

const EXCEPTIONS: Record<string, { count: number; why: string }> = {
  "lib/urls.ts": { count: 2, why: "the helper itself" },
  "components/HeaderClient.tsx": {
    count: 1,
    why: "next-intl's <Link> adds the locale itself; a prefixed href would become /da/da/… — routing's job in URL1",
  },
  "components/MobileMenu.tsx": {
    count: 1,
    why: "next-intl's <Link> adds the locale itself; a prefixed href would become /da/da/… — routing's job in URL1",
  },
  "components/ProductCard.tsx": {
    count: 1,
    why: "the card without a routeLocale links locale-less today; kept byte-identical",
  },
  "app/admin/actions.ts": {
    count: 2,
    why: "revalidatePath() arguments, not links",
  },
  "designs/crema/webshop/brew-recommendation.ts": {
    count: 1,
    why: "the brew WebMCP tool's url takes its prefix from the page path, which may be empty (withLocale refuses an empty locale); routing's job in URL1",
  },
};

function handBuilt(rel: string): number {
  const src = stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
  return src.match(HAND_BUILT)?.length ?? 0;
}

describe("product and category links go through lib/urls.ts", () => {
  const files = ROOTS.flatMap((root) => walkCode(root)).filter(
    (rel) => !/\.(test|spec)\.tsx?$/.test(rel),
  );

  it("walks the code at all (a vacuous walk would pass anything)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("lib/urls.ts");
  });

  it("no file builds one by hand outside its counted exceptions", () => {
    const offenders = files
      .map((rel) => ({ rel, found: handBuilt(rel), allowed: EXCEPTIONS[rel]?.count ?? 0 }))
      .filter(({ found, allowed }) => found !== allowed)
      .map(({ rel, found, allowed }) => `${rel}: ${found} hand-built (allowed ${allowed})`);
    expect(offenders).toEqual([]);
  });

  it("every call site hands over the slug and the permalink, so one entity gets one address", () => {
    const offenders = files
      .filter((rel) => rel !== "lib/urls.ts")
      .flatMap((rel) => {
        const src = stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
        const n = src.match(CALL)?.length ?? 0;
        return n ? [`${rel}: ${n} call(s) not passing { slug, permalink }`] : [];
      });
    expect(offenders).toEqual([]);
  });

  it("the slug and the permalink come from the same entity", () => {
    const offenders = files
      .filter((rel) => rel !== "lib/urls.ts")
      .flatMap((rel) => {
        const src = stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
        const found = mismatchedPairs(src);
        const allowed = NO_PERMALINK_YET[rel]?.count ?? 0;
        const allNull = found.every((call) => /permalink:\s*null\s*\}$/.test(call));
        if (found.length === allowed && allNull) return [];
        return [`${rel}: ${found.length} mismatched (allowed ${allowed} with null): ${found.join(" | ")}`];
      });
    expect(offenders).toEqual([]);
  });

  it("the pair rule reads the call sites it claims to", () => {
    // A vacuous PAIR would pass every file: it must see the engine's calls.
    const seen = files
      .filter((rel) => rel !== "lib/urls.ts")
      .reduce((n, rel) => {
        const src = stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
        return n + [...src.matchAll(PAIR)].length;
      }, 0);
    expect(seen).toBeGreaterThan(20);
    expect(mismatchedPairs("productHref({ slug: p.slug, permalink: p.permalink }, locale)")).toEqual([]);
    expect(
      mismatchedPairs("productHref({ slug: encodeURIComponent(item.product.slug), permalink: item.product.permalink }, l)"),
    ).toEqual([]);
    for (const bad of [
      "productHref({ slug: p.slug, permalink: q.permalink }, locale)",
      "categoryHref({ slug: c.slug, permalink: null }, locale)",
      "productHref({ slug: encodeURIComponent(p.slug), permalink: p.slug }, locale)",
    ]) {
      expect(mismatchedPairs(bad), bad).toHaveLength(1);
    }
  });

  it("the pattern catches the shapes it claims to", () => {
    for (const shape of [
      "`/${locale}/product/${p.slug}`",
      "`${base}/category/${c.slug}`",
      '"/category/" + slug',
    ]) {
      expect(shape.match(HAND_BUILT)?.length, shape).toBe(1);
    }
    expect('pathname.startsWith("/product/")'.match(HAND_BUILT)).toBeNull();
  });

  it("the call-site rule tells the slug-and-permalink pair from everything else", () => {
    for (const ok of [
      "productHref({ slug, permalink }, locale)",
      "productHref({ slug: p.slug, permalink: p.permalink }, locale)",
      "categoryHref({ slug: encodeURIComponent(c.slug), permalink: c.permalink }, locale)",
      "productHref({ slug, permalink: null }, LOCALE_PLACEHOLDER)",
      "productHref(\n  {\n    slug: p.slug,\n    permalink: p.permalink,\n  },\n  locale,\n)",
    ]) {
      expect(ok.match(CALL), ok).toBeNull();
    }
    for (const bad of [
      "productHref(p, locale)",
      "productHref({ slug }, locale)",
      "productHref({ slug: p.slug }, locale)",
      "productHref({ permalink: p.permalink, slug: p.slug }, locale)",
      "productHref({ slug, ...p }, locale)",
      "productHref({ slug, permalink, ...p }, locale)",
      "productHref({ ...p }, locale)",
    ]) {
      expect(bad.match(CALL)?.length, bad).toBe(1);
    }
  });
});
