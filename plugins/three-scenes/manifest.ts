/**
 * three-scenes — cartwright-plugin-v1 (plugin wave 3, core-audit §6b №5).
 *
 * The Live Canvas 3D system: the nine three.js scenes (aurora, waves, orb,
 * gridflow, butterflies, …) + shared GLSL noise, the WebGL2 renderer/frame-loop
 * plumbing, the <ThreeHero>/<DesignHero> mount components design packs use,
 * the `/admin/three-d` config page and the `/scene-preview` gallery route.
 * Audit scope: `lib/three` 15 files, inbound 55 — dropping this plugin drops
 * the HEAVIEST client dependency (`three` + `@types/three`) from the light
 * scaffold; every 3D-capable design pack already has a CSS-gradient fallback,
 * so a pruned scaffold renders the same hero minus the canvas overlay.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Storefront mount note: design packs render `<ThreeHero>`/`<DesignHero>`
 * behind `brand.features.threeD` (gate at the mount site, e.g.
 * `threeD?.enabled && <ThreeHero …/>` in aurora-site) — reached through the
 * `@/components/{ThreeHero,DesignHero,LiveCanvas}` shims. v1 keeps those
 * hand-wired mounts; slot-host mounting is the parked Phase-1 spec follow-up.
 *
 * Honest core boundary (documented deviations from a "move everything" cut):
 *  - `lib/three/types.ts` STAYS CORE — `SceneId` is core vocabulary
 *    (designs/types.ts, verticals/types.ts, compositions carry a `scene`).
 *  - `lib/three/resolve.ts` + `lib/three/apply.ts` STAY CORE — thin config
 *    plumbing over the core `BrandingSettings.threeDConfigJson` column,
 *    consumed by the core homepage, compositions apply/export and
 *    verticals/apply. They read scene ids through the registry shim.
 *  - The registry shim (`lib/three/scenes/registry.ts`) is therefore
 *    load-bearing for core validation/manifest generation; a future
 *    catalog-split (core scene metadata vs plugin loaders) is the prune-time
 *    follow-up.
 *
 * Schema note: no Prisma fragment — the `threeDConfigJson` column lives on the
 * core `BrandingSettings` model and stays in the core schema (same call as
 * phone-widget's workspace-id column).
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const threeScenesPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "three-scenes",
  name: "Live Canvas (3D)",
  description:
    "AI-configurable three.js hero scenes (aurora, waves, orb, butterflies and more): palette-driven WebGL2 backdrops for any design pack, with an admin scene picker and a full-bleed scene-preview route.",
  version: "1.0.0",
  flag: "threeD",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/three-scenes/manifest.ts" },
    { path: "plugins/three-scenes/lib/renderer.ts" },
    { path: "plugins/three-scenes/lib/loop.ts" },
    { path: "plugins/three-scenes/scenes/registry.ts" },
    { path: "plugins/three-scenes/scenes/glsl-noise.ts" },
    { path: "plugins/three-scenes/scenes/aurora.ts" },
    { path: "plugins/three-scenes/scenes/blob.ts" },
    { path: "plugins/three-scenes/scenes/butterflies.ts" },
    { path: "plugins/three-scenes/scenes/floating-geometry.ts" },
    { path: "plugins/three-scenes/scenes/gridflow.ts" },
    { path: "plugins/three-scenes/scenes/orb.ts" },
    { path: "plugins/three-scenes/scenes/particles.ts" },
    { path: "plugins/three-scenes/scenes/waves.ts" },
    { path: "plugins/three-scenes/scenes/wireframe.ts" },
    { path: "plugins/three-scenes/components/LiveCanvas.tsx" },
    { path: "plugins/three-scenes/components/ThreeHero.tsx" },
    { path: "plugins/three-scenes/components/DesignHero.tsx" },
    { path: "plugins/three-scenes/admin/ThreeDAdminPage.tsx" },
    { path: "plugins/three-scenes/admin/ThreeDForm.tsx" },
    { path: "plugins/three-scenes/admin/actions.ts" },
    { path: "plugins/three-scenes/pages/ScenePreviewPage.tsx" },
    // Import-path shims (design packs + core plumbing import these).
    { path: "components/ThreeHero.tsx" },
    { path: "components/DesignHero.tsx" },
    { path: "components/LiveCanvas.tsx" },
    { path: "lib/three/renderer.ts" },
    { path: "lib/three/loop.ts" },
    { path: "lib/three/scenes/registry.ts" },
    { path: "lib/three/scenes/glsl-noise.ts" },
    { path: "lib/three/scenes/aurora.ts" },
    { path: "lib/three/scenes/blob.ts" },
    { path: "lib/three/scenes/butterflies.ts" },
    { path: "lib/three/scenes/floating-geometry.ts" },
    { path: "lib/three/scenes/gridflow.ts" },
    { path: "lib/three/scenes/orb.ts" },
    { path: "lib/three/scenes/particles.ts" },
    { path: "lib/three/scenes/waves.ts" },
    { path: "lib/three/scenes/wireframe.ts" },
    { path: "app/admin/three-d/actions.ts" },
    { path: "app/admin/three-d/ThreeDForm.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/admin/three-d/page.tsx" },
    { path: "app/[locale]/scene-preview/page.tsx" },
  ],
  routeMounts: [
    {
      mount: "app/admin/three-d/page.tsx",
      from: "plugins/three-scenes/admin/ThreeDAdminPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/[locale]/scene-preview/page.tsx",
      from: "plugins/three-scenes/pages/ScenePreviewPage.tsx",
      exports: ["default"],
    },
  ],
  adminNav: [{ href: "/admin/three-d", label: "Live Canvas (3D)" }],
  // The heaviest client dependency in the engine — the whole point of this
  // plugin: a light scaffold without three-scenes ships no three.js at all.
  deps: [{ name: "three" }, { name: "@types/three" }],
};
