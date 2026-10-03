import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Ownership arithmetic shared by the tests that ask "who owns this file?".
 *
 * `walkCode` and the prefix rule behind `isClaimedBy` were written twice —
 * inline in `tests/unit/modules.test.ts` (the dependency inventories) and again
 * wherever else the question came up. They are lifted here because the
 * inversion test in `tests/unit/scaffold-ownership.test.ts` asks the SAME
 * question from the opposite direction, and two copies of a prefix rule that
 * must agree is the drift class this whole ledger exists to close.
 */

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Directories a source walk never descends into. Mirrors scripts/site-profile-audit.ts. */
export const WALK_IGNORE = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  ".turbo",
  "coverage",
  ".mail-previews",
  "generated",
]);

export const CODE_EXT = /\.(ts|tsx|mts|cts)$/;

/**
 * Source with line and block comments removed, and with the file's line count
 * preserved (a block collapses to its own newlines, so a reported line number
 * is still the one a reviewer opens).
 *
 * Shared for the same reason as `isClaimedBy`: two tests ask "does this file
 * really DO x?" by grepping it, and a docblock that merely NAMES x must not
 * answer yes in one of them and no in the other. `site-nav-no-dead-links`
 * accepted a comment mentioning `localeRouteExists(` as proof that the sitemap
 * gated its trust URLs, and then returned early without checking anything.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Every code file at or under `rel` (repo-relative), depth-first. A path that
 * does not exist yields nothing — callers ask about ledger entries that a
 * mutation may have removed.
 */
export function walkCode(rel: string, root: string = REPO_ROOT): string[] {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return CODE_EXT.test(rel) ? [rel] : [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (WALK_IGNORE.has(entry.name)) continue;
    out.push(...walkCode(`${rel}/${entry.name}`, root));
  }
  return out;
}

/** Every file (any extension) at or under `rel`. */
export function walkFiles(rel: string, root: string = REPO_ROOT): string[] {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (WALK_IGNORE.has(entry.name)) continue;
    out.push(...walkFiles(`${rel}/${entry.name}`, root));
  }
  return out;
}

/**
 * The manifest's prefix rule, in one place: a claim covers the path itself and
 * everything beneath it. `app/[locale]/info` claims
 * `app/[locale]/info/[slug]/page.tsx`; it does NOT claim `app/[locale]/infobox`.
 */
export function isClaimedBy(target: string, claims: readonly string[]): boolean {
  return claims.some((c) => target === c || target.startsWith(`${c.replace(/\/$/, "")}/`));
}

/**
 * `true` when this checkout is the engine repository rather than a customer's
 * scaffold. `.github/sync-excludes.txt` is the mirror's own exclude list: it is
 * itself mirror-excluded, so no scaffold and no fork cut from the template ever
 * has it. Tests that reason about the engine's file set skip on `false` instead
 * of failing in a customer's repo — the same lesson as #550/#551.
 */
export const isEngineCheckout = existsSync(
  path.join(REPO_ROOT, ".github", "sync-excludes.txt"),
);
