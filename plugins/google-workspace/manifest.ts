/**
 * google-workspace — cartwright-plugin-v1 (core-audit §2 №19).
 *
 * The Google Workspace bundle: ONE shared OAuth2 connector (PKCE consent →
 * token exchange → refresh → revoke, persisted in the singleton
 * `GoogleConnection` row) serving THREE workspace features — Sheets catalog
 * sync (`sheetsSync`, /admin/sheets + cron), Docs import (`docsImport`,
 * /admin/docs-import), and Drive media-import + DB-backup (`googleDrive`,
 * /admin/drive + cron). Connect/disconnect UI lives on the core
 * /admin/integrations page (reaches the connector through the lib shims).
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * THE FLAG-BUNDLE DECISION (v1 manifests carry exactly ONE `flag`; this
 * bundle has three): `flag: "sheetsSync"` is the designated flag-bearer —
 * the audit's suggested primary (`googleAuth`) turned out NOT to belong to
 * this bundle at all (see below), and among the three real flags none
 * depends on another, so the largest feature carries the manifest flag.
 * Honest consequences, by design rather than by accident:
 *  - install/uninstall via /api/admin/plugins toggles `sheetsSync` ONLY;
 *    `docsImport` and `googleDrive` keep gating their features individually
 *    in /admin/features (unchanged runtime behavior).
 *  - the plugin gallery's enabled-state reflects `sheetsSync` only.
 * The alternative — an umbrella flag the three `dependsOn` — was rejected:
 * it would CHANGE live gating semantics in a pure-refactor PR.
 *
 * Audit-drift note: core-audit №19 listed `googleAuth` as the bundle's
 * fourth flag ("one connector, four features"). Verified false: `googleAuth`
 * is the NextAuth "Continue with Google" CUSTOMER login provider in core
 * lib/auth.ts — compile-time tier (validateToggle rejects it, so v1
 * install/uninstall could never toggle it), zero imports of lib/google/*,
 * and prisma/schema.prisma documents GoogleConnection as "Not customer Sign
 * in with Google". It stays core; only the env keys are shared with Google
 * the vendor.
 *
 * Honest core boundary (documented deviations from a "move everything" cut):
 *  - `lib/tools/{google,sheets,docs,drive}.ts` STAY CORE — the AI tool
 *    surface is registered in lib/tools/registry.ts like every other tool
 *    family; the tools reach the plugin through the lib shims (same pattern
 *    as the logo-generator settings page).
 *  - `app/admin/integrations/*` STAYS CORE — the page hosts many
 *    integrations; its Google panel imports the connector via the
 *    lib/google/oauth shim.
 *  - `lib/backup/dump.ts` STAYS CORE — shared logical-dump machinery also
 *    used by the core /api/cron/backup (Vercel Blob) job; only the
 *    Drive-upload leg moved.
 *  - vercel.json keeps the /api/cron/drive-backup schedule (mount path is
 *    unchanged). /api/cron/sheets-sync is mounted but unscheduled, as
 *    before (external trigger / manual).
 *  - Flag metadata (brand.config.ts + lib/feature-flags/manifest.ts) stays
 *    core, same as every other plugin.
 *  - No adminNav: the three admin pages are deliberately NOT in NAV_GROUPS
 *    (lib/admin/nav.ts folds them into /admin/integrations).
 *
 * Schema note: `GoogleConnection` is plugin-exclusive — its only direct
 * readers are the plugin's oauth.ts/client.ts; core (integrations actions,
 * the google.connect_status tool) reads connection state through the
 * connector's exported functions. Declared honestly below; v1 install never
 * mutates schema (surfaces as a "run pnpm db:push" note).
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const googleWorkspacePlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "google-workspace",
  name: "Google Workspace (Sheets, Docs, Drive)",
  description:
    "One shared Google OAuth2 connector serving three workspace features: two-way Google Sheets catalog sync (admin page + cron), Google Docs import to blog posts/pages, and Google Drive media import + scheduled logical DB backups.",
  version: "1.0.0",
  flag: "sheetsSync",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/google-workspace/manifest.ts" },
    { path: "plugins/google-workspace/lib/google/oauth.ts" },
    { path: "plugins/google-workspace/lib/google/client.ts" },
    { path: "plugins/google-workspace/lib/google/scopes.ts" },
    { path: "plugins/google-workspace/lib/google/sheets.ts" },
    { path: "plugins/google-workspace/lib/google/docs.ts" },
    { path: "plugins/google-workspace/lib/google/drive.ts" },
    { path: "plugins/google-workspace/lib/sheets-sync.ts" },
    { path: "plugins/google-workspace/lib/drive-import.ts" },
    { path: "plugins/google-workspace/lib/drive-backup.ts" },
    { path: "plugins/google-workspace/admin/sheets/SheetsAdminPage.tsx" },
    { path: "plugins/google-workspace/admin/sheets/actions.ts" },
    { path: "plugins/google-workspace/admin/docs-import/DocsImportPage.tsx" },
    { path: "plugins/google-workspace/admin/docs-import/DocsImportForm.tsx" },
    { path: "plugins/google-workspace/admin/docs-import/actions.ts" },
    { path: "plugins/google-workspace/admin/drive/DriveAdminPage.tsx" },
    { path: "plugins/google-workspace/admin/drive/actions.ts" },
    { path: "plugins/google-workspace/api/oauth-initiate.ts" },
    { path: "plugins/google-workspace/api/oauth-callback.ts" },
    { path: "plugins/google-workspace/api/sheets-sync-cron.ts" },
    { path: "plugins/google-workspace/api/drive-backup-cron.ts" },
    // Import-path shims (existing scaffolds, core tools + integrations page,
    // and tests import these).
    { path: "lib/google/oauth.ts" },
    { path: "lib/google/client.ts" },
    { path: "lib/google/scopes.ts" },
    { path: "lib/google/sheets.ts" },
    { path: "lib/google/docs.ts" },
    { path: "lib/google/drive.ts" },
    { path: "lib/sheets/sync.ts" },
    { path: "lib/media/google-drive-import.ts" },
    { path: "lib/backup/google-drive.ts" },
    { path: "app/admin/sheets/actions.ts" },
    { path: "app/admin/docs-import/actions.ts" },
    { path: "app/admin/docs-import/DocsImportForm.tsx" },
    { path: "app/admin/drive/actions.ts" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/sheets/page.tsx" },
    { path: "app/admin/docs-import/page.tsx" },
    { path: "app/admin/drive/page.tsx" },
    { path: "app/api/google/oauth/initiate/route.ts" },
    { path: "app/api/google/oauth/callback/route.ts" },
    { path: "app/api/cron/sheets-sync/route.ts" },
    { path: "app/api/cron/drive-backup/route.ts" },
  ],
  routeMounts: [
    {
      mount: "app/admin/sheets/page.tsx",
      from: "plugins/google-workspace/admin/sheets/SheetsAdminPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/docs-import/page.tsx",
      from: "plugins/google-workspace/admin/docs-import/DocsImportPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/drive/page.tsx",
      from: "plugins/google-workspace/admin/drive/DriveAdminPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/api/google/oauth/initiate/route.ts",
      from: "plugins/google-workspace/api/oauth-initiate.ts",
      exports: ["GET"],
    },
    {
      mount: "app/api/google/oauth/callback/route.ts",
      from: "plugins/google-workspace/api/oauth-callback.ts",
      exports: ["GET"],
    },
    {
      mount: "app/api/cron/sheets-sync/route.ts",
      from: "plugins/google-workspace/api/sheets-sync-cron.ts",
      exports: ["GET"],
    },
    {
      mount: "app/api/cron/drive-backup/route.ts",
      from: "plugins/google-workspace/api/drive-backup-cron.ts",
      exports: ["GET"],
    },
  ],
  // No adminNav: the sheets/docs-import/drive pages are deliberately not in
  // NAV_GROUPS — lib/admin/nav.ts folds them into /admin/integrations.
  prismaFragment: `// Singleton Google Workspace OAuth2 connection for server-side API modules
// (Sheets/Drive/Docs). Not customer Sign in with Google.
model GoogleConnection {
  id Int @id @default(1)

  accountEmail      String?
  grantedScopesJson String?
  refreshTokenEnc   String?
  accessTokenEnc    String?
  tokenExpiresAt    DateTime?
  status            String    @default("disconnected")
  lastError         String?
  connectedAt       DateTime?
  updatedAt         DateTime  @updatedAt
}`,
  // `@vercel/blob` is used by the Drive media-import (upload to Blob). It is
  // a SHARED CORE dep today (lib/backup, media import, contact/admin upload
  // routes also import it) — declared so the light scaffold knows the plugin
  // needs it if core ever drops it, NOT as a plugin-exclusive dep.
  deps: [{ name: "@vercel/blob" }],
};
