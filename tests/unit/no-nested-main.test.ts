import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `app/[locale]/layout.tsx` wraps EVERY storefront page in `<main>` (or hands
 * that landmark to a design pack that sets `layout.ownsMain`). A page that
 * renders its own `<main …>` therefore produces two main landmarks — landmark
 * navigation (a screen reader's rotor) lists two "main" regions, and axe
 * reports `landmark-no-duplicate-main` on every such page (AUD17-a).
 *
 * Nothing caught it: no CSS selects the element, no test queries the role, and
 * the pages build and render fine with the nesting. So the rule is enforced
 * here, by reading the sources. Two sets are walked:
 *
 *  - every route file under `app/[locale]/` that renders INSIDE the layout —
 *    `page.tsx`, `not-found.tsx`, `error.tsx`, `loading.tsx` and their
 *    `.static.tsx` twins;
 *  - every plugin component those files mount (`export { default } from
 *    "@/plugins/<slug>/pages/<Page>"`, the cartwright-plugin-v1 route-mount
 *    pattern). Review round 1 measured the blog index, the blog post, the
 *    wishlist and both post-purchase review pages still opening their own
 *    `<main>` on Solbrillen: the mount file is three lines, the `<main>` lived
 *    in the plugin, and a walk of `app/[locale]` alone never saw it.
 *
 * Out of scope, on purpose: the design layer (`designs/<slug>/chrome.tsx` — an
 * `ownsMain` pack's Shell is SUPPOSED to render the one main), `app/admin/**`
 * (its own layout), and route handlers that emit a whole document
 * (`app/[locale]/[...missing]/route.ts` answers with its own `<html>`, so its
 * `<main>` is the only one on that page).
 *
 * This file ships in light/full scaffolds (`tests/unit` does), where the CLI
 * has pruned modules and — from create-cartwright 2.10 — the engine-only paths
 * in `scaffold/engine-only.ts` (`app/[locale]/changelog` among them). So every
 * hard-coded path below is existence-guarded and the engine-only anchor is
 * asserted only in the engine checkout; a pruned scaffold stays green as long
 * as it has at least one route file to walk. Paths are compared with forward
 * slashes whatever `path.sep` is — the scaffold may be on Windows.
 */
const ROOT = resolve(__dirname, "../..");
const APP_LOCALE_DIR = join(ROOT, "app", "[locale]");
/** The mirror exclude list never reaches a scaffold (same probe as repo-hygiene.test.ts). */
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));

/** Route files that render as children of the layout's `<main>` (and their `.static` twins). */
const ROUTE_FILE = /^(page|not-found|error|loading)(\.static)?\.tsx$/;

/** Repo-relative, forward-slash paths that keep their own `<main>`, each with why. */
const ALLOWED_OWN_MAIN: Record<string, string> = {
  "app/[locale]/webmcp-check/page.tsx":
    "WebMCP surface, own slice — frozen, not touched by storefront a11y passes",
};

/** Repo-relative with forward slashes, so a key above matches on Windows too. */
const posix = (abs: string) => relative(ROOT, abs).split(sep).join("/");

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRouteFiles(full, out);
    else if (ROUTE_FILE.test(entry.name)) out.push(posix(full));
  }
  return out;
}

/** `from "@/plugins/…"` in a route file: the plugin components it mounts, resolved to files that exist. */
const PLUGIN_SPECIFIER = /\bfrom\s+["'](@\/plugins\/[^"']+)["']/g;

function mountedPluginFiles(routeFile: string): string[] {
  const source = readFileSync(join(ROOT, routeFile), "utf8");
  const out: string[] = [];
  for (const [, spec] of source.matchAll(PLUGIN_SPECIFIER)) {
    const base = join(ROOT, spec.slice("@/".length));
    const file = [base, `${base}.tsx`, join(base, "index.tsx")].find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    );
    if (file?.endsWith(".tsx")) out.push(posix(file));
  }
  return out;
}

