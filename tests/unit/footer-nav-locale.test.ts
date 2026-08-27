import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isLocaleExempt } from "@/lib/locale-exempt";

/**
 * The footer is shared chrome: it renders on every storefront page of every
 * scaffold whose active design does not supply its own (17 packs set
 * `siteChrome` and `app/[locale]/layout.tsx` lets a `DesignFooter` REPLACE this
 * one — Solbrillen is one of them, via `designs/apex`; Teloz and Northbound are
 * not, so two of the three canaries render this file). It already resolved
 * `locale` and prefixed seven of its
 * links with it — and left the rest bare. Measured on `main` before this test
 * existed: `/`, `/produkter`, `/category/<slug>`, `/info/shipping`,
 * `/info/returns`, `/built-with-cartwright` (x2) and `/changelog` shipped with
 * no locale segment, so a visitor reading `/en` of a `da`-default shop was
 * bounced back into Danish the moment they used the footer. Same defect class
 * as the mobile drawer's.
 *
 * A bare literal is the failure, so the literal is what is asserted — the
 * SOURCE of both footers is scanned rather than a render mocked. Two reasons:
 * the components are async Server Components sitting on Prisma, next-intl and
 * the genome, so a render test would assert mostly against its own mocks; and
 * the defect is re-introducible by writing one more `href="/x"`, which a
 * fixed-route render test would not see. The exemptions are DERIVED from
 * `lib/locale-exempt.ts` (the module `proxy.ts` itself routes by) plus the
 * other escapes the matcher grants — a dot in the path, `/api` / `/admin`, and
 * the handful of asset names the matcher lists by hand — so this file cannot
 * drift away from what the middleware actually does.
 *
 * One caveat the predicate cannot express: the `site` profile's middleware is
 * `proxy.static.ts`, which has no `/icon`, `/og` or `/oauth` branch. A link to
 * one of those from `Footer.static.tsx` would pass here and still 307→404 in a
 * materialized site scaffold. Neither footer links them today; if one ever
 * does, split the predicate per file rather than widening it.
 *
 * Scope note: only the two footers are covered here. `components/Header*.tsx`,
 * `MobileMenu.tsx` and `SearchBox.tsx` are the same class and are tracked
 * separately; widening this scan is one entry in FILES away once they land.
 */

const ROOT = join(__dirname, "..", "..");
const FILES = ["components/Footer.tsx", "components/Footer.static.tsx"] as const;

/** Strip block and line comments so a path named in prose is not asserted on. */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

/**
 * Every string and template literal whose value starts with `/` — i.e. every
 * in-app path the file can hand to an href, whether written inline or via a
 * `const`. All three quote styles: the repo writes double quotes, but nothing
 * enforces it (no prettier config, no ESLint `quotes` rule), so a single-quoted
 * `href='/produkter'` must not be able to slip past the scan.
 */
function internalPathLiterals(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/"(\/[^"\n]*)"/g)) out.push(m[1]);
  for (const m of src.matchAll(/'(\/[^'\n]*)'/g)) out.push(m[1]);
  for (const m of src.matchAll(/`(\/[^`\n]*)`/g)) out.push(m[1]);
  return out;
}

/** `/${locale}/info/faq` → `/en/info/faq`; any other `${…}` → an opaque segment. */
function resolve(literal: string): string {
  return literal.replace(/\$\{locale\}/g, "en").replace(/\$\{[^}]*\}/g, "x");
}

/**
 * The names `proxy.ts`'s matcher lists by hand — escape #3 in
 * `lib/locale-exempt.ts`'s docblock. `favicon.ico` already escapes on the dot;
 * the rest do not.
 */
const MATCHER_NAMED = ["/opengraph-image", "/twitter-image", "/apple-icon", "/hero"];

/**
 * Does the rewrite prepend a locale to this path? Mirrors all three escapes
 * documented in `lib/locale-exempt.ts`: an explicit proxy branch (`/api`,
 * `/admin`, and LOCALE_EXEMPT_PREFIXES), a dot anywhere in the path, or a name
 * the matcher lists by hand.
 */
function needsLocale(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path === "/api" || path.startsWith("/api/")) return false;
  if (path === "/admin" || path.startsWith("/admin/")) return false;
  if (path.includes(".")) return false;
  if (MATCHER_NAMED.some((n) => path === n || path.startsWith(`${n}/`))) return false;
  return !isLocaleExempt(path);
}

describe("footer links carry the locale the footer already resolved", () => {
  it.each(FILES)("%s prefixes every locale-routed path", (file) => {
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    const literals = internalPathLiterals(src);
    // An extractor that silently stops matching would make the assertion below
    // pass for the worst possible reason. Both footers carry well over a dozen
    // in-app paths, so a single-digit count means the scan itself is broken.
    expect(literals.length, `${file}: path extractor found almost nothing`).toBeGreaterThan(10);
    const offenders = literals.filter(
      (literal) =>
        needsLocale(resolve(literal)) &&
        // The prefix must end at a segment boundary: `/${locale}produkter` is
        // not a locale-prefixed path, it is a typo that routes nowhere.
        !(literal === "/${locale}" || literal.startsWith("/${locale}/")),
    );
    expect(offenders).toEqual([]);
  });

  it("still tells the two kinds of path apart", () => {
    // Guards the predicate itself. Blanket-true and blanket-false would each
    // make the scan above pass for the wrong reason.
    for (const p of [
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
      "/api/mcp",
      "/api/v1/tools",
      "/icon",
      "/og",
      "/oauth/authorize",
      "/opengraph-image",
      "/apple-icon",
    ]) {
      expect(needsLocale(p), p).toBe(false);
    }
    for (const p of ["/", "/produkter", "/category/foo", "/built-with-cartwright", "/changelog", "/info/shipping"]) {
      expect(needsLocale(p), p).toBe(true);
    }
  });
});

describe("footer copy comes from the message catalogue", () => {
  const catalogues = {
    da: JSON.parse(readFileSync(join(ROOT, "messages/da.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >,
    en: JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >,
  };

  it.each(FILES)("%s only calls keys that exist in every locale", (file) => {
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    const used = [...src.matchAll(/\bt\(["']([^"']+)["']/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const key of used) {
        expect(
          catalogue.Footer?.[key],
          `messages/${locale}.json is missing Footer.${key} (used in ${file})`,
        ).toBeTypeOf("string");
      }
    }
  });

  it("keeps the store name a parameter of the home link's label", () => {
    // The hardcoded `${storeName} home` shipped English to Danish screen readers.
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      expect(catalogue.Footer.homeAria, locale).toContain("{storeName}");
    }
  });
});

describe("the two footers do not drift apart on the same field", () => {
  /**
   * The pattern from the mobile drawer and from this file's own link scan: a
   * surface with two halves fails when only one half is updated. `Footer.tsx`
   * and `Footer.static.tsx` are the db and `site`-profile twins of one footer.
   *
   * Measured: `brand.footer.disclaimer` defaults to `""` (a config default must
   * not pick the language for a locale-routed storefront), the db footer gained
   * the localized fallback, and the static twin did not — so a `--profile site`
   * scaffold rendered an EMPTY `<p>` where the copyright line belongs.
   */
  it.each(FILES)("%s falls back to the localized copyright line", (file) => {
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    expect(
      src,
      `${file} renders brand.footer.disclaimer without a fallback — it defaults to ""`,
    ).toContain('t("allRightsReserved")');
  });
});
