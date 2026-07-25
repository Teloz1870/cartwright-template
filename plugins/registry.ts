/**
 * The plugin catalogue — single source of truth for which cartwright-plugin-v1
 * plugins the engine ships. Everything derives from this list:
 *
 *  - marketplace-manifest.json `plugins` (gen-marketplace-manifests.ts) — the
 *    cartwright.app plugin gallery,
 *  - /api/admin/plugins (install state + install/uninstall),
 *  - the `npx cartwright add <slug>` CLI (cartwright-app follow-up) — it reads
 *    the published manifest to know which files/flag/schema a plugin carries.
 *
 * CLIENT-SAFE: registry + manifests are pure data (no component imports, no
 * server-only) — the same registry pattern as designs/options and
 * lib/builder/chrome-catalog.
 *
 * Adding a plugin = add its manifest under plugins/<slug>/manifest.ts and
 * register it here; tests/unit/plugins.test.ts enforces the invariants
 * (schema-valid, unique slugs, real flag, files exist on disk, mounts wired).
 */
import {
  toCatalogueEntry,
  type CartwrightPluginManifest,
  type PluginCatalogueEntry,
} from "@/lib/plugins/spec";
import { phoneWidgetPlugin } from "./phone-widget/manifest";
import { wishlistPlugin } from "./wishlist/manifest";
import { blogPlugin } from "./blog/manifest";
import { reviewsPlugin } from "./reviews/manifest";
import { threeScenesPlugin } from "./three-scenes/manifest";
import { hoptifyPlugin } from "./hoptify/manifest";
import { logoGeneratorPlugin } from "./logo-generator/manifest";
import { designImportPlugin } from "./design-import/manifest";
import { googleWorkspacePlugin } from "./google-workspace/manifest";

export const PLUGINS: readonly CartwrightPluginManifest[] = [
  phoneWidgetPlugin,
  wishlistPlugin,
  blogPlugin,
  reviewsPlugin,
  threeScenesPlugin,
  hoptifyPlugin,
  logoGeneratorPlugin,
  designImportPlugin,
  googleWorkspacePlugin,
];

export function getPluginManifest(slug: string): CartwrightPluginManifest | undefined {
  return PLUGINS.find((p) => p.slug === slug);
}

/** Compact entries for the marketplace manifest / plugin gallery. */
export function pluginCatalogue(): PluginCatalogueEntry[] {
  return PLUGINS.map(toCatalogueEntry);
}
