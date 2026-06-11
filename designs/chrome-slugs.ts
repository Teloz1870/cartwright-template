/**
 * Which designs OWN their site-wide chrome (Shell / Header / Footer from
 * designs/types.ts) instead of rendering inside the shared engine chrome?
 *
 * CLIENT-SAFE mirror of the packs' `Shell`/`Header`/`Footer` fields — the
 * packs themselves transitively import server-only code, so anything that
 * needs this answer without a server context (the marketplace manifest,
 * gallery UIs) reads this set instead. Keep in sync when a new pack ships
 * its own chrome (grep: `Shell` / `Header:` / `Footer:` in designs/<slug>/index.ts).
 */
export const CHROME_DESIGN_SLUGS: ReadonlySet<string> = new Set([
  "halo",
  "flux",
  "drive",
  "aerospace",
  "fable",
  "apex",
  "studio",
  "engineered",
  "nocturne",
  "meridian",
  "editorial-ink",
  "brutalist",
  "jungle",
  "stillwater",
  "blank",
]);

export function designHasOwnChrome(slug: string): boolean {
  return CHROME_DESIGN_SLUGS.has(slug);
}