/**
 * Drops comments so prose about `<main>` does not count: block comments, and a
 * `// …` comment on any line — a whole-line one, or a trailing one after code.
 * The trailing cut happens only where the `//` follows whitespace and every
 * quote character before it on that line is balanced, so `"https://…"` and a
 * `//` inside a string survive.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(stripLineComment)
    .join("\n");
}

function stripLineComment(line: string): string {
  for (let from = 0; ; ) {
    const at = line.indexOf("//", from);
    if (at < 0) return line;
    const before = line.slice(0, at);
    const afterWhitespace = at === 0 || /\s/.test(line[at - 1]);
    const balanced = ["'", '"', "`"].every((quote) => before.split(quote).length % 2 === 1);
    if (afterWhitespace && balanced) return before;
    from = at + 2;
  }
}

const OPENS_MAIN = /<main[\s/>]/;

describe("storefront pages do not nest a second <main> inside the layout's", () => {
  const routeFiles = walkRouteFiles(APP_LOCALE_DIR);
  const mounted = [...new Set(routeFiles.flatMap(mountedPluginFiles))];
  const walked = [...routeFiles, ...mounted];

  it("walks a meaningful set of files (the rule is not vacuous)", () => {
    expect(routeFiles.length, "app/[locale] has no route file to walk").toBeGreaterThan(0);
    // Existence-guarded: a scaffold may have pruned any of these and must stay green.
    const login = "app/[locale]/account/login/page.tsx";
    if (existsSync(join(ROOT, login))) expect(routeFiles).toContain(login);
    const wishlistMount = "app/[locale]/account/wishlist/page.tsx";
    const wishlistPage = "plugins/wishlist/pages/WishlistPage.tsx";
    if (existsSync(join(ROOT, wishlistMount)) && existsSync(join(ROOT, wishlistPage))) {
      expect(mounted, "the re-export walk must reach the plugin page a mount file points at").toContain(
        wishlistPage,
      );
    }
    if (isEngineCheckout) {
      // The engine tree has everything, so here the walk is pinned hard — including
      // the engine-only changelog route a 2.10 scaffold no longer has.
      expect(routeFiles.length).toBeGreaterThan(20);
      expect(routeFiles).toContain(login);
      expect(routeFiles).toContain("app/[locale]/changelog/page.tsx");
      expect(mounted).toEqual(
        expect.arrayContaining([
          "plugins/blog/pages/BlogIndexPage.tsx",
          "plugins/blog/pages/BlogPostPage.tsx",
          "plugins/reviews/pages/OrderReviewPage.tsx",
          "plugins/reviews/pages/ReviewTokenPage.tsx",
          wishlistPage,
        ]),
      );
    }
  });

  it("comment stripping drops prose about <main> and keeps code", () => {
    expect(stripComments("const a = 1; // the layout renders <main>")).toBe("const a = 1; ");
    expect(stripComments('  // <main> lives in the layout\n  <main className="x">')).toMatch(OPENS_MAIN);
    expect(stripComments("/* <main> */ return <div />")).not.toMatch(OPENS_MAIN);
    expect(stripComments('<a href="https://example.com/a">x</a> // <main>')).toBe(
      '<a href="https://example.com/a">x</a> ',
    );
    expect(stripComments('const url = "https://example.com/a"; // see <main>')).not.toMatch(OPENS_MAIN);
    expect(stripComments('const s = "a // b"; return <main>')).toMatch(OPENS_MAIN);
  });

  it("the layout is what provides the main landmark", () => {
    const layouts = ["layout.tsx", "layout.static.tsx"]
      .map((name) => join(APP_LOCALE_DIR, name))
      .filter(existsSync);
    expect(layouts.length, "app/[locale] has no layout to provide <main>").toBeGreaterThan(0);
    for (const layout of layouts) {
      expect(stripComments(readFileSync(layout, "utf8")), `${posix(layout)} must render <main>`).toMatch(
        /<main\b/,
      );
    }
  });

  it("no route file or mounted plugin page opens its own <main> unless allowlisted with a reason", () => {
    const offenders = walked.filter(
      (rel) =>
        !(rel in ALLOWED_OWN_MAIN) &&
        OPENS_MAIN.test(stripComments(readFileSync(join(ROOT, rel), "utf8"))),
    );
    expect(
      offenders,
      `These render a <main> inside the layout's <main> (two main landmarks). Render a <div> with the same className instead, or add the file to ALLOWED_OWN_MAIN with a reason:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still renders its own <main> (no stale exemptions)", () => {
    for (const [rel, reason] of Object.entries(ALLOWED_OWN_MAIN)) {
      expect(reason.length, `${rel} needs a reason`).toBeGreaterThan(10);
      if (!existsSync(join(ROOT, rel))) {
        // A scaffold may have pruned it; only the engine tree, where the list is kept, must notice.
        expect(isEngineCheckout, `${rel} is allowlisted but no longer exists`).toBe(false);
        continue;
      }
      expect(walked, `${rel} exists but the walk does not reach it`).toContain(rel);
      const source = stripComments(readFileSync(join(ROOT, rel), "utf8"));
      expect(OPENS_MAIN.test(source), `${rel} no longer renders <main> — drop it from the allowlist`).toBe(true);
    }
  });
});
