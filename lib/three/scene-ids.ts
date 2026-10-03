/**
 * SceneId — the Live Canvas scene union, extracted into a dependency-free
 * module (B3 site-profile slice).
 *
 * `lib/three/types.ts` (the full contracts file) imports `three` for its
 * renderer/palette types, which makes it unusable in a materialized profile
 * that ships neither the three.js dependency nor the three-scenes plugin.
 * Design packs and `designs/types.ts` only ever need the ID union — so the
 * union lives here, and `lib/three/types.ts` re-exports it (every existing
 * `import type { SceneId } from "@/lib/three/types"` keeps working).
 *
 * Add a new scene = add the union member here + the registry entry + the
 * scene module (exactly as before).
 */
export type SceneId =
  | "floating-geometry"
  | "particles"
  | "blob"
  | "wireframe"
  | "aurora"
  | "waves"
  | "orb"
  | "gridflow"
  | "butterflies";
