import { CompositionSchema, type Composition } from "./spec";

/**
 * Project a full composition export down to its PUBLIC subset — the sharing
 * boundary for the unauthenticated /api/look endpoint (lookSharing flag).
 *
 * Kept: skin, palette, scene, chrome (+ schema/name/description) — the look.
 * Dropped: voice (identity + genomeOverrides = the shop's written copy) and
 * homepageLayout (the Visual Builder tree). A remixer gets the look, never
 * the words. Pure function so the boundary is unit-testable without a DB.
 *
 * The projection is re-validated against CompositionSchema (round-trip
 * guarantee): the public artifact must always be importable.
 */
export function toPublicLook(full: Composition): Composition {
  const candidate = {
    schema: full.schema,
    name: full.name,
    description: full.description,
    skin: full.skin,
    ...(full.palette ? { palette: full.palette } : {}),
    ...(full.scene ? { scene: full.scene } : {}),
    ...(full.chrome ? { chrome: full.chrome } : {}),
  };
  return CompositionSchema.parse(candidate);
}
