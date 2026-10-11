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
 * A helper call whose first argument is not an object literal with exactly one
 * key, `slug` — `{ slug, permalink }` or a spread would let a permalink in
 * through the back door.
 */
const CALL = /\b(?:productHref|categoryHref)\(\s*(?!\{\s*slug\s*(?::[^,{}]*)?\}\s*,)/g;

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
  "app/[locale]/category/[slug]/page.tsx": {
    count: 1,
    why: "'Explore more' uses next/link without a locale today (backlog CAT-RELATED-LOCALE); kept byte-identical",
  },
  "app/api/commerce/agent-checkout/route.ts": {
    count: 1,
    why: "Stripe cancel_url without a locale today (backlog AGENT-CANCEL-LOCALE); kept byte-identical",
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

  it("every call site hands over the slug alone, so one entity gets one address", () => {
    // Until URL5-a threads `permalink` through every query and call site at
    // once, a call site that passed the whole entity would link a migrated
    // product at its permalink while the PDP's canonical, the card and the
    // breadcrumbs still name `/product/<slug>` — two addresses for one page.
    const offenders = files
      .filter((rel) => rel !== "lib/urls.ts")
      .flatMap((rel) => {
        const src = stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
        const n = src.match(CALL)?.length ?? 0;
        return n ? [`${rel}: ${n} call(s) not passing { slug }`] : [];
      });
    expect(offenders).toEqual([]);
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

  it("the call-site rule tells the slug alone from an entity in disguise", () => {
    for (const ok of [
      "productHref({ slug }, locale)",
      "productHref({ slug: p.slug }, locale)",
      "categoryHref({ slug: encodeURIComponent(c.slug) }, locale)",
    ]) {
      expect(ok.match(CALL), ok).toBeNull();
    }
    for (const bad of [
      "productHref(p, locale)",
      "productHref({ slug, permalink }, locale)",
      "productHref({ slug: p.slug, permalink: p.permalink }, locale)",
      "productHref({ slug, ...p }, locale)",
      "productHref({ ...p }, locale)",
    ]) {
      expect(bad.match(CALL)?.length, bad).toBe(1);
    }
  });
});
