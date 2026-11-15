/**
 * design-import — cartwright-plugin-v1 (core-audit §2 №15).
 *
 * "Pull a palette from a URL": /admin/design-import lets the owner point at an
 * inspiration site; Firecrawl fetches it, the chat model derives a Cartwright
 * palette (+ font/tone hints), and one click applies it as the live theme
 * (BrandingSettings.themeJson, audited + revertible). Vibe-clone only
 * (colors/typography/tone), never layout. Needs FIRECRAWL_API_KEY — fail-soft
 * with a readable message when unset.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Honest core boundary (documented deviations from a "move everything" cut):
 *  - `lib/firecrawl.ts` + `lib/scrape/` STAY CORE — shared Firecrawl machinery
 *    (decided in the hoptify extraction, #243); the hoptify plugin and this
 *    plugin both consume it from core. No Firecrawl SDK exists (plain fetch),
 *    so there is no dep to declare either.
 *  - `lib/theme.ts` STAYS CORE — ThemePalette/isValidHex/invalidateThemeCache
 *    are the engine's theme machinery (voices, compositions, three.js apply).
 *  - The `design.import_from_url` TOOL stays core: lib/tools/design.ts is a
 *    mixed core tool-registry module (layout tools live there too); it reaches
 *    the implementation through the lib/design-import shims.
 *  - No prismaFragment: applyDesignPalette writes BrandingSettings.themeJson —
 *    a core column shared with voices/compositions/design packs.
 *  - Flag metadata (brand.config.ts + lib/feature-flags/manifest.ts) and the
 *    nav entry in lib/admin/nav.ts stay core (adminNav below is informational
 *    in v1). Pre-existing behavior preserved unchanged: core gates neither the
 *    nav entry nor the page on `designImport` — the flag is catalogue metadata
 *    today; the page + server actions are requireAdmin-guarded (the guards
 *    moved verbatim and are regression-tested in tests/unit/plugins.test.ts).
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const designImportPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "design-import",
  name: "Design import",
  description:
    "Pull a color palette from any URL into your shop: Firecrawl fetches the page, AI derives a Cartwright palette, and you apply it as the live theme. Design vibe only (colors/typography/tone) — not layout. Requires FIRECRAWL_API_KEY.",
  version: "1.0.0",
  flag: "designImport",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/design-import/manifest.ts" },
    { path: "plugins/design-import/lib/extract.ts" },
    { path: "plugins/design-import/lib/apply.ts" },
    { path: "plugins/design-import/admin/DesignImportAdminPage.tsx" },
    { path: "plugins/design-import/admin/DesignImportForm.tsx" },
    { path: "plugins/design-import/admin/actions.ts" },
    // Import-path shims (core design tools, the hoptify plugin + tests import these).
    { path: "lib/design-import/extract.ts" },
    { path: "lib/design-import/apply.ts" },
    { path: "app/admin/design-import/actions.ts" },
    { path: "app/admin/design-import/DesignImportForm.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/design-import/page.tsx" },
  ],
  routeMounts: [
    {
      mount: "app/admin/design-import/page.tsx",
      from: "plugins/design-import/admin/DesignImportAdminPage.tsx",
      exports: ["default"],
    },
  ],
  adminNav: [{ href: "/admin/design-import", label: "Design import" }],
  // No deps: Firecrawl is reached via plain fetch in core lib/firecrawl.ts (no
  // SDK), and `ai` + `zod` are baseline core deps every scaffold ships.
};
