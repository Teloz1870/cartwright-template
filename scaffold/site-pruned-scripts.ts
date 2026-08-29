/**
 * Dev-only scripts that a `--profile site` materialization deletes.
 *
 * Each one imports something the site profile prunes — Playwright, Prisma, the
 * Turso client — so a site scaffold that kept them would ship scripts it cannot
 * run, and (for the .ts ones) files that do not typecheck against the site tree.
 *
 * THE POINT OF THIS FILE is that there is exactly one list. It used to be
 * written out by hand in two repositories — `scripts/site-profile-audit.ts`
 * here and `SITE_PRUNED_SCRIPTS` in the CLI's materializer — with nothing
 * checking that they agreed. Two hand-mirrored lists is the same defect class
 * that produced two red releases: a value asserted in one place and set in
 * another. The engine declares what it prunes; the CLI reads it from
 * `scaffold/manifest.json`.
 *
 * Adding a script here is enough. Do not copy it anywhere.
 */
export const SITE_PRUNED_SCRIPTS: readonly string[] = [
  "scripts/capture-gallery.mjs",
  "scripts/capture-locales.mjs",
  "scripts/dev-screenshot.mjs",
  "scripts/admin-reset.ts",
  "scripts/backfill-embeddings.ts",
  "scripts/backfill-media-assets.ts",
  "scripts/backup-turso.ts",
  "scripts/db-setup.ts",
  "scripts/design-import.ts",
  "scripts/gen-marketplace-manifests.ts",
  "scripts/migrate-turso.ts",
  "scripts/p2k-scan.ts",
  "scripts/pgvector-setup.ts",
  "scripts/publish-agent-card.ts",
  "scripts/restore-turso.ts",
  "scripts/build-registry-source.ts",
];
