import "server-only";

import type { SceneId } from "./scene-ids";

/**
 * B3 static seam variant — Live Canvas config resolution WITHOUT the
 * three-scenes plugin (site-profile program). The materializer copies this
 * file over `lib/three/resolve.ts` when the three-scenes plugin is not in
 * the profile; NOTHING imports it in the shipped engine (byte-identical
 * until then).
 *
 * No plugin → no scene config to resolve. The default shape matches the db
 * variant's fallback so shared callers (the db homepage passes it into
 * DesignHomepageProps.threeD) keep compiling; the static ThreeHero renders
 * nothing regardless.
 */
export type ThreeDConfig = {
  scene: SceneId;
  intensity: number;
  paletteSource: "theme" | "custom";
};

const DEFAULT_CONFIG: ThreeDConfig = {
  scene: "aurora",
  intensity: 0.6,
  paletteSource: "theme",
};

export async function getActiveThreeDConfig(): Promise<ThreeDConfig> {
  return DEFAULT_CONFIG;
}

export function invalidateThreeDCache(): void {
  // No store without the plugin.
}
