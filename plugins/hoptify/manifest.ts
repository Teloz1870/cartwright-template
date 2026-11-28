/**
 * hoptify — cartwright-plugin-v1 (plugin wave 4, core-audit §2 №16).
 *
 * The parody-with-teeth "Hop off Shopify" onboarding: `/admin/hoptify` runs the
 * migration theatre and — with a valid store URL + FIRECRAWL_API_KEY — actually
 * pulls the palette (design-import) and products (scraper), then applies the
 * Hoptify design. Audit scope: `lib/hoptify` 1 file, inbound 7; owner call per
 * core-audit §4 №3 resolved as "keep as a fun installable plugin".
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Honest core boundary (documented deviations from a "move everything" cut):
 *  - `designs/hoptify/` STAYS A DESIGN PACK — design packs are design-system
 *    material (registered in designs/index.ts + designs/options.ts, pruned/kept
 *    via the profile's `keptDesigns`), not plugin files. The plugin's migrate
 *    flow sets `designSlug: "hoptify"` through the core BrandingSettings row;
 *    on a scaffold without the pack the design system falls back gracefully.
 *  - `lib/design-import/` + `lib/scrape/` STAY CORE — shared Firecrawl
 *    machinery owned by the `designImport` feature (core-audit §2 №15); the
 *    plugin imports them from core like any other consumer.
 *  - Flag metadata (brand.config.ts + lib/feature-flags/manifest.ts) and the
 *    nav entry in lib/admin/nav.ts stay core, same as every other plugin
 *    (adminNav below is informational in v1).
 *
 * Schema note: `MigrationJob` is plugin-exclusive (zero core code reads it —
 * it is the reserved persistence for the async job/terminal-view version of the
 * migration), so it is declared honestly below. v1 install never mutates
 * schema; the fragment surfaces as a "run pnpm db:push" note.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const hoptifyPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "hoptify",
  name: "Hoptify (Hop off Shopify)",
  description:
    "Parody “import from Shopify” onboarding with real teeth: the /admin/hoptify migration theatre applies the Hoptify design, and with a Firecrawl key it actually imports your palette and products.",
  version: "1.0.0",
  flag: "hoptify",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/hoptify/manifest.ts" },
    { path: "plugins/hoptify/lib/migrate.ts" },
    { path: "plugins/hoptify/admin/HoptifyAdminPage.tsx" },
    { path: "plugins/hoptify/admin/HopMigrate.tsx" },
    { path: "plugins/hoptify/admin/actions.ts" },
    // Import-path shims (existing scaffolds + tests import these).
    { path: "lib/hoptify/migrate.ts" },
    { path: "app/admin/hoptify/actions.ts" },
    { path: "app/admin/hoptify/HopMigrate.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/hoptify/page.tsx" },
  ],
  routeMounts: [
    {
      mount: "app/admin/hoptify/page.tsx",
      from: "plugins/hoptify/admin/HoptifyAdminPage.tsx",
      exports: ["default"],
    },
  ],
  adminNav: [{ href: "/admin/hoptify", label: "Hop off Shopify 🐸" }],
  prismaFragment: `// Hoptify-migrationsjob (reserveret til den asynkrone job/terminal-visning af
// "Hop off Shopify"-flowet). Plugin-eksklusiv: ingen core-kode læser modellen.
model MigrationJob {
  id           String   @id @default(cuid())
  status       String   @default("PENDING") // PENDING | SCRAPING | IMPORTING | DONE | FAILED
  sourceUrl    String
  email        String
  storeName    String?
  productCount Int      @default(0)
  logJson      String? // JSON-array of log entries for the terminal view
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}`,
};
