import type { SceneId } from "@/lib/three/scene-ids";

/**
 * B3 static seam variant — the Live Canvas mount WITHOUT the three-scenes
 * plugin (site-profile program). The materializer copies this file over
 * `components/ThreeHero.tsx` when the three-scenes plugin is not in the
 * profile; NOTHING imports it in the shipped engine (byte-identical until
 * then).
 *
 * Design packs mount the 3D hero flag-gated
 * (`brand.features.threeD && <ThreeHero … />`) and every pack keeps its own
 * CSS/gradient background as the fallback — so rendering nothing here is the
 * exact render the full engine gives with the flag off, WebGL unsupported,
 * or reduced motion. Props match the plugin component so packs compile
 * unchanged.
 */
export function ThreeHero({
  scene,
  intensity,
  className,
}: {
  scene: SceneId;
  intensity: number;
  className?: string;
}) {
  void scene;
  void intensity;
  void className;
  return null;
}
