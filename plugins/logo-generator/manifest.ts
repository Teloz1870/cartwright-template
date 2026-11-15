/**
 * logo-generator — cartwright-plugin-v1.
 *
 * The AI logo surface in /admin/indstillinger: the LogoForm panel (upload +
 * SVG outline editor), the admin-guarded SVG outline-logo endpoint
 * (POST /api/admin/generate-logo), and the flag-gated Gemini raster generator
 * (`features.logoGenerator`): prompt → gemini-2.5-flash-image → Vercel Blob →
 * BrandingSettings.logoImageUrl. Needs a Gemini key (/admin/integrations or
 * GOOGLE_GEMINI_API_KEY) + BLOB_READ_WRITE_TOKEN.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Core-coupling note (honest deviations, left in core):
 *  - `lib/ai/gemini.ts` (the Gemini client layer) is SHARED core — media
 *    alt-text, embeddings and the media-ai cron also use it. The plugin
 *    reaches it through the core module; it is NOT a plugin file.
 *  - Logo PERSISTENCE stays core: `updateLogoSettings` /
 *    `updateBrandingSettings` in app/admin/indstillinger/actions.ts and the
 *    BrandingSettings logo columns (logoMarkPaths/logoImageUrl/…) are core
 *    branding — only GENERATION is the plugin. Hence no prismaFragment.
 *  - The settings page (app/admin/indstillinger/page.tsx) renders LogoForm
 *    through the shim and passes `logoGeneratorEnabled` from the flag — core
 *    stays untouched.
 *  - The security test tests/unit/admin-api-auth.test.ts resolves the
 *    generate-logo route mount to the plugin impl, where the
 *    requireAdminApi() guard lives (must never be removed).
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const logoGeneratorPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "logo-generator",
  name: "Logo generator (AI)",
  description:
    "AI logo tools for the admin settings page: an outline-logo generator (SVG paths via the chat model) and a flag-gated Gemini raster generator that uploads to Vercel Blob and sets the brand logo.",
  version: "1.0.0",
  flag: "logoGenerator",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/logo-generator/manifest.ts" },
    { path: "plugins/logo-generator/lib/logo-gen.ts" },
    { path: "plugins/logo-generator/admin/LogoForm.tsx" },
    { path: "plugins/logo-generator/admin/actions.ts" },
    { path: "plugins/logo-generator/api/generate-logo.ts" },
    // Import-path shims (existing scaffolds + the settings page import these).
    { path: "lib/ai/logo-gen.ts" },
    { path: "app/admin/indstillinger/LogoForm.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/api/admin/generate-logo/route.ts" },
  ],
  routeMounts: [
    {
      mount: "app/api/admin/generate-logo/route.ts",
      from: "plugins/logo-generator/api/generate-logo.ts",
      exports: ["POST"],
    },
  ],
  // No adminNav: the UI lives inside the core /admin/indstillinger page
  // (Branding tab), not on a plugin-owned admin route.
  //
  // `@vercel/blob` is used by the Gemini-raster upload. It is a SHARED CORE
  // dep today (lib/backup, media import, contact/admin upload routes also
  // import it) — declared here so the light scaffold knows the plugin needs
  // it if core ever drops it, NOT as a plugin-exclusive dep. `@google/genai`
  // is deliberately NOT declared: the plugin never imports it directly, it
  // goes through the shared core lib/ai/gemini.ts.
  deps: [{ name: "@vercel/blob" }],
};
